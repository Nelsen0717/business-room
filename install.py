#!/usr/bin/env python3
"""把本版裝在唯一經營資料夾。無全域技能、系統設定或 npm 安裝。"""
import sys
if __name__ == "__main__" and sys.path and not getattr(sys.flags, "safe_path", 0):
    # 找模組的順序：標準函式庫 → 經營室自己這一層（.business-room/）→ 其他（PYTHONPATH、套件）。
    # 資料夾裡多出來的 json.py 蓋不掉標準函式庫，PYTHONPATH 裡同名的 domain.py 也蓋不掉經營室自己的；
    # 程式被改壞時 agent.py restore、install.py 還跑得動。agent、install、server、redeem 四支入口同一段
    # 標準函式庫在哪：Python 的安裝位置，加上啟動時就載入的 os 所在的那一層（Homebrew 這類安裝，安裝位置是捷徑、sys.path 寫的是實際位置）
    _here = sys.path.pop(0)
    _roots, _os = {sys.base_prefix, sys.base_exec_prefix}, sys.modules.get("os")
    if _os is not None and getattr(_os, "__file__", None):
        _roots |= {_os.path.realpath(sys.base_prefix), _os.path.realpath(sys.base_exec_prefix), _os.path.dirname(_os.path.dirname(_os.__file__))}
    _lib = [_p for _p in sys.path if _p and _p.startswith(tuple(_roots)) and "-packages" not in _p]
    sys.path[:] = _lib + [_here] + [_p for _p in sys.path if _p not in _lib]
import argparse,hashlib,json,os,pathlib,shlex,shutil,stat,sys,time,uuid
ROOT=pathlib.Path(__file__).resolve().parent
INTERNAL=".business-room"
LEGACY=".youfeng"  # 2026-09 以前的隱藏資料夾名稱，裝新版時自動搬到 INTERNAL
ORIGINAL=".原版"  # 程式檔的原版（還原用），不算進安裝回執
MODS="模組"  # 內建模組庫：裝到 .business-room/模組/，小二只讀不改；14 份處方在課程包（redeem 換到後裝），公開版只有說明
VERSION="v14.0-preview.1"
FILES=["server.py","contextmap.py","redeem.py","domain.py","catalog.py","agent.py","companion.py","preparation.py","execution_contract.py","codex_runner.py","interview.py","scenarios.py","stores.py","onboarding.py","workcycle.py","shape.py","README.md","資料與服務說明.md","地圖格式.md","地圖範例.json","例行.md","做成你的形狀.md","roster.py","install.py","虛構演練材料.md","找客人的門路.md"]
def install_mods(target):
    """內建模組（樂高）：逐檔複製、不整個刪掉。這一版帶了哪幾份就換那幾份（公開版只有模組/README.md）；
    課程包裝過（.business-room/pack/模組/）的處方，這一版沒帶的就從課程包補上。模組檔都不在也照樣裝好。
    他自己長的在「我的經營室/模組/」，這裡不碰。"""
    sources=[d for d in (ROOT/MODS,target/"pack"/MODS) if d.is_dir()]
    if not sources:return 0
    (target/MODS).mkdir(exist_ok=True);done=set()
    for d in sources:
        for f in sorted(d.glob("*.md")):
            if f.name in done or f.name.startswith("."):continue
            shutil.copy2(f,target/MODS/f.name);done.add(f.name)
    return len(done)
# ── 程式檔壞了的退路：只用標準函式庫，不靠伺服器（伺服器可能就是被改壞、開不起來的那一個）──
# 規則跟 shape.Integrity.restore 一樣（tests/test_v14_hardening.py 對兩邊跑同一組改壞的檔，結果要一樣）：
# 安裝回執記的程式檔，被改過、不見了 → 從 .business-room/.原版/<指紋> 換回（原版的指紋要對得上才換）；
# 多出來的程式檔（.business-room/ 底下的 .py 這類、public/ 底下任何檔）→ 搬到 .備份/，不刪。
RECEIPT=".安裝回執.json";BACKUP=".備份"
SKIP_TOP={"模組","pack","pack.prev","__pycache__",ORIGINAL}
CODE_SUFFIXES={".py",".pyc",".pyo",".pth",".so",".pyd",".dylib"}
def _in_scope(rel):
    parts=rel.split("/")
    return not (parts[0] in SKIP_TOP or parts[0].startswith(".staging-") or "__pycache__" in parts)
def _sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1<<16),b""):h.update(chunk)
    return h.hexdigest()
def _write(path,raw,mode):
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+".tmp")
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,mode)
    with os.fdopen(fd,"wb") as f:f.write(raw)
    os.chmod(tmp,mode);os.replace(tmp,path)
def restore_originals(dest):
    """把經營室的程式檔換回安裝時的原版。回 {ok, restored, moved, failed, restart}；restart＝換回了 .py，經營室要重開才用得到。
    經營資料（經營資料.json、作品、模組說明）一律不碰。"""
    dest=pathlib.Path(dest).expanduser().resolve();target=dest/INTERNAL
    restored,moved,failed=[],[],[]
    try:
        files=json.loads((dest/RECEIPT).read_text(encoding="utf-8"))["files"]
        files={k.replace("\\","/"):v for k,v in files.items() if isinstance(k,str) and isinstance(v,str) and _in_scope(k.replace("\\","/"))}
    except (OSError,ValueError,KeyError,TypeError,AttributeError):
        return {"ok":False,"restored":restored,"moved":moved,"failed":[RECEIPT],"restart":False}
    changed=[]
    for rel,sha in sorted(files.items()):
        p=target/rel
        try:
            st=os.lstat(p)
            if not stat.S_ISREG(st.st_mode) or _sha(p)!=sha:changed.append(rel)
        except OSError:changed.append(rel)
    extras=[]
    try:
        for p in target.iterdir():
            if p.name not in files and p.suffix in CODE_SUFFIXES and (p.is_file() or p.is_symlink()):extras.append(p.name)
        if (target/"public").is_dir():
            for p in (target/"public").rglob("*"):
                rel=p.relative_to(target).as_posix()
                if rel not in files and p.name!=".DS_Store" and (p.is_file() or p.is_symlink()):extras.append(rel)
    except OSError:pass
    stamp=time.strftime("%Y%m%d-%H%M%S")+"-"+uuid.uuid4().hex[:6]
    for rel in sorted(set(extras)):
        try:
            to=dest/BACKUP/(stamp+"-多出來的程式檔")/rel;to.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(target/rel),str(to));moved.append(rel)
        except OSError:failed.append(rel)
    for rel in changed:
        p=target/rel;blob=target/ORIGINAL/files[rel]
        try:raw=blob.read_bytes()
        except OSError:failed.append(rel);continue
        if hashlib.sha256(raw).hexdigest()!=files[rel]:failed.append(rel);continue
        try:
            if p.is_symlink() or (p.exists() and not p.is_file()):
                to=dest/BACKUP/(stamp+"-被換掉的程式檔")/rel;to.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(p),str(to))
            _write(p,raw,stat.S_IMODE(blob.stat().st_mode) or 0o644);restored.append(rel)
        except OSError:failed.append(rel)
    code=[r for r in restored+moved if pathlib.PurePosixPath(r).suffix in CODE_SUFFIXES]
    return {"ok":not failed,"restored":restored,"moved":moved,"failed":failed,"restart":bool(code)}
def restore_words(out,restarting=False,running=False):
    """給小二轉述的一句：換回了什麼、接下來怎麼做。"""
    if out["failed"]:
        return f"有 {len(out['failed'])} 個檔還原不了：用課程資料夾裡的 install.py 重新安裝一次（他的經營資料不會動）。"
    n=len(out["restored"])+len(out["moved"])
    if not n:return "程式檔都是安裝時的原版，不用還原。"
    then="經營室正在重開，幾秒後右邊那一頁會自己接回來。" if restarting else "經營室還開著舊的那一份：關掉再用 agent.py open 打開。" if running and out["restart"] else "用 agent.py open 打開經營室就好。"
    return f"程式換回安裝時的樣子了（{n} 個檔），他的經營資料沒有動。"+then
def install(dest):
    if sys.version_info<(3,10):raise ValueError("需要 Python 3.10 以上，請讓助手先檢查目前的 Python。")
    dest=pathlib.Path(dest).expanduser().resolve()
    if ROOT==dest or ROOT in dest.parents or (ROOT.parent/"dashboard"/"CONTRACT.md").exists() and (ROOT.parent==dest or ROOT.parent in dest.parents): raise ValueError("請選課程 repo 外的經營資料夾。")
    if (dest/INTERNAL).resolve()==ROOT:
        # 在經營資料夾裡直接跑它自己的 install.py（.business-room/install.py）：自己複製到自己會出錯，改成從 .原版/ 換回程式檔
        out=restore_originals(dest)
        return {**out,"workspace":str(dest),"next":restore_words(out)}
    dest.mkdir(parents=True,exist_ok=True);target=dest/INTERNAL;legacy=dest/LEGACY
    if legacy.is_dir():
        if target.exists():(dest/".備份").mkdir(exist_ok=True);shutil.move(str(legacy),str(dest/".備份"/(time.strftime("%Y%m%d-%H%M%S")+"-舊版程式")))
        else:legacy.rename(target)
    target.mkdir(exist_ok=True)
    if (target/"server.py").exists():
        backup=dest/".備份"/(time.strftime("%Y%m%d-%H%M%S")+"-"+uuid.uuid4().hex[:6]);shutil.copytree(target,backup)
    for f in FILES:shutil.copy2(ROOT/f,target/f)
    shutil.copytree(ROOT/"public",target/"public",dirs_exist_ok=True)
    shutil.copytree(ROOT/"schema",target/"schema",dirs_exist_ok=True)
    install_mods(target)
    (dest/"收件匣"/"已讀").mkdir(parents=True,exist_ok=True)
    # 排程那一場沒有安裝時的記憶：把這次用的 Python 寫下來，例行.md 指向這裡
    (target/"python.txt").write_text(sys.executable+"\n",encoding="utf-8")
    launcher=dest/"打開經營室.command"
    launcher.write_text('#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\n'+shlex.quote(sys.executable)+' '+INTERNAL+'/server.py --workspace "$PWD" --open\n',encoding="utf-8");launcher.chmod(0o755)
    (dest/"打開經營室.bat").write_text('@echo off\r\ncd /d "%~dp0"\r\npy -3 '+INTERNAL+'\\server.py --workspace "%CD%" --open\r\npause\r\n',encoding="utf-8")
    prompt=(ROOT/'開始.md').read_text(encoding='utf-8')
    (dest/"開始.md").write_text(prompt.replace('说','說'),encoding="utf-8")
    manifest={str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file() and '__pycache__' not in p.parts and ORIGINAL not in p.parts}
    # v14：程式檔的原版照指紋另存一份（.business-room/.原版/），經營室啟動時比對指紋、被改過可以還原
    from shape import keep_originals
    keep_originals(target,manifest)
    (dest/".安裝回執.json").write_text(json.dumps({"version":VERSION,"files":manifest},ensure_ascii=False,indent=2))
    return {"ok":True,"workspace":str(dest),"files_verified":len(manifest),"start":"請讀開始.md，帶我開始。"}
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--workspace",required=True);a=p.parse_args();out=install(a.workspace);print(json.dumps(out,ensure_ascii=False))
    if out.get("ok") is False:print(out.get("next") or "還原沒有完成。",file=sys.stderr);sys.exit(1)
