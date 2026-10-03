#!/usr/bin/env python3
"""經營室。本機 HTTP / 工作資料；所有外部請求固定到官方服務。"""
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
import argparse, copy, errno, socket, hashlib, http.cookies, json, mimetypes, os, pathlib, re, secrets, sys, threading, time
import urllib.request, urllib.error, urllib.parse, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from domain import empty, mutate, import_csv, parse_csv, publish, record, uid, now, SCHEMA, LEGACY_SCHEMAS
from catalog import CATALOG, BY_ID
from interview import SECTIONS
from companion import Companion, ensure, apply, resolve, finish
from onboarding import handoff, resume
from contextmap import merge as merge_map, act as act_map, set_companion, companion_view, StaleCompanion
from contextmap import set_layout, StaleLayout, StaleModule, module_pause, module_act, module_revert, SLUG
from workcycle import table_csv
import shape

ROOT=pathlib.Path(__file__).resolve().parent
MAX_BODY=1_000_000
# 網址上的鑰匙換成 cookie 後留多久：鑰匙本身跟著經營室走（重開沿用），cookie 也就不用每次重換
COOKIE_AGE=30*24*3600
TOKEN_OK=re.compile(r"^[A-Za-z0-9_-]{32,128}$")
# index.html 底部那一段最小的救援（app.js 自己壞了時，還按得到「還原成原版」）：CSP 只放行這一段的指紋，不開 'unsafe-inline'。
# 改了那一段要一起改這裡（tests/test_v14_hardening.py 會重算一次對）
RESCUE="'sha256-0zfJz49LFmNfWHyz5Hd1pgFbWYLzoz6Kxyh7Eypr2eA='"
PORTS=(38000,48000)   # 第一次開時，照資料夾算出一個固定的埠；之後照入口檔沿用
def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    tmp=path.with_name(path.name+".tmp")
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as f: json.dump(data,f,ensure_ascii=False,indent=2)
    os.chmod(tmp,0o600); os.replace(tmp,path)

FAMILIES={x.rsplit("/",1)[0] for x in {SCHEMA,*LEGACY_SCHEMAS}}
def other_version(schema):
    """認得的別的版本：同一家（business-room.studio、youfeng.studio）、但不是這一版讀得了的。"""
    return isinstance(schema,str) and schema!=SCHEMA and schema not in LEGACY_SCHEMAS and schema.rsplit("/",1)[0] in FAMILIES

def finite(x):
    """回給瀏覽器的 JSON 不能有 Infinity、NaN（瀏覽器的 JSON.parse 會整份失敗）：換成 null。"""
    if isinstance(x,float):return x if x==x and x not in (float("inf"),float("-inf")) else None
    if isinstance(x,dict):return {k:finite(v) for k,v in x.items()}
    if isinstance(x,(list,tuple)):return [finite(v) for v in x]
    return x

def parsed(raw):
    """經營資料.json 的內容：讀得出來而且是一份資料（dict）才回，不然回 None（交給 shape.recover 換回舊版）。"""
    try:data=json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError,ValueError):return None
    return data if isinstance(data,dict) else None

class Workspace:
    def __init__(self,path,vault,token=None):
        self.path=pathlib.Path(path).resolve(); self.path.mkdir(parents=True,exist_ok=True)
        self.file=self.path/"經營資料.json"; self.lock=threading.RLock(); self.vault=pathlib.Path(vault)
        raw=self.file.read_bytes() if self.file.exists() else None
        state=empty() if raw is None else parsed(raw)
        if state is not None:
            if state.get("schema") in LEGACY_SCHEMAS: state["schema"]=SCHEMA
            # 只有「認得、但是別的版本」（例如比較新的經營室存的）才拒絕，原檔不動；少了 schema、外層被改壞的，交給下面換回舊版
            if other_version(state.get("schema")): raise ValueError("資料版本不符，請先保留原資料並交由助手檢查。")
        # v14：讀檔也跑進門的那一套檢查。對話裡的小二可能不經過這裡直接改檔；跟經營室自己最後存的那一份（.舊版/）比，
        # 改出新的問題就換回那一份，原檔留著，pack.fallback 講一句白話。外層形狀不對、檔案不見了，也是換回那一份
        self.state,self.fallback=shape.recover(self.path,state,raw,SCHEMA)
        for k,v in empty().items():self.state.setdefault(k,v)   # 少了的外層格補空的（不然之後讀到那一格就出錯）
        self.keys=json.loads(self.vault.read_text()) if self.vault.exists() else {}
        for turn in ensure(self.state)['turns']:
            if turn.get('runtime'):turn['runtime']['active']=False
        for turn in list(ensure(self.state)['turns']):
            if turn['status']=='running':
                self.state=finish(self.state,turn['id'],'error','上次回應因工作台關閉而中斷；原提問與材料已保留，可手動再試一次。')
        self.companion=Companion(self)
        # 鑰匙跟著這個經營室走：重開時沿用入口檔裡那一把，右邊那一頁、小二手上的網址都不會因為重開就失效
        self.token=token if isinstance(token,str) and TOKEN_OK.match(token) else secrets.token_urlsafe(32)
        atomic(self.file,self.state)
        try:
            if not shape.same_as_latest(self.path,self.state):shape.snapshot(self.path,self.state)
        except OSError:pass
        # 程式檔的指紋：安裝時記在 .安裝回執.json，啟動時比一次（之後每次讀狀態再比，沒變的檔不重算）
        self.integrity=shape.Integrity(self.path); self.integrity_lock=threading.Lock()
    def update(self,fn,archive=True):
        with self.lock:
            old=self.state;new=fn(old)
            if archive:
                # 內容有變的模組，存著的那一份先留進「模組/.舊版/<編號>/」（回到上一版用）
                try:shape.archive_mods(self.path,old.get("map"),new.get("map"))
                except OSError:pass
            self.state=new; atomic(self.file,self.state)
            if old.get("map")!=new.get("map"):
                try:shape.snapshot(self.path,new)   # 地圖每變一次留一份在 .舊版/（最近十份）：讀檔時拿它當「經營室自己最後存的」比對
                except OSError:pass
            return copy.deepcopy(self.state)
    def pack(self,state=None):
        """/api/state 的 pack。課程包（installed、version、tactics、mods）照舊，沒裝 installed 是 false；
        v14 多五樣：views（模組畫面算好的積木）、alerts（一行提醒）、integrity（程式檔指紋）、fallback（讀檔換回舊版了沒）、
        back（每個模組真的還有幾份上一版：{編號: 份數}，沒有的不列；畫面照它決定放不放「回到上一版」）。
        舊畫面用 `if (pack)` 判斷有沒有裝課程包，現在要改看 pack.installed。"""
        state=self.snapshot() if state is None else state
        d=self.path/".business-room"/"pack"
        try:meta=json.loads((d/"installed.json").read_text(encoding="utf-8"));installed=isinstance(meta,dict)
        except (OSError,ValueError):meta,installed={},False
        try:tactics=json.loads((d/"tactics.json").read_text(encoding="utf-8"))["tactics"] if installed else {}
        except (OSError,ValueError,KeyError,TypeError):tactics={}
        mods=sorted(f.stem for f in (self.path/".business-room"/"模組").glob("*.md") if f.stem!="README") if installed else []
        m=state.get("map") if isinstance(state.get("map"),dict) else {}
        views=shape.views(m)
        return {"installed":installed,"version":meta.get("version") if installed else None,"tactics":tactics,"mods":mods,
                "views":views,"alerts":shape.alerts(m,views),"integrity":self.check_integrity(),"fallback":self.fallback,"back":shape.backs(self.path,m)}
    def check_integrity(self):
        with self.integrity_lock:return self.integrity.check()
    def resume(self):
        """/api/agent/resume（agent.py resume、open）：接續摘要，加上經營室自己的兩件事——讀檔換回舊版了沒（fallback）、
        程式檔有沒有被改過（integrity）。daily 裡也放一份：小二開門、打烊照例行讀 daily，就讀得到。"""
        out=resume(self.snapshot());room={"fallback":self.fallback,"integrity":self.check_integrity()}
        out.update(room)
        if isinstance(out.get("daily"),dict):out["daily"].update(room)
        notes=[]
        if self.fallback:notes.append("經營室剛把經營資料換回上一份（fallback.reason）：照 fallback.detail 改好，用 agent.py map 交；不要直接改經營資料.json。")
        if room["integrity"].get("ok") is False and room["integrity"].get("checked") is not False:
            notes.append("經營室的程式檔被改過（integrity.changed）：先跑 agent.py restore 換回原版，不要自己改程式檔。")
        broken=(out.get("daily") or {}).get("broken")
        if broken:notes.append("經營資料裡這幾塊存著的格式不對（daily.broken："+"、".join(broken)+"）：照地圖格式整塊重交，不要直接改經營資料.json。")
        if notes:out["instruction"]="".join(notes)+out.get("instruction","")
        return out
    def revert_module(self,data):
        """回到上一版：拿「模組/.舊版/<編號>/」最新的一份放回去（同一套檢查）；現在這份另外留在「還原前/」。"""
        mid=data.get("id") if isinstance(data,dict) else None
        if not isinstance(mid,str) or not SLUG.match(mid):raise ValueError("找不到這個模組，可能剛被換掉了；請重新整理。")
        with self.lock:
            files=shape.versions(self.path,mid)
            if not files:raise ValueError("這個模組還沒有上一版可以回去。")
            try:old_item=json.loads(files[-1].read_text(encoding="utf-8"))
            except (OSError,ValueError):raise ValueError("上一版讀不出來；請小二重交這個模組。") from None
            cur=next((y for y in ((self.state.get("map") or {}).get("mods") or {}).get("items",[]) if y.get("id")==mid),None)
            s,item=module_revert(self.state,data,old_item)
            if cur is not None:shape.stash_undone(self.path,mid,cur)
            self.state=s;atomic(self.file,s)
            try:shape.snapshot(self.path,s)
            except OSError:pass
            files[-1].unlink()
            return copy.deepcopy(s),item
    def restore_program(self):
        with self.integrity_lock:return self.integrity.restore()
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
            try:raw=json.dumps(data,ensure_ascii=False,allow_nan=False).encode()
            except ValueError:   # 資料裡有無限大或 NaN（直接改檔寫進來的）：換成 null 再送，畫面照樣打得開
                print("回應裡有不是有限的數，已換成 null："+self.path.split("?")[0],file=sys.stderr,flush=True)
                raw=json.dumps(finite(data),ensure_ascii=False,allow_nan=False).encode()
            self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            for k,v in (headers or {}).items():self.send_header(k,v)
            self.end_headers(); self.wfile.write(raw)
        def do_GET(self):
            if not self.valid_host(): return self.respond(403,{"error":"只接受本機工作台入口。"})
            route=urllib.parse.urlparse(self.path).path
            if route.startswith("/api/"):
                if not self.authorized(): return self.respond(401,{"error":"請由原助手或工作台啟動檔重新開啟。"})
                if route=="/api/state":
                    s=workspace.snapshot()
                    return self.respond(200,{"state":s,"catalog":CATALOG,"interview_catalog":SECTIONS,"pack":workspace.pack(s)})
                if route=="/api/asset":return self.send_asset()
                if route=="/api/agent/resume":return self.respond(200,workspace.resume())
                if route=="/api/export": return self.respond(200,workspace.snapshot(),{"Content-Disposition":"attachment; filename=business.json"})
                if route=="/api/companion/status":return self.respond(200,workspace.companion.status())
                if route=="/api/companion":return self.respond(200,{"companion":companion_view(workspace.snapshot().get("map"))})
                return self.respond(404,{"error":"找不到這個入口。"})
            name="index.html" if route=="/" else route.lstrip("/")
            p=(ROOT/"public"/name).resolve()
            if not p.is_relative_to((ROOT/"public").resolve()) or not p.is_file():return self.respond(404,{"error":"找不到檔案。"})
            raw=p.read_bytes(); self.send_response(200); self.send_header("Content-Type",(mimetypes.guess_type(str(p))[0] or "application/octet-stream")+"; charset=utf-8"); self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-cache")
            self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self' "+RESCUE+"; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'")
            self.send_header("Referrer-Policy","strict-origin-when-cross-origin"); self.send_header("X-Content-Type-Options","nosniff"); self.end_headers(); self.wfile.write(raw)
        def send_asset(self):
            """GET /api/asset?f=作品/豆豆.jpg：只送 png、jpg、webp、mp4（看檔頭）；路徑展開後要在作品/底下；
            回應帶 CSP sandbox 與 nosniff，不讓檔案在這個網址底下跑程式；支援單一段 Range（影片拖拉用）。"""
            query=urllib.parse.urlparse(self.path).query
            try:query=query.encode("latin-1").decode("utf-8")   # 沒編碼的中文路徑：http.server 用 latin-1 讀進來，這裡轉回來
            except (UnicodeEncodeError,UnicodeDecodeError):pass
            values=urllib.parse.parse_qs(query,keep_blank_values=True).get("f",[])
            if len(values)!=1:return self.respond(400,{"error":"要指定一個檔案：f=作品/檔名。"})
            try:fh,kind,size=shape.open_asset(workspace.path,values[0])
            except shape.AssetError as e:return self.respond(e.status,{"error":e.message})
            with fh:
                start,end,partial=0,size-1,False
                rng=re.fullmatch(r"bytes=(\d*)-(\d*)",(self.headers.get("Range") or "").strip())
                if rng and (rng.group(1) or rng.group(2)):
                    if rng.group(1):start,end=int(rng.group(1)),min(int(rng.group(2) or size-1),size-1)
                    else:start,end=max(0,size-int(rng.group(2))),size-1
                    if start>end or start>=size:
                        return self.respond(416,{"error":"範圍不對。"},{"Content-Range":f"bytes */{size}"})
                    partial=True
                length=max(0,end-start+1)
                self.send_response(206 if partial else 200)
                self.send_header("Content-Type",shape.MIME[kind]);self.send_header("Content-Length",str(length))
                self.send_header("Content-Security-Policy",shape.ASSET_CSP);self.send_header("X-Content-Type-Options","nosniff")
                self.send_header("Cache-Control","no-store");self.send_header("Cross-Origin-Resource-Policy","same-origin")
                self.send_header("Referrer-Policy","no-referrer");self.send_header("Accept-Ranges","bytes")
                if partial:self.send_header("Content-Range",f"bytes {start}-{end}/{size}")
                self.end_headers()
                fh.seek(start);left=length
                while left>0:
                    chunk=fh.read(min(1<<16,left))
                    if not chunk:break
                    self.wfile.write(chunk);left-=len(chunk)
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
                if route=="/api/session":return self.respond(200,{"ok":True},{"Set-Cookie":f"yf_{workspace.token[:8]}={workspace.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={COOKIE_AGE}"})
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
                if route=="/api/agent/map":
                    notes=[];state=workspace.update(lambda s:merge_map(s,data,notes,workspace.path));m=state["map"]
                    workspace.fallback=None   # v14 整合：小二照原因改好、用 map 交進來了，「這次先用上一份」那一條收起來（不然要等下次開經營室才會不見）
                    return self.respond(200,{"ok":True,"revision":state["revision"],"map_revision":m["revision"],"sections":sorted(k for k in m if k not in {"revision","updated","sources"}),"notes":notes})
                if route=="/api/companion":
                    # 調整器存檔：保護跟 /api/map/act 一樣（本機、來源、工作台標頭、token）；rev 對不上回 409，畫面重讀
                    notes=[]
                    try:state=workspace.update(lambda s:set_companion(s,data,notes,workspace.path))
                    except StaleCompanion as e:return self.respond(409,{"error":str(e),"companion":companion_view(workspace.snapshot().get("map"))})
                    return self.respond(200,{"ok":True,"revision":state["revision"],"map_revision":state["map"]["revision"],"companion":companion_view(state["map"]),"state":state,"notes":notes})
                if route=="/api/layout":
                    # 版面（分組、收合、順序）；點標題收合也走這條。rev 對不上回 409，帶存著的版面
                    try:state=workspace.update(lambda s:set_layout(s,data))
                    except StaleLayout as e:return self.respond(409,{"error":str(e),"layout":(workspace.snapshot().get("map") or {}).get("layout")})
                    return self.respond(200,{"ok":True,"revision":state["revision"],"map_revision":state["map"]["revision"],"layout":state["map"].get("layout"),"state":state,"pack":workspace.pack(state)})
                if route in ("/api/module/pause","/api/module/act","/api/module/revert"):
                    # 模組卡片角落的「先收起來」、模組的按鈕、「回到上一版」：只動這一個模組；帶了 rev 對不上回 409
                    box={}
                    def run(s):
                        if route=="/api/module/pause":s,box["module"],box["changed"]=module_pause(s,data)
                        else:s,box["module"]=module_act(s,data)
                        return s
                    try:
                        if route=="/api/module/revert":state,box["module"]=workspace.revert_module(data)
                        else:state=workspace.update(run)
                    except StaleModule as e:return self.respond(409,{"error":str(e),"module":e.module})
                    return self.respond(200,{"ok":True,"revision":state["revision"],"map_revision":state["map"]["revision"],**box,"state":state,"pack":workspace.pack(state)})
                if route=="/api/integrity/restore":
                    # 程式檔被改過：換回原版（原版的指紋要對得上才換），多出來的搬到 .備份/。換回了 .py 要重開才生效
                    out=workspace.restore_program()
                    restart=getattr(self.server,"restart",None)
                    if out["restart"] and restart and os.name=="posix":
                        threading.Timer(.8,restart).start();out["restarting"]=True
                    return self.respond(200,{"ok":out["integrity"]["ok"],**out})
                if route=="/api/map/act":
                    # 畫面上只有這一種寫入：今天某一件事做了／先不做、做了的結果
                    state=workspace.update(lambda s:act_map(s,data));t=state["map"]["today"]
                    return self.respond(200,{"ok":True,"revision":state["revision"],"today":t})
                if route=="/api/companion/configure":return self.respond(200,{"state":workspace.companion.configure(data.get('mode'),data.get('prepare_imports'),data.get('prepare_results'))})
                if route=="/api/observation/export":return self.respond(200,table_csv(workspace.snapshot(),data.get("id")))
                if route=="/api/companion/review-result":return self.respond(200,{"state":workspace.companion.review_result(data)})
                if route=="/api/companion/ask":return self.respond(200,{"state":workspace.companion.ask(data)})
                if route=="/api/companion/apply":return self.respond(200,{"state":workspace.update(lambda s:apply(s,data.get('id')))})
                if route=="/api/companion/dismiss":return self.respond(200,{"state":workspace.companion.dismiss(data.get("id"))})
                if route=="/api/companion/retry":return self.respond(200,{"state":workspace.companion.retry(data.get("id"))})
                if route=="/api/companion/cancel":return self.respond(200,{"state":workspace.companion.cancel(data.get('id'))})
                return self.respond(404,{"error":"找不到這個操作。"})
            except ValueError as e:return self.respond(400,{"error":str(e)[:250]})
            except (TypeError,KeyError):return self.respond(400,{"error":"資料的格式不對，這次沒有存；請小二照說明書再交一次。"})
            except Exception:return self.respond(500,{"error":"這次操作未完成，請保留畫面並告訴原助手。"})
    return ThreadingHTTPServer(("127.0.0.1",port),Handler)

def remembered(path):
    """上次的入口：(埠, 鑰匙)。只認本機位址、格式對的鑰匙；讀不到就回 (None, None)。"""
    try:
        old=json.loads((path/".工作台入口.json").read_text(encoding="utf-8"));address=urllib.parse.urlparse(old["base"])
        if address.scheme!="http" or address.hostname not in {"127.0.0.1","localhost"} or not address.port or address.username or address.path not in {"","/"}:return None,None
        token=old.get("token")
        return address.port,(token if isinstance(token,str) and TOKEN_OK.match(token) else None)
    except (OSError,ValueError,KeyError,TypeError,AttributeError):return None,None

def home_port(path):
    """這個資料夾的固定埠：同一個資料夾每次算出來都一樣。"""
    lo,hi=PORTS
    return lo+int(hashlib.sha256(str(path).encode()).hexdigest()[:8],16)%(hi-lo)

def taken(port):
    """這個埠上已經有東西在聽（別的程式、或另一個經營室）就不搶。"""
    try:
        with socket.create_connection(("127.0.0.1",port),timeout=.3):return True
    except OSError:return False

def bind(workspace,ports):
    """照順序試：上次的埠 → 這個資料夾的固定埠 → 隨便一個空的。被別的程式佔走才換。"""
    for port in ports:
        if taken(port):continue
        try:return make_server(workspace,port)
        except OSError as e:
            if e.errno not in (errno.EADDRINUSE,errno.EACCES):raise
    return make_server(workspace,0)

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
            for attempt in range(2):   # 經營室正忙（例如正在存大檔）時多等一下，不要另開第二個寫同一份資料
                try:
                    with urllib.request.urlopen(req,timeout=2) as r: assert r.status==200
                    break
                except urllib.error.HTTPError:raise
                except OSError:
                    if attempt or not taken(address.port):raise
            print(json.dumps({"url":old["base"]+"/#token="+old["token"],"reused":True},ensure_ascii=False),flush=True)
            if a.open:webbrowser.open(old["base"]+"/#token="+old["token"])
            return
        except Exception:pass
    ident=hashlib.sha256(str(path).encode()).hexdigest()[:16]
    vault=a.vault or str(pathlib.Path.home()/"Library"/"Application Support"/"YoufengStudio"/ident/"credentials.json")
    old_port,old_token=remembered(path)
    w=Workspace(path,vault,old_token)
    ports=[a.port] if a.port else [x for x in dict.fromkeys([old_port,home_port(path)]) if x]
    server=bind(w,ports);base=f"http://127.0.0.1:{server.server_port}"
    # 程式檔還原成原版之後（POST /api/integrity/restore 換回了 .py）：原地重開一次，同一個埠、同一把鑰匙，畫面自己接回來
    args=[sys.executable,str(ROOT/"server.py"),"--workspace",str(path),"--port",str(server.server_port)]+(["--vault",a.vault] if a.vault else [])
    server.restart=lambda:os.execv(sys.executable,args)
    atomic(runtime,{"base":base,"token":w.token,"pid":os.getpid()})
    url=base+"/#token="+w.token
    print(json.dumps({"url":url,"workspace":str(path),**({"same_address":True} if server.server_port==old_port and old_token==w.token else {})},ensure_ascii=False),flush=True)
    if a.open:webbrowser.open(url)
    w.companion.kick()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=="__main__":main()
