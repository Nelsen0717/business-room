#!/usr/bin/env python3
"""原助手讀取工作台脈絡與有來源發布。不讀憑證。"""
import argparse,json,pathlib,time,urllib.request,urllib.parse,subprocess,sys,os

def runtime(workspace):
    rt=json.loads((workspace/".工作台入口.json").read_text())
    address=urllib.parse.urlparse(rt["base"])
    if address.scheme!="http" or address.hostname not in {"127.0.0.1","localhost"} or not address.port or address.username or address.path not in {"","/"}:
        raise ValueError("工作台入口必須是本機位址，請重新啟動。")
    return rt

def call(rt,route,body=None):
    headers={"Authorization":"Bearer "+rt["token"],"X-Workbench":"1","Content-Type":"application/json"}
    req=urllib.request.Request(rt["base"]+route,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)

def open_workspace(workspace):
    if (workspace/".工作台入口.json").exists():
        rt=runtime(workspace)
        try:call(rt,"/api/state");return rt
        except (OSError,ValueError):pass
    server=workspace/".business-room/server.py"
    if not server.exists():
        from install import install
        install(workspace)
    fd=os.open(workspace/".工作台日誌",os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
    with os.fdopen(fd,"a") as log:
        process=subprocess.Popen([sys.executable,str(server),'--workspace',str(workspace)],
            stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    for _ in range(80):
        try:
            rt=runtime(workspace);call(rt,"/api/state");return rt
        except (OSError,ValueError,KeyError):pass
        if process.poll() is not None:break
        time.sleep(.1)
    raise ValueError("尚未開啟，請讓原助手檢查這個資料夾的 .工作台日誌。原資料仍保留。")

def main():
    p=argparse.ArgumentParser(); p.add_argument("--workspace",required=True);p.add_argument("command",choices=["context","wait","publish","open","handoff","resume","configure","map"]);p.add_argument("--file");p.add_argument("--after",type=int,default=-1);p.add_argument("--timeout",type=int,default=45);a=p.parse_args()
    workspace=pathlib.Path(a.workspace).expanduser().resolve()
    payload=json.loads(pathlib.Path(a.file).read_text()) if a.file else None
    if a.command in {'handoff','open'} and payload is not None:
        from onboarding import validate
        validate(payload)
    try:rt=open_workspace(workspace) if a.command in {'open','map'} else runtime(workspace)
    except ValueError as e:p.error(str(e))
    if a.command=='configure':
        if not isinstance(payload,dict) or payload.get('confirmed') is not True or not isinstance(payload.get('quote'),str) or not payload['quote'].strip():
            p.error('請先說明會使用自己的助手額度，取得本人的選擇；--file 包含 confirmed:true 與本人確認原話 quote。')
        config={k:payload[k] for k in ('mode','prepare_imports','prepare_results') if k in payload}
        result=call(rt,'/api/companion/configure',config)
        print(json.dumps({'ok':True,'mode':result['state']['companion']['mode'],'revision':result['state']['revision']},ensure_ascii=False));return
    if a.command in {'handoff','open'}:
        if a.command=='handoff' and payload is None:p.error('handoff 需要 --file')
        if payload is not None:call(rt,'/api/agent/handoff',payload)
        result=call(rt,'/api/agent/resume')
        print(json.dumps({'url':rt['base']+'/#token='+rt['token'],**result},ensure_ascii=False,indent=2));return
    if a.command=='resume':
        print(json.dumps(call(rt,'/api/agent/resume'),ensure_ascii=False,indent=2));return
    if a.command=="map":
        if not a.file:p.error("map 需要 --file（這次長出來的那幾塊）")
        from contextmap import validate as validate_map
        try:validate_map(payload)
        except ValueError as e:p.error(str(e))
        result=call(rt,"/api/agent/map",payload)
        print(json.dumps({"ok":True,**{k:result[k] for k in ("revision","map_revision","sections")},"url":rt["base"]+"/#token="+rt["token"]},ensure_ascii=False));return
    if a.command=="publish":
        if not a.file:p.error("publish 需要 --file")
        result=call(rt,"/api/agent/publish",payload)
        print(json.dumps({"ok":True,"revision":result["state"]["revision"]},ensure_ascii=False));return
    end=time.monotonic()+max(0,min(a.timeout,55))
    while True:
        s=call(rt,"/api/state")["state"]
        s.pop("demo_snapshots",None)
        if a.command!="wait" or s["revision"]>a.after or time.monotonic()>=end:
            print(json.dumps(s,ensure_ascii=False,indent=2));return
        time.sleep(1)
if __name__=="__main__":main()
