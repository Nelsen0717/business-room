#!/usr/bin/env python3
"""經營室。本機 HTTP / 工作資料；所有外部請求固定到官方服務。"""
import argparse, copy, hashlib, http.cookies, json, mimetypes, os, pathlib, secrets, threading, time
import urllib.request, urllib.error, urllib.parse, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from domain import empty, mutate, import_csv, parse_csv, publish, record, uid, now
from catalog import CATALOG, BY_ID
from interview import SECTIONS
from companion import Companion, ensure, apply, resolve, finish
from onboarding import handoff, resume
from workcycle import table_csv

ROOT=pathlib.Path(__file__).resolve().parent
MAX_BODY=1_000_000
def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    tmp=path.with_name(path.name+".tmp")
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as f: json.dump(data,f,ensure_ascii=False,indent=2)
    os.chmod(tmp,0o600); os.replace(tmp,path)

class Workspace:
    def __init__(self,path,vault):
        self.path=pathlib.Path(path).resolve(); self.path.mkdir(parents=True,exist_ok=True)
        self.file=self.path/"經營資料.json"; self.lock=threading.RLock(); self.vault=pathlib.Path(vault)
        self.state=json.loads(self.file.read_text()) if self.file.exists() else empty()
        if self.state.get("schema")!="youfeng.studio/1": raise ValueError("資料版本不符，請先保留原資料並交由助手檢查。")
        self.keys=json.loads(self.vault.read_text()) if self.vault.exists() else {}
        for turn in ensure(self.state)['turns']:
            if turn.get('runtime'):turn['runtime']['active']=False
        for turn in list(ensure(self.state)['turns']):
            if turn['status']=='running':
                self.state=finish(self.state,turn['id'],'error','上次回應因工作台關閉而中斷；原提問與材料已保留，可手動再試一次。')
        self.companion=Companion(self)
        self.token=secrets.token_urlsafe(32)
        atomic(self.file,self.state)
    def update(self,fn):
        with self.lock:
            self.state=fn(self.state); atomic(self.file,self.state)
            return copy.deepcopy(self.state)
    def snapshot(self):
        with self.lock: return copy.deepcopy(self.state)
    def save_key(self,pid,key):
        if pid not in {"google_places","notion"}: raise ValueError("這項連接目前不接收金鑰。")
        if not isinstance(key,str) or not 8<=len(key.strip())<=4096 or any(c in key for c in "\r\n\x00"): raise ValueError("請確認金鑰內容。")
        with self.lock:
            self.keys[pid]=key.strip(); atomic(self.vault,self.keys)
            self.state["connections"][pid]={"status":"stored","at":now(),"message":"已儲存，尚未驗證"}
            self.state["revision"]+=1; atomic(self.file,self.state)
    def forget(self,pid):
        with self.lock:
            self.keys.pop(pid,None); atomic(self.vault,self.keys); self.state["connections"].pop(pid,None)
            self.state["revision"]+=1; atomic(self.file,self.state)
    def verified(self,pid,message):
        with self.lock:
            self.state["connections"][pid]={"status":"verified","at":now(),"message":message}
            self.state["revision"]+=1; atomic(self.file,self.state)
    def request(self,pid,path,body=None,headers=None):
        key=self.keys.get(pid)
        if not key: raise ValueError("請先在連接設定填入金鑰。")
        if pid=="notion":
            url="https://api.notion.com/v1/"+path
            h={"Authorization":"Bearer "+key,"Notion-Version":"2025-09-03"}
        elif pid=="google_places":
            url="https://places.googleapis.com/v1/places:searchText"; h={"X-Goog-Api-Key":key}
        else: raise ValueError("不支援的服務。")
        h.update(headers or {}); h["Content-Type"]="application/json"
        req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=h)
        try:
            with urllib.request.urlopen(req,timeout=15) as r:
                raw=r.read(3_000_001)
                if len(raw)>3_000_000: raise ValueError("服務回傳過大，請縮小範圍。")
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            # 不把 provider 錯誤全文、request headers 或金鑰帶到模型／瀏覽器。
            labels={401:"金鑰無效或已到期",403:"尚未授權，或服務／帳務未開啟",404:"找不到資料，請確認已分享給這個連接",429:"服務用量已達限制，請稍後再試"}
            raise ValueError(labels.get(e.code,f"外部服務暫時無法讀取（HTTP {e.code}）")) from None
        except (urllib.error.URLError,TimeoutError): raise ValueError("連線逾時或無法連到服務，原資料仍保留。") from None
    def notion_test(self):
        data=self.request("notion","users/me"); self.verified("notion","已驗證 Notion 帳號；頁面仍需逐一授權")
        return {"name":data.get("name") or "已授權的 Notion 帳號"}
    def notion_pages(self):
        data=self.request("notion","search",{"page_size":30,"filter":{"value":"page","property":"object"}})
        items=[]
        for p in data.get("results",[]):
            title="未命名頁面"
            for prop in p.get("properties",{}).values():
                if prop.get("type")=="title": title="".join(t.get("plain_text","") for t in prop.get("title",[])) or title
            items.append({"id":p["id"],"name":title,"url":p.get("url","")})
        self.verified("notion","已讀取授權頁面清單")
        return {"items":items,"has_more":bool(data.get("has_more"))}
    def notion_import(self,pageid):
        if not isinstance(pageid,str) or len(pageid) not in (32,36) or any(c not in "0123456789abcdefABCDEF-" for c in pageid): raise ValueError("頁面 ID 不符。")
        data=self.request("notion",f"blocks/{pageid}/children?page_size=100")
        chunks=[]; nested=False
        for b in data.get("results",[]):
            kind=b.get("type",""); text="".join(t.get("plain_text","") for t in b.get(kind,{}).get("rich_text",[]))
            if text: chunks.append(text)
            nested=nested or b.get("has_children",False)
        if not chunks: raise ValueError("這一頁沒有可匯入的頂層文字；子頁面或資料庫請由助手讀取。")
        content="\n".join(chunks)
        if nested or data.get("has_more"): content+="\n［本次只讀取前 100 個頂層區塊；子頁面或後續區塊尚未匯入。］"
        s=self.update(lambda s:mutate(s,"material",{"name":"Notion 頁面・"+pageid[:8],"content":content}))
        return {"state":s,"partial":bool(nested or data.get("has_more"))}
    def places(self,query):
        if not isinstance(query,str) or not 2<=len(query.strip())<=200: raise ValueError("請輸入地區與商家類型。")
        data=self.request("google_places","",{"textQuery":query.strip(),"languageCode":"zh-TW","pageSize":10}, {"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri"})
        self.verified("google_places","已成功執行商家搜尋")
        return {"items":[{"id":p.get("id"),"name":p.get("displayName",{}).get("text","未命名"),"address":p.get("formattedAddress",""),"lat":p.get("location",{}).get("latitude"),"lng":p.get("location",{}).get("longitude"),"url":p.get("googleMapsUri","")} for p in data.get("places",[])],"query":query,"at":now()}

def make_server(workspace,port=0):
    class Handler(BaseHTTPRequestHandler):
        server_version="BusinessStudio"
        def log_message(self,*_): pass
        def valid_host(self):
            return self.headers.get("Host") in {f"127.0.0.1:{self.server.server_port}",f"localhost:{self.server.server_port}"}
        def authorized(self):
            bearer=self.headers.get("Authorization","").removeprefix("Bearer ")
            c=http.cookies.SimpleCookie()
            try:c.load(self.headers.get("Cookie",""))
            except http.cookies.CookieError: return False
            cookie=c.get("yf_"+workspace.token[:8]); cookie=cookie.value if cookie else ""
            return any(secrets.compare_digest(x,workspace.token) for x in [bearer,cookie] if x)
        def respond(self,status,data,headers=None):
            raw=json.dumps(data,ensure_ascii=False).encode()
            self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            for k,v in (headers or {}).items():self.send_header(k,v)
            self.end_headers(); self.wfile.write(raw)
        def do_GET(self):
            if not self.valid_host(): return self.respond(403,{"error":"只接受本機工作台入口。"})
            route=urllib.parse.urlparse(self.path).path
            if route.startswith("/api/"):
                if not self.authorized(): return self.respond(401,{"error":"請由原助手或工作台啟動檔重新開啟。"})
                if route=="/api/state": return self.respond(200,{"state":workspace.snapshot(),"catalog":CATALOG,"interview_catalog":SECTIONS})
                if route=="/api/agent/resume":return self.respond(200,resume(workspace.snapshot()))
                if route=="/api/export": return self.respond(200,workspace.snapshot(),{"Content-Disposition":"attachment; filename=business.json"})
                if route=="/api/companion/status":return self.respond(200,workspace.companion.status())
                return self.respond(404,{"error":"找不到這個入口。"})
            name="index.html" if route=="/" else route.lstrip("/")
            p=(ROOT/"public"/name).resolve()
            if not p.is_relative_to((ROOT/"public").resolve()) or not p.is_file():return self.respond(404,{"error":"找不到檔案。"})
            raw=p.read_bytes(); self.send_response(200); self.send_header("Content-Type",(mimetypes.guess_type(str(p))[0] or "application/octet-stream")+"; charset=utf-8"); self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-cache")
            self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'")
            self.send_header("Referrer-Policy","strict-origin-when-cross-origin"); self.send_header("X-Content-Type-Options","nosniff"); self.end_headers(); self.wfile.write(raw)
        def do_POST(self):
            if not self.valid_host(): return self.respond(403,{"error":"只接受本機工作台入口。"})
            origin=self.headers.get("Origin")
            if origin and origin not in {f"http://127.0.0.1:{self.server.server_port}",f"http://localhost:{self.server.server_port}"}: return self.respond(403,{"error":"來源不符。"})
            if self.headers.get("Sec-Fetch-Site")=="cross-site" or self.headers.get("X-Workbench")!="1":return self.respond(403,{"error":"請使用工作台操作。"})
            if not self.authorized():return self.respond(401,{"error":"請重新開啟工作台。"})
            try:
                length=int(self.headers.get("Content-Length",0))
                if not 0<length<=MAX_BODY:return self.respond(413,{"error":"資料太大，請分批帶入。"})
                if self.headers.get("Content-Type","").split(";")[0]!="application/json":return self.respond(415,{"error":"資料格式不符。"})
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):raise ValueError("資料格式不符。")
                route=urllib.parse.urlparse(self.path).path
                if route=="/api/session":return self.respond(200,{"ok":True},{"Set-Cookie":f"yf_{workspace.token[:8]}={workspace.token}; HttpOnly; SameSite=Strict; Path=/"})
                if route=="/api/mutate":return self.respond(200,{"state":workspace.companion.mutate(data.get("op"),data.get("data",{}))})
                if route=="/api/csv/preview":return self.respond(200,{"rows":parse_csv(data.get("content",""))})
                if route=="/api/csv/import":return self.respond(200,{"state":workspace.companion.import_csv(data)})
                if route=="/api/connection/save":
                    workspace.save_key(data.get("id"),data.get("key"));return self.respond(200,{"state":workspace.snapshot()})
                if route=="/api/connection/forget":
                    workspace.forget(data.get("id"));return self.respond(200,{"state":workspace.snapshot()})
                if route=="/api/notion/test":return self.respond(200,workspace.notion_test())
                if route=="/api/notion/pages":return self.respond(200,workspace.notion_pages())
                if route=="/api/notion/import":return self.respond(200,workspace.notion_import(data.get("id")))
                if route=="/api/places":return self.respond(200,workspace.places(data.get("query")))
                if route=="/api/agent/publish":
                    def agent_update(s):
                        if any(data.get(k) for k in ['actions','people','layout','notes','read_requests','interview_answers','flows','observations']):s=publish(s,data)
                        if data.get('reply'):
                            reply=data['reply'];s=resolve(s,reply.get('request_id'),reply)
                        return s
                    return self.respond(200,{"state":workspace.update(agent_update)})
                if route=="/api/agent/handoff":return self.respond(200,{"state":workspace.update(lambda s:handoff(s,data))})
                if route=="/api/companion/configure":return self.respond(200,{"state":workspace.companion.configure(data.get('mode'),data.get('prepare_imports'),data.get('prepare_results'))})
                if route=="/api/observation/export":return self.respond(200,table_csv(workspace.snapshot(),data.get("id")))
                if route=="/api/companion/review-result":return self.respond(200,{"state":workspace.companion.review_result(data)})
                if route=="/api/companion/ask":return self.respond(200,{"state":workspace.companion.ask(data)})
                if route=="/api/companion/apply":return self.respond(200,{"state":workspace.update(lambda s:apply(s,data.get('id')))})
                if route=="/api/companion/dismiss":return self.respond(200,{"state":workspace.companion.dismiss(data.get("id"))})
                if route=="/api/companion/retry":return self.respond(200,{"state":workspace.companion.retry(data.get("id"))})
                if route=="/api/companion/cancel":return self.respond(200,{"state":workspace.companion.cancel(data.get('id'))})
                return self.respond(404,{"error":"找不到這個操作。"})
            except (ValueError,TypeError,KeyError) as e:return self.respond(400,{"error":str(e)[:250]})
            except Exception:return self.respond(500,{"error":"這次操作未完成，請保留畫面並告訴原助手。"})
    return ThreadingHTTPServer(("127.0.0.1",port),Handler)

def main():
    p=argparse.ArgumentParser();p.add_argument("--workspace",required=True);p.add_argument("--port",type=int,default=0);p.add_argument("--vault");p.add_argument("--open",action="store_true");a=p.parse_args()
    path=pathlib.Path(a.workspace).expanduser().resolve()
    if (ROOT.parent/"dashboard"/"CONTRACT.md").is_file() and (ROOT.parent==path or ROOT.parent in path.parents):p.error("經營資料請放在課程 repo 外的自己的資料夾。")
    runtime=path/".工作台入口.json"
    if runtime.exists():
        try:
            old=json.loads(runtime.read_text());address=urllib.parse.urlparse(old["base"])
            if address.scheme!="http" or address.hostname not in {"127.0.0.1","localhost"} or not address.port or address.username or address.path not in {"","/"}:raise ValueError("非本機入口")
            req=urllib.request.Request(old["base"]+"/api/state",headers={"Authorization":"Bearer "+old["token"]})
            with urllib.request.urlopen(req,timeout=1) as r: assert r.status==200
            print(json.dumps({"url":old["base"]+"/#token="+old["token"],"reused":True},ensure_ascii=False),flush=True)
            if a.open:webbrowser.open(old["base"]+"/#token="+old["token"])
            return
        except Exception:pass
    ident=hashlib.sha256(str(path).encode()).hexdigest()[:16]
    vault=a.vault or str(pathlib.Path.home()/"Library"/"Application Support"/"YoufengStudio"/ident/"credentials.json")
    w=Workspace(path,vault);server=make_server(w,a.port);base=f"http://127.0.0.1:{server.server_port}"
    atomic(runtime,{"base":base,"token":w.token,"pid":os.getpid()})
    url=base+"/#token="+w.token
    print(json.dumps({"url":url,"workspace":str(path)},ensure_ascii=False),flush=True)
    if a.open:webbrowser.open(url)
    w.companion.kick()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=="__main__":main()
