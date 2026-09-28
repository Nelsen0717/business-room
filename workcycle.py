"""缺資料的小表與結果接續；採用仍由本人決定，推理由既有工作佇列持有。"""
import copy,csv,datetime,hashlib,io,json,math,re
from domain import NODES,clean,now,record,uid
from preparation import digest,input_snapshot


def table_spec(p):
    if not isinstance(p,dict):raise ValueError('小表內容不完整。')
    fields=p.get('fields',[])
    if not isinstance(fields,list) or not 1<=len(fields)<=5:raise ValueError('這次小表請保留 1–5 個必要欄位。')
    normalized=[]
    for f in fields:
        if not isinstance(f,dict) or not re.fullmatch(r'[a-z][a-z0-9_]{0,39}',str(f.get('key',''))):raise ValueError('小表欄位編號不符。')
        kind=f.get('type');label=clean(f.get('label'),100);options=f.get('options',[])
        if kind not in {'text','date','number','select'} or not label:raise ValueError('小表欄位需要名稱與格式。')
        if not isinstance(options,list) or len(options)>8 or any(not isinstance(x,str) or not x.strip() or len(x)>120 for x in options):raise ValueError('選項請使用短句。')
        if kind=='select' and not 2<=len(options)<=8:raise ValueError('選擇欄位需要 2–8 個選項。')
        normalized.append(dict(key=f['key'],label=label,type=kind,options=options if kind=='select' else [],required=f.get('required') is True))
    if len({x['key'] for x in normalized})!=len(normalized):raise ValueError('欄位名稱重複。')
    title=clean(p.get('title'),160);purpose=clean(p.get('purpose'),1200)
    if not title or not purpose or p.get('node') not in NODES:raise ValueError('小表需要目的、標題與六節點。')
    return dict(title=title,purpose=purpose,node=p['node'],fields=normalized)


def add_table(s,p):
    spec=table_spec(p);sid=p.get('source')
    if sid not in {x['id'] for x in s['sources']}:raise ValueError('小表必須根據現有材料設計。')
    fingerprint=digest({**spec,'source':sid})
    existing=next((x for x in s.get('observations',[]) if x['fingerprint']==fingerprint),None)
    if existing:return existing['id']
    item=dict(id=uid(),**spec,source=sid,fingerprint=fingerprint,rows=[],status='active',at=now())
    s.setdefault('observations',[]).append(item)
    record(s,'已準備可直接填寫的小表：'+spec['title'],source=sid)
    return item['id']


def fill_table(state,data):
    s=copy.deepcopy(state);table=next((x for x in s.get('observations',[]) if x['id']==data.get('id')),None)
    if not table or table['status']!='active':raise ValueError('這張表已暫停或不存在。')
    key=data.get('request_id');values=data.get('values');basis=data.get('basis')
    if not isinstance(key,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}',key):raise ValueError('這次保存缺少編號，請重新打開小表。')
    if basis not in {'record','memory','unknown'} or not isinstance(values,dict) or set(values)-{f['key'] for f in table['fields']}:raise ValueError('請核對欄位與回答依據。')
    normalized={}
    for f in table['fields']:
        value=values.get(f['key'])
        if value is None or value=='':
            if f['required'] and basis!='unknown':raise ValueError('請補上「'+f['label']+'」，不知道可選尚未取得。')
            normalized[f['key']]=None;continue
        if isinstance(value,(list,dict,bool)):raise ValueError('欄位格式不符。')
        value=str(value).strip()
        if len(value)>2000:raise ValueError('每欄請在 2,000 字以內。')
        if f['type']=='number':
            try:n=float(value)
            except ValueError:raise ValueError('「'+f['label']+'」請填數字，未知留空。')
            if not math.isfinite(n):raise ValueError('數字格式不符。')
            if basis=='unknown':raise ValueError('尚未取得的數字請留空，不要填 0。')
            value=n
        elif f['type']=='date':
            try:value=datetime.date.fromisoformat(value).isoformat()
            except ValueError:raise ValueError('日期請使用 YYYY-MM-DD。')
        elif f['type']=='select' and value not in f['options']:raise ValueError('請選擇現有選項。')
        normalized[f['key']]=value
    if not any(v is not None and v!='' for v in normalized.values()):raise ValueError('先留下一個具體觀察，其他可以稍後補。')
    old=next((x for x in table['rows'] if x['request_id']==key),None)
    if old:
        if old['values']==normalized and old['basis']==basis:return s
        raise ValueError('這次紀錄已保存，請新增另一筆。')
    if len(table['rows'])>=500:raise ValueError('這張小表已到 500 筆，請先匯出並與助手整理下一階段。')
    sid=uid();rid=uid()
    lines=[table['purpose'],'依據：'+{'record':'有紀錄可查','memory':'本人回憶，尚未對帳','unknown':'尚待確認'}[basis]]
    lines += [f['label']+'：'+('尚未取得' if normalized[f['key']] is None else str(normalized[f['key']])) for f in table['fields']]
    s['sources'].append(dict(id=sid,name=table['title']+'・一筆觀察',kind='note',content='\n'.join(lines),previous_source=table['source'],at=now(),demo=bool(s['business'].get('demo'))))
    table['rows'].append(dict(id=rid,request_id=key,values=normalized,basis=basis,source=sid,at=now()))
    record(s,'保存一筆觀察：'+table['title'],source=sid);s['revision']+=1
    return s


def table_csv(s,table_id):
    table=next((x for x in s.get('observations',[]) if x['id']==table_id),None)
    if not table:raise ValueError('找不到這張表。')
    output=io.StringIO();writer=csv.writer(output)
    def safe(v):
        if v is None:return ''
        text=str(v)
        return "'"+text if text.lstrip().startswith(('=','+','-','@')) and not isinstance(v,(int,float)) else text
    writer.writerow([f['label'] for f in table['fields']]+['依據','紀錄時間'])
    for row in table['rows']:writer.writerow([safe(row['values'].get(f['key'])) for f in table['fields']]+[{'record':'有紀錄','memory':'本人回憶','unknown':'待確認'}[row['basis']],row['at']])
    return dict(name=table['title']+'.csv',content='\ufeff'+output.getvalue())


def queue_result(state,action_id,automatic=False):
    s=copy.deepcopy(state);c=s.setdefault('companion',{'mode':'native','turns':[]})
    a=next((x for x in s['actions'] if x['id']==action_id),None)
    if not a or a['status']!='done' or not a.get('result'):raise ValueError('先留下這件工作的實際結果，再準備下一步。')
    # 只看結果內容；重存相同結果或重開畫面都不多叫一次模型。
    event=digest({'kind':'result','action':a['id'],'result':a['result'],'purpose':input_snapshot(s)['purpose']})
    if event in c.setdefault('events_seen',[]):return s
    if not a.get('result_source'):
        sid=uid();s['sources'].append(dict(id=sid,name=a['title']+'・本人結果',kind='note',content=a['result'],previous_source=a['source'],at=now(),demo=bool(s['business'].get('demo'))));a['result_source']=sid
    rid=uid();sid=a['result_source'];source=next(x for x in s['sources'] if x['id']==sid)
    selected=[x for x in s['sources'] if x['id'] in {sid,a['source']} or x['kind']=='interview']
    snapshot=input_snapshot(s,sid);snapshot['sources']=[{'id':x['id'],'version':digest(x),'characters':len(x['content'])} for x in selected[-12:]]
    text='根據這次實際結果與我的目的，先說目前學到了什麼，再準備一個小到可以執行的下一步。缺資料時做一張可填小表；不宣稱一定有效。'
    context={'kind':'action','page':'overview','item':copy.deepcopy(a)}
    t=dict(id=rid,text=text,context=context,preferences=copy.deepcopy(s['preferences']),at=now(),status='queued',reply=None,automatic=automatic,event=event,input_snapshot=snapshot,
           followup={'kind':'result','action':a['id'],'source':sid,'result':a['result']})
    c['turns'].append(t);c['events_seen'].append(event)
    s['requests'].append(dict(id=rid,text=text,view={'page':'overview','selected':a['id']},status='queued',at=now()))
    record(s,'結果已接住，準備下一個可選做法',request=rid,source=sid);s['revision']+=1
    return s
