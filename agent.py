#!/usr/bin/env python3
"""原助手讀取工作台脈絡與有來源發布。不讀憑證。"""
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
import argparse,json,pathlib,time,urllib.request,urllib.error,urllib.parse,subprocess,sys,os

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

def explain(e):
    """伺服器擋下時（例如同一天第二次打烊、數字沒出處），把它的白話原因拿出來，不要只丟 HTTP 400。"""
    try:return json.loads(e.read().decode("utf-8")).get("error") or str(e)
    except Exception:return str(e)

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
    raise ValueError("尚未開啟，請讓原助手檢查這個資料夾的 .工作台日誌；程式檔被改壞的話，先跑 agent.py restore 換回原版再開。原資料仍保留。")

def restore(p,workspace):
    """程式檔被改壞時的退路（〈做成你的形狀.md〉「壞了怎麼救」）：只用標準函式庫，不靠伺服器。
    經營室開著的話，先請它自己換回原版（換回了 .py 它會原地重開）；接著不管開沒開，都從 .business-room/.原版/ 對一次指紋、換回還不對的。
    經營資料（經營資料.json、作品、模組說明）不碰。"""
    server=None
    try:
        rt=runtime(workspace)
        server=call(rt,"/api/integrity/restore",{})
    except Exception:server=None   # 沒開、開不起來、或連不上：照樣往下做，不靠它
    try:from install import restore_originals,restore_words
    except Exception:p.error("還原用的程式（.business-room/install.py）也讀不出來：請用課程資料夾裡的 install.py 重新安裝（經營資料不會動）。")
    out=restore_originals(workspace)
    if server:
        out["restored"]=sorted(set(server.get("restored") or [])|set(out["restored"]))
        out["moved"]=sorted(set(server.get("moved") or [])|set(out["moved"]))
        out["restart"]=out["restart"] or bool(server.get("restart"))
    restarting=bool(server and server.get("restarting"))
    out.update(restarting=restarting,next=restore_words(out,restarting=restarting,running=server is not None))
    print(json.dumps(out,ensure_ascii=False,indent=2))
    if out["failed"]:sys.exit(1)

def main():
    p=argparse.ArgumentParser(); p.add_argument("--workspace",required=True);p.add_argument("command",choices=["context","wait","publish","open","handoff","resume","configure","map","roster","restore"]);p.add_argument("--file");p.add_argument("--after",type=int,default=-1);p.add_argument("--timeout",type=int,default=45);p.add_argument("--check",action="store_true",help="map：只檢查格式、試合併，不寫進經營室");a=p.parse_args()
    workspace=pathlib.Path(a.workspace).expanduser().resolve()
    if a.command=='restore':return restore(p,workspace)
    payload=json.loads(pathlib.Path(a.file).read_text()) if a.file else None
    if a.command=='roster':
        # 客人名單：純計算、不用開經營室；週期不夠時用地圖上的 people.cycle.days
        from roster import load, analyze, summary
        cycle=None
        try:cycle=json.loads((workspace/'經營資料.json').read_text(encoding='utf-8')).get('map',{}).get('people',{}).get('cycle',{}).get('days')
        except (OSError,ValueError,AttributeError,TypeError):pass   # 地圖壞了就不用存著的週期，照名單自己算
        try:out=analyze(load(workspace/'客人名單.csv'),store_cycle=cycle)
        except ValueError as e:p.error(str(e))
        out['summary']=summary(out)
        if out['skipped']:
            # 有幾列沒算進去：先講清楚（印在錯誤輸出，JSON 照常印在標準輸出），改好名單再算一次
            print('注意：另有 %d 列沒算進去，名單可能少算；先照原因改好再算一次：'%len(out['skipped'])+'；'.join('第 %d 列 %s %s'%(x['row'],x['name'],x['why']) for x in out['skipped'][:5]),file=sys.stderr)
        print(json.dumps(out,ensure_ascii=False,indent=2));return
    if a.command=='map' and a.check:
        # 先驗不寫：照經營資料夾現在的資料試合併一次，擋得下的原因跟真的交時一樣；不開經營室、不動任何檔
        if not a.file:p.error("map 需要 --file（這次長出來的那幾塊）")
        from contextmap import merge as merge_map
        from domain import empty
        try:state=json.loads((workspace/'經營資料.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):state=empty()
        notes=[]
        if not isinstance(state,dict):state=empty()
        try:m=merge_map(state,payload,notes,workspace)['map']   # 照片檔也一起驗（跟真的交時一樣）
        except ValueError as e:p.error("這份地圖還交不進去："+str(e))
        except Exception as e:p.error("這份地圖還交不進去：檢查時出了錯（"+type(e).__name__+"），經營資料夾裡存著的資料可能被直接改壞了；先跑 agent.py open，照頂上那一句處理。")
        print(json.dumps({"ok":True,"check":True,"sections":sorted(k for k in payload if k in m and k!='sources'),**({"notes":notes} if notes else {})},ensure_ascii=False));return
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
        try:result=call(rt,"/api/agent/map",payload)
        except urllib.error.HTTPError as e:p.error("經營室沒有收這次的地圖："+explain(e))
        print(json.dumps({"ok":True,**{k:result[k] for k in ("revision","map_revision","sections")},**({"notes":result["notes"]} if result.get("notes") else {}),"url":rt["base"]+"/#token="+rt["token"]},ensure_ascii=False));return
    if a.command=="publish":
        if not a.file:p.error("publish 需要 --file")
        try:result=call(rt,"/api/agent/publish",payload)
        except urllib.error.HTTPError as e:p.error("經營室沒有收這次的發布："+explain(e))
        print(json.dumps({"ok":True,"revision":result["state"]["revision"]},ensure_ascii=False));return
    end=time.monotonic()+max(0,min(a.timeout,55))
    while True:
        r=call(rt,"/api/state");s=r["state"];pk=r.get("pack") or {}
        s.pop("demo_snapshots",None)
        s["fallback"],s["integrity"]=pk.get("fallback"),pk.get("integrity")   # 經營室自己的兩件事，不在經營資料.json 裡
        if a.command!="wait" or s["revision"]>a.after or time.monotonic()>=end:
            print(json.dumps(s,ensure_ascii=False,indent=2));return
        time.sleep(1)
if __name__=="__main__":main()
