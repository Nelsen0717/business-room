"""本代工作資料、示例與可追溯操作。無模型、無網路。"""
import copy, csv, io, uuid, datetime, math, hashlib, json

HOME_WIDGETS={"focus","journey","revenue","people","map","pulse","flows","work"}
NODES = ["找客", "迎客", "成交", "口碑", "養客", "回客"]
KINDS = {"service":"預約與服務", "local":"街區與合作", "commerce":"商品與電商"}
SCHEMA="business-room.studio/1"
LEGACY_SCHEMAS={"youfeng.studio/1"}  # 2026-09 以前的安裝，載入時自動改成 SCHEMA

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def uid(): return uuid.uuid4().hex[:12]
def empty():
    return dict(schema=SCHEMA, revision=0, setup={"step":0,"complete":False,"answers":{}}, business={}, sources=[], people=[], transactions=[], actions=[], notes=[], events=[], requests=[], preferences={"home":["focus","journey","revenue","people"],"density":"comfortable"}, connections={}, view={"page":"overview","selected":None})

def sample(kind="service", priority=None, stage=None):
    from scenarios import build
    return build(empty(), kind, priority, stage or ({"service":"day1","local":"week3","commerce":"month3"}.get(kind,"week3")))

def clean(text, limit=1000): return str(text or "").strip()[:limit]
def record(s, text, **extra):
    s["events"].append({"id":uid(),"at":now(),"text":text,**extra}); s["events"]=s["events"][-200:]

def mutate(s, op, data):
    s=copy.deepcopy(s)
    if op=='observation-row':
        from workcycle import fill_table
        return fill_table(s,data)
    if op=='observation-status':
        table=next((x for x in s.get('observations',[]) if x['id']==data.get('id')),None)
        if not table or data.get('status') not in {'active','paused'}:raise ValueError('小表狀態不符。')
        table['status']=data['status'];s['revision']+=1;return s
    if op in {'onboarding-confirm','onboarding-answer'}:
        from onboarding import confirm, answer
        return confirm(s,data) if op=='onboarding-confirm' else answer(s,data)
    if op=="setup":
        allowed={"mode","kind","name","goal","region","priority","channel","daily"}
        answers={k:clean(v,300) for k,v in data.get("answers",{}).items() if k in allowed}
        s["setup"]["answers"].update(answers); s["setup"]["step"]=max(0,min(4,int(data.get("step",0))))
    elif op=="start":
        a=s["setup"]["answers"]
        if a.get("kind") not in KINDS or not clean(a.get("name")): raise ValueError("請先填生意名稱並選擇類型。")
        if s["setup"]["complete"]: raise ValueError("工作台已展開，既有資料會保留。")
        if a.get("mode")=="sample": s=sample(a["kind"],a.get("priority"))
        else:
            s["business"]={"name":clean(a["name"],80),"kind":a["kind"],"goal":clean(a.get("goal"),300),"region":clean(a.get("region"),100),"focus":{"new":"找客","return":"回客"}.get(a.get("priority"),"迎客"),"demo":False}
            labels={"name":"生意名稱","kind":"生意類型","goal":"這次目標","region":"主要服務地區"}
            sid=uid(); s["sources"].append({"id":sid,"name":"第一次訪談・你的回答","kind":"interview","content":"\n".join(f"{label}：{KINDS.get(a.get(k),a.get(k,''))}" for k,label in labels.items()),"at":now(),"demo":False})
            s["actions"].append(dict(id=uid(),title="和助手確認第一個值得改善的地方",node=s["business"]["focus"],reason="依你的目標先整理現況；尚未由助手完成經營診斷。",source=sid,status="suggested",drafts=[],result="",created=now(),demo=False))
            s["setup"].update(complete=True,step=4)
            s["preferences"]["home"]={"service":["focus","work","flows","journey","revenue"],"local":["pulse","revenue","focus","flows","work","map","journey"],"commerce":["pulse","revenue","flows","work","focus","journey"]}[a["kind"]]
        record(s,"第一次展開工作台")
    elif op=="preferences":
        home=data.get("home",s["preferences"]["home"])
        if not isinstance(home,list) or not 1<=len(home)<=len(HOME_WIDGETS) or len(set(home))!=len(home) or any(x not in HOME_WIDGETS for x in home): raise ValueError("首頁內容不符。")
        s["preferences"].update(home=home,density="compact" if data.get("density")=="compact" else "comfortable",user_customized=True); record(s,"調整自己的首頁")
    elif op=="coverage":
        if data.get("confirmed") is not True:raise ValueError("請先確認這段期間的交易是否已完整收錄。")
        try:start=datetime.date.fromisoformat(data["start"]);end=datetime.date.fromisoformat(data["end"])
        except (KeyError,ValueError,TypeError):raise ValueError("請填正確的開始與結束日期。")
        if not 0<=(end-start).days<=366:raise ValueError("期間請介於一天到一年之間。")
        sid=uid();s["sources"].append(dict(id=sid,name="本人核對・交易完整期間",kind="note",content=f"本人確認 {start} 至 {end} 的交易已全部收錄，包含休業或零交易日。這是本人對完整性的聲明，不是外部服務的自動驗證。",at=now(),demo=bool(s["business"].get("demo"))))
        reporting=s.setdefault("reporting",{"coverage":[]})
        reporting.setdefault("coverage",[]).append({"start":str(start),"end":str(end),"source":sid,"complete":True})
        reporting["as_of"]=str(end);record(s,"核對一段完整交易期間",source=sid)
    elif op=="period":
        if data.get("days") not in [7,14,28]:raise ValueError("請選擇 7、14 或 28 天。")
        s["preferences"]["period"]=data["days"]
    elif op=="demo":
        if any(t.get("status") in {"queued","running"} or t.get("runtime",{}).get("active") for t in s.get("companion",{}).get("turns",[])):raise ValueError("請先完成或停止目前討論，再切換示例。")
        if not s["business"].get("demo"):raise ValueError("自己的生意不能切換成示例。")
        if data.get("kind") not in KINDS or data.get("stage") not in {"day1","week3","month3"}:raise ValueError("示例情境不符。")
        # Preserve each scenario independently, including owner changes and conversation.
        previous=s.pop("demo_snapshots",{})
        key=s["business"]["kind"]+"/"+s.get("reporting",{}).get("stage","week3")
        previous[key]=copy.deepcopy(s)
        next_key=data["kind"]+"/"+data["stage"]
        revision=s["revision"];s=copy.deepcopy(previous.get(next_key)) or sample(data["kind"],stage=data["stage"])
        s["demo_snapshots"]=previous;s["revision"]=revision
    elif op=="interview":
        from interview import save
        s=save(s,data,now())
    elif op=="flow-step":
        flow=next((x for x in s.get("flows",[]) if x["id"]==data.get("flow")),None)
        step=next((x for x in (flow or {}).get("steps",[]) if x["id"]==data.get("step")),None)
        if not step or data.get("status") not in {"pending","review","waiting","done"}:raise ValueError("請選擇現有流程與狀態。")
        result=clean(data.get("result"),3000)
        if not result:raise ValueError("請記下這一步實際發生了什麼。")
        sid=uid();s["sources"].append(dict(id=sid,name=step["title"]+"・本人紀錄",kind="note",content=result,at=now(),previous_source=step["source"],demo=bool(s["business"].get("demo"))))
        step.update(status=data["status"],result=result,source=sid,updated=now())
        record(s,"更新流程："+step["title"],source=sid)
    elif op=="material":
        title=clean(data.get("name"),160); body=clean(data.get("content"),500000)
        if not title or not body: raise ValueError("請輸入材料名稱與內容。")
        s["sources"].append({"id":uid(),"name":title,"content":body,"kind":"note","at":now(),"demo":bool(s["business"].get("demo"))}); record(s,"加入一份材料")
    elif op=="person":
        name=clean(data.get("name"),120)
        if not name: raise ValueError("請填寫對象名稱。")
        sid=uid(); s["sources"].append(dict(id=sid,name=f"手動紀錄・{name}",kind="note",content=clean(data.get("note"),1000) or "由本人新增的對象。",at=now(),demo=bool(s["business"].get("demo"))))
        s["people"].append(dict(id=uid(),name=name,node=data.get("node") if data.get("node") in NODES else "迎客",status="待確認",note=clean(data.get("note"),1000),source=sid,demo=bool(s["business"].get("demo")))); record(s,"新增一位對象")
    elif op=="person-update":
        person=next((x for x in s["people"] if x["id"]==data.get("id")),None)
        if not person or data.get("node") not in NODES:raise ValueError("請選擇現有對象與正確節點。")
        note=clean(data.get("note"),1000);status=clean(data.get("status"),80)
        if not note:raise ValueError("請留下一句更新的依據。")
        sid=uid();old_source=person["source"]
        s["sources"].append(dict(id=sid,name=person["name"]+"・互動更新",kind="note",content=f"本人更新：{data['node']}／{status}\n{note}",at=now(),previous_source=old_source,demo=bool(s["business"].get("demo"))))
        person.update(node=data["node"],status=status or "待確認",note=note,source=sid)
        record(s,"更新「"+person["name"]+"」的互動",source=sid)
    elif op=="action":
        item=next((x for x in s["actions"] if x["id"]==data.get("id")),None)
        if not item: raise ValueError("找不到這件事。")
        status=data.get("status")
        if status not in {"prepared","approved","done","dismissed"}: raise ValueError("狀態不符。")
        if status=="done" and not clean(data.get("result")): raise ValueError("請記下實際做了什麼與結果。")
        result=clean(data.get('result'),2000)
        if status=='done' and (result!=item.get('result') or not item.get('result_source')):
            sid=uid();s['sources'].append(dict(id=sid,name=item['title']+'・本人結果',kind='note',content=result,previous_source=item['source'],at=now(),demo=bool(s['business'].get('demo'))))
            item['result_source']=sid
        item.update(status=status,result=result,selected_draft=clean(data.get("draft"),4000),updated=now()); record(s,{"approved":"你已確認做法，尚未代表已發送","done":"記下一次實際結果","dismissed":"暫不進行這個做法","prepared":"儲存草稿"}[status],action=item["id"])
    elif op=="request":
        text=clean(data.get("text"),3000)
        if not text: raise ValueError("請說明想和助手討論的事。")
        item={"id":uid(),"text":text,"status":"queued","view":s["view"],"at":now()}; s["requests"].append(item); record(s,"已記下，等待原助手讀取",request=item["id"])
    elif op=="view": s["view"]={"page":clean(data.get("page"),40),"selected":clean(data.get("selected"),80) or None}
    else: raise ValueError("不支援的操作。")
    s["revision"]+=1
    return s

ALIASES={"time":["time","時間","交易時間"],"name":["name","title","姓名","名稱","商家名稱","客戶"],"lat":["latitude","lat","緯度"],"lng":["longitude","lng","lon","經度"],"amount":["amount","金額","營收"],"date":["date","日期"],"note":["note","備註","description"],"address":["address","地址"],"phone":["phone","phone_number","電話"],"website":["website","網站"],"node":["node","節點"],"channel":["channel","來源管道","來源"],"customer_type":["customer_type","新舊客"]}
def parse_csv(text):
    rows=list(csv.DictReader(io.StringIO(text.lstrip("\ufeff")))); out=[]
    if not rows: raise ValueError("CSV 沒有資料列。")
    if len(rows)>2000: raise ValueError("這次請先匯入 2,000 筆以內。")
    for line,row in enumerate(rows,2):
        r={"row":line}
        for k,aliases in ALIASES.items():
            for alias in aliases:
                if row.get(alias) not in (None,""): r[k]=clean(row[alias],1000); break
        for k in ("lat","lng","amount"):
            if k in r:
                try: r[k]=float(r[k].replace(",",""))
                except ValueError: raise ValueError(f"第 {line} 列的 {k} 不是數字。")
                if not math.isfinite(r[k]): raise ValueError(f"第 {line} 列含有無效數字。")
        if "lat" in r and not -90<=r["lat"]<=90: raise ValueError("緯度超出範圍。")
        if "lng" in r and not -180<=r["lng"]<=180: raise ValueError("經度超出範圍。")
        if "time" in r:
            try:
                parsed=datetime.time.fromisoformat(r["time"])
                if parsed.tzinfo:raise ValueError()
                r["time"]=parsed.isoformat(timespec="seconds")
            except ValueError:raise ValueError(f"第 {line} 列時間請用 HH:MM。")
        if "amount" in r:
            if "date" not in r: raise ValueError(f"第 {line} 列金額需要日期。")
            try: datetime.date.fromisoformat(r["date"])
            except ValueError: raise ValueError("日期請使用 YYYY-MM-DD。")
        if "name" not in r and "amount" not in r: raise ValueError("找不到名稱或金額欄位；請參考匯入範例。")
        out.append(r)
    return out

def import_csv(s,name,text):
    rows=parse_csv(text); s=copy.deepcopy(s); sid=uid()
    digest=hashlib.sha256(text.encode()).hexdigest()
    canonical=lambda rs:hashlib.sha256(json.dumps(sorted(json.dumps({k:v for k,v in r.items() if k!="row"},sort_keys=True,ensure_ascii=False) for r in rs),ensure_ascii=False).encode()).hexdigest()
    rows_digest=canonical(rows)
    prior=[]
    for x in s["sources"]:
        if x.get("kind")=="csv":
            try:prior.append(x.get("rows_digest") or canonical(parse_csv(x["content"])))
            except ValueError:pass
    if rows_digest in prior or any(x.get("digest")==digest for x in s["sources"]): raise ValueError("這份資料已經匯入過了，原紀錄仍保留。")
    s["sources"].append(dict(id=sid,name=clean(name,160),kind="csv",content=text,digest=digest,rows_digest=rows_digest,at=now(),demo=bool(s["business"].get("demo"))))
    for r in rows:
        if "amount" in r: s["transactions"].append({"id":uid(),"amount":r["amount"],"date":r["date"],"source":sid,"row":r["row"],**{k:r[k] for k in ("channel","customer_type","time") if k in r}})
        elif "name" in r:
            r["node"]=r.get("node") if r.get("node") in NODES else "找客"
            s["people"].append({"id":uid(),"status":"待研究","source":sid,"demo":bool(s["business"].get("demo")),**r})
    if not s["business"].get("demo") and s.get("reporting") and any("amount" in r for r in rows):s["reporting"]["as_of"]=max(t["date"] for t in s["transactions"])
    record(s,f"匯入 {len(rows)} 筆 CSV 資料",source=sid); s["revision"]+=1
    return s

def publish(s,payload):
    """由原助手發布有來源的判斷；永遠不能代替本人勾選已完成。"""
    s=copy.deepcopy(s); ids={x["id"] for x in s["sources"]}
    if payload.get('observations'):
        from workcycle import add_table
        for table in payload['observations']:add_table(s,table)
    for item in payload.get("people",[]):
        if item.get("source") not in ids or item.get("node") not in NODES or not clean(item.get("name")):raise ValueError("整理的對象需要名稱、節點與現有來源。")
        if not any(p["name"]==clean(item["name"],120) and p["source"]==item["source"] for p in s["people"]):
            s["people"].append(dict(id=uid(),name=clean(item["name"],120),node=item["node"],status=clean(item.get("status"),80) or "待確認",note=clean(item.get("note"),1000),source=item["source"],demo=bool(s["business"].get("demo"))))
    if payload.get("layout"):
        layout=payload["layout"]
        if layout.get("source") not in ids or not clean(layout.get("reason")):raise ValueError("首頁安排需要訪談依據與理由。")
        if s["preferences"].get("user_customized") and not layout.get("user_requested"):raise ValueError("本人已調整首頁；請先確認這次要改，再加上 user_requested。")
        manual=s["preferences"].get("user_customized",False)
        s=mutate(s,"preferences",layout);s["preferences"]["user_customized"]=manual
        s["preferences"]["interview_layout"]={"source":layout["source"],"reason":clean(layout["reason"],600)}
    if payload.get("actions"):
        for old in s["actions"]:
            if old["status"]=="suggested":old["status"]="dismissed"
    for item in payload.get("actions",[]):
        if item.get("source") not in ids or item.get("node") not in NODES: raise ValueError("助手的做法必須指向現有來源與六節點。")
        s["actions"].append(dict(id=uid(),title=clean(item.get("title"),160),reason=clean(item.get("reason"),1200),node=item["node"],source=item["source"],status="prepared",drafts=[clean(x,4000) for x in item.get("drafts",[])[:3]],result="",created=now(),demo=bool(s["business"].get("demo"))))
    for item in payload.get("notes",[]):
        if item.get("source") not in ids: raise ValueError("整理的脈絡必須指向現有來源。")
        title=clean(item.get("title"),160);content=clean(item.get("content"),1600)
        if not title or not content:raise ValueError("脈絡需要標題與內容。")
        s["notes"].append(dict(id=uid(),title=title,content=content,source=item["source"],at=now()))
    if payload.get("interview_answers"):
        from interview import suggest
        suggest(s,payload["interview_answers"])
    for flow in payload.get("flows",[]):
        validate_flow(s,flow)
        if any(x["id"]==flow["id"] for x in s.get("flows",[])):raise ValueError("已有這條流程，請保留本人進度並另提修改。")
        flow=copy.deepcopy(flow)
        for step in flow["steps"]:step.update(status="pending",result="")
        s.setdefault("flows",[]).append(flow)
    for rid in payload.get("read_requests",[]):
        for r in s["requests"]:
            if r["id"]==rid: r["status"]="read"
    record(s,"原助手已整理新的做法"); s["revision"]+=1
    return s


def validate_flow(s, flow):
    sources={x["id"]:x for x in s["sources"]}
    if not isinstance(flow,dict) or not clean(flow.get("id")) or not clean(flow.get("title")) or flow.get("source") not in sources or flow.get("node") not in NODES:raise ValueError("流程需要名稱、節點與現有來源。")
    steps=flow.get("steps",[])
    if not isinstance(steps,list) or not 1<=len(steps)<=12:raise ValueError("一條流程請拆成 1–12 個步驟。")
    if len({x.get("id") for x in steps})!=len(steps):raise ValueError("步驟編號不可重複。")
    for step in steps:
        if not clean(step.get("id")) or not clean(step.get("title")) or step.get("source") not in sources:raise ValueError("每一步都需要名稱與依據。")
        metric=step.get("metric")
        if metric is None:continue
        if not isinstance(metric,dict) or metric.get("source") not in sources or metric.get("basis") not in {"record","memory","unknown"}:raise ValueError("流程數字需要來源與依據類型。")
        value=metric.get("value")
        if value is not None and (isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0):raise ValueError("流程數字應為非負數，未取得請留空。")
        if metric["basis"]=="unknown" and value is not None:raise ValueError("尚未取得不能填數字。")
        if value is not None and metric["basis"]=="record":
            try:
                src=sources[metric["source"]]
                rows=list(csv.DictReader(io.StringIO(src["content"])))
                row=metric["row"]
                if src["kind"]!="csv" or not isinstance(row,int) or row<2:raise ValueError()
                raw=float(rows[row-2][metric["field"]])
                if raw!=value:raise ValueError()
            except (KeyError,ValueError,IndexError,TypeError):raise ValueError("流程數字與來源 CSV 的列／欄不一致。")
        for k in ("start","end"):
            try:datetime.date.fromisoformat(metric[k])
            except (KeyError,ValueError,TypeError):raise ValueError("流程數字需要明確期間。")
        if metric["start"]>metric["end"] or not clean(metric.get("unit")) or not clean(metric.get("cohort")):raise ValueError("流程數字需要同一批對象、單位與正確期間。")
