#!/usr/bin/env python3
"""學員端：用課程碼向雲端服務換課程包，驗過雜湊才換上，只用標準函式庫。

流程：POST 課程碼給服務（`service/api/redeem.js`）→ 拿到 zip 與兩個標頭
（`X-Pack-Version`、`X-Pack-Sha256`）→ 整份 zip 先核一次 sha256 對不對得上標頭 →
解到暫存資料夾 → 逐檔核對 zip 裡 `manifest.json` 記的 sha256 → 全部核對通過才換上
`<workspace>/我的經營室/.business-room/pack/`（原本的那份留一份 `pack.prev/`）→
寫一份 `pack/installed.json`（版本、裝的時間、課程碼雜湊前 8 碼；不存明碼）。任何一步
核對不過，暫存資料夾直接丟掉、舊版原封不動，不會半途換掉一半。

用法：
    python3 redeem.py <課程碼>
    python3 redeem.py <課程碼> --workspace ~/文件
    python3 redeem.py <課程碼> --url http://127.0.0.1:8787/api/redeem   # 測試用

給之後接線用的兩個函式：`redeem(code, workspace, url)` 跟 `installed(workspace)`。
"""
import argparse
import datetime
import hashlib
import io
import json
import pathlib
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

# 之後主場次部署會確認實際網址，這裡先放預期的位置。
SERVICE_URL = "https://business-room-pack.vercel.app/api/redeem"
TIMEOUT = 20  # 秒


class RedeemError(Exception):
    """訊息（args[0]）已經是學員看得懂的一句話，接住直接印出來就好。"""


def normalize(code):
    """轉大寫、去空白與連字號。這裡只用來算本機留存的雜湊指紋；服務端才是真正比對
    課程碼對不對的地方（那邊還會加只有伺服器知道的 PEPPER，這裡沒有、也不需要）。"""
    return "".join(ch for ch in code.upper() if ch not in " \t\r\n-")


def _pack_dir(workspace):
    return pathlib.Path(workspace).expanduser().resolve() / "我的經營室" / ".business-room" / "pack"


def installed(workspace):
    """回目前裝好的 pack/installed.json 內容；還沒裝過或讀不出來就回 None。"""
    path = _pack_dir(workspace) / "installed.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _request(code, url):
    """呼叫服務，回 (zip 位元組, 標頭 dict[小寫 key])；不對就丟 RedeemError。"""
    body = json.dumps({"code": code}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST", headers={"Content-Type": "application/json; charset=utf-8"}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = resp.read()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return data, headers
    except urllib.error.HTTPError as e:
        message = None
        try:
            message = json.loads(e.read().decode("utf-8")).get("error")
        except (OSError, ValueError, AttributeError):
            pass
        finally:
            e.close()
        raise RedeemError(message or "課程包的服務暫時不能用，請稍後再試。") from None
    except (urllib.error.URLError, TimeoutError):
        raise RedeemError("連不上課程包的服務，等一下再試；網路要允許連線。") from None


_TAMPERED_MESSAGE = "課程包檔案好像被動過，已經停止安裝；原本的版本沒有被換掉。"


def _safe_member_names(names):
    """zip 裡每個檔名都要是乾淨的相對路徑，沒有絕對路徑、沒有 `..`——擋 zip-slip。"""
    for name in names:
        p = pathlib.PurePosixPath(name)
        if p.is_absolute() or ".." in p.parts:
            return False
    return True


def redeem(code, workspace, url=None):
    """用課程碼換課程包並換上。回傳 dict，不丟例外給呼叫端：
    成功 {"ok": True, "version":, "message":, "workspace":}；
    失敗 {"ok": False, "message":}。"""
    url = url or SERVICE_URL
    code = (code or "").strip()
    if not code:
        return {"ok": False, "message": "請輸入課程碼。"}

    try:
        zip_bytes, headers = _request(code, url)
    except RedeemError as e:
        return {"ok": False, "message": str(e)}

    # 便宜的第一關：整份 zip 對不對得上服務回的標頭，對不上就不必浪費力氣解壓。
    expected_zip_sha = headers.get("x-pack-sha256")
    if expected_zip_sha and hashlib.sha256(zip_bytes).hexdigest() != expected_zip_sha:
        return {"ok": False, "message": _TAMPERED_MESSAGE}

    pack_dir = _pack_dir(workspace)
    pack_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = pathlib.Path(tempfile.mkdtemp(prefix=".staging-", dir=str(pack_dir.parent)))

    try:
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                names = z.namelist()
                if not _safe_member_names(names):
                    return {"ok": False, "message": _TAMPERED_MESSAGE}
                manifest = json.loads(z.read("manifest.json"))
                pack_meta = json.loads(z.read("pack.json"))
                z.extractall(staging)
        except (zipfile.BadZipFile, KeyError, json.JSONDecodeError):
            return {"ok": False, "message": _TAMPERED_MESSAGE}

        for name, expected_hash in manifest.items():
            target = staging / name
            if not target.is_file():
                return {"ok": False, "message": _TAMPERED_MESSAGE}
            if hashlib.sha256(target.read_bytes()).hexdigest() != expected_hash:
                return {"ok": False, "message": _TAMPERED_MESSAGE}

        # 全部核對通過，這裡才真的動舊版：舊的 pack/ 搬成 pack.prev/（只留一份），
        # 再把暫存資料夾換成新的 pack/。兩步都是同一層目錄內的 rename，各自是原子操作；
        # 兩步之間極短的窗口理論上仍可能被例外打斷，跟這包東西本來的風險等級相稱，
        # 沒有再往上加鎖或雙寫日誌。
        prev_dir = pack_dir.with_name("pack.prev")
        if prev_dir.exists():
            shutil.rmtree(prev_dir)
        if pack_dir.exists():
            pack_dir.rename(prev_dir)
        staging.rename(pack_dir)
    finally:
        if staging.exists():  # 成功時 staging 已經被 rename 掉、這裡就不會存在
            shutil.rmtree(staging, ignore_errors=True)

    version = pack_meta.get("version", "unknown")
    installed_record = {
        "version": version,
        "installed_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        # 服務端比對用的雜湊有加只存在伺服器的 PEPPER，這裡沒有 PEPPER，算不出同一個值；
        # 這個欄位只是本機的指紋，用來之後對「這次裝的是哪組碼」，不是安全邊界。
        "code_hash_prefix": hashlib.sha256(normalize(code).encode("utf-8")).hexdigest()[:8],
    }
    (pack_dir / "installed.json").write_text(
        json.dumps(installed_record, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {
        "ok": True,
        "version": version,
        "message": "課程包裝好了，版本 %s。" % version,
        "workspace": str(pack_dir),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="用課程碼換課程包。")
    parser.add_argument("code", help="課程碼，例如 ABCD-2345-WXYZ")
    parser.add_argument(
        "--workspace", default=".",
        help="學員開的資料夾（會在裡面建「我的經營室」；預設目前所在的資料夾）",
    )
    parser.add_argument("--url", default=None, help="服務網址（測試用；預設 SERVICE_URL）")
    args = parser.parse_args(argv)

    result = redeem(args.code, args.workspace, args.url)
    print(result["message"])
    if result["ok"]:
        info = installed(args.workspace)
        if info:
            print(json.dumps(info, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
