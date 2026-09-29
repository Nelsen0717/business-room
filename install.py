#!/usr/bin/env python3
"""把本版裝在唯一經營資料夾。無全域技能、系統設定或 npm 安裝。"""
import argparse,hashlib,json,os,pathlib,shlex,shutil,sys,time,uuid
ROOT=pathlib.Path(__file__).resolve().parent
INTERNAL=".business-room"
LEGACY=".youfeng"  # 2026-09 以前的隱藏資料夾名稱，裝新版時自動搬到 INTERNAL
FILES=["server.py","contextmap.py","redeem.py","domain.py","catalog.py","agent.py","companion.py","preparation.py","execution_contract.py","codex_runner.py","interview.py","scenarios.py","stores.py","onboarding.py","workcycle.py","README.md","資料與服務說明.md","地圖格式.md","地圖範例.json"]
def install(dest):
    if sys.version_info<(3,10):raise ValueError("需要 Python 3.10 以上，請讓助手先檢查目前的 Python。")
    dest=pathlib.Path(dest).expanduser().resolve()
    if ROOT==dest or ROOT in dest.parents or (ROOT.parent/"dashboard"/"CONTRACT.md").exists() and (ROOT.parent==dest or ROOT.parent in dest.parents): raise ValueError("請選課程 repo 外的經營資料夾。")
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
    launcher=dest/"打開經營室.command"
    launcher.write_text('#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\n'+shlex.quote(sys.executable)+' '+INTERNAL+'/server.py --workspace "$PWD" --open\n',encoding="utf-8");launcher.chmod(0o755)
    (dest/"打開經營室.bat").write_text('@echo off\r\ncd /d "%~dp0"\r\npy -3 '+INTERNAL+'\\server.py --workspace "%CD%" --open\r\npause\r\n',encoding="utf-8")
    prompt=(ROOT/'開始.md').read_text(encoding='utf-8')
    (dest/"開始.md").write_text(prompt.replace('说','說'),encoding="utf-8")
    manifest={str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    (dest/".安裝回執.json").write_text(json.dumps({"version":"v11-preview.1","files":manifest},ensure_ascii=False,indent=2))
    return {"ok":True,"workspace":str(dest),"files_verified":len(manifest),"start":"請讀開始.md，帶我開始。"}
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--workspace",required=True);a=p.parse_args();print(json.dumps(install(a.workspace),ensure_ascii=False))
