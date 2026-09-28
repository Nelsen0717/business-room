"""三家示範店（瑩瑩美甲／王記便當／初禾手工皂）、三個使用階段；完全虛構且可逐列回查的教學情境。
內容全部讀自 stores.py 的 STORES；這裡只負責照 domain.py 的狀態形狀組裝，不放任何店家文字。
"""
import copy, csv, io, datetime, random
from interview import SECTIONS
from stores import STORES

NODES=['找客','迎客','成交','口碑','養客','回客']
AS_OF='2026-09-19'
STAGES={'day1':('第一天',1),'week3':('第三週',21),'month3':('第三個月',84)}

GOAL_KEY={'找客':'acquisition','迎客':'response','成交':'sales_steps','口碑':'wordofmouth','養客':'nurture','回客':'return'}
PRIORITY_NODE={'new':'找客','return':'回客','inquiries':'迎客','referral':'口碑'}
OWNER_HINTS=['本人','當面','打電話','打總機','傳一句','親自','確認做得到','未確認不']

def csv_source(s,id,name,records,fields):
    out=io.StringIO();w=csv.DictWriter(out,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(records)
    s['sources'].append(dict(id=id,name=name,kind='csv',content=out.getvalue(),at=AS_OF+'T08:30:00+08:00',demo=True))

def step_owner(label,detail):
    text=label+detail
    return '本人處理' if any(h in text for h in OWNER_HINTS) else '助手可準備'

def build(s,kind='local',priority=None,stage='week3'):
    kind=kind if kind in STORES else 'service';stage=stage if stage in STAGES else 'week3'
    store=STORES[kind];stage_label,days=STAGES[stage]
    end=datetime.date.fromisoformat(AS_OF);start=end-datetime.timedelta(days=days-1)

    s['business']=dict(name=store['name'],kind=kind,goal=store['goal'],region=store['region'],
                        focus=store['focus'],demo=True,nodes=copy.deepcopy(store['nodes']))
    s['reporting']={'as_of':AS_OF,'stage':stage,'stage_label':stage_label,'sample_version':'v10','coverage':[],
                     'headline':store['headlines'][stage]}
    s['sources']=[dict(id='brief',name=store['name']+'・店主訪談',kind='interview',
                        content='【教學情境，所有人物與經營紀錄皆為虛構】\n\n'+'\n\n'.join(
                            q['title']+'\n'+store['answers'][q['key']] for sec in SECTIONS for q in sec['questions']),
                        at=start.isoformat()+'T09:00:00+08:00',demo=True)]
    s['interview']={'section':7,'reviewed_at':start.isoformat(),
                     'answers':{key:{'text':value,'basis':'memory','source':'brief','confirmed':True}
                                for key,value in store['answers'].items()}}

    # people：day1 只取前 5 位，其他階段全部；保留座標（有才放）
    chosen=store['people'][:5] if stage=='day1' else store['people']
    for i,person in enumerate(chosen):
        entry=dict(id=f'p{i}',name=person['name'],node=person['node'],status=person['status'],
                   note=person['note'],source='leads',row=i+2,demo=True)
        if 'lat' in person and 'lng' in person:entry['lat']=person['lat'];entry['lng']=person['lng']
        s['people'].append(entry)
    csv_source(s,'leads','詢問與合作紀錄.csv',s['people'],['name','node','status','note','lat','lng'])

    # transactions：day1 沒有交易；其餘依店家的 sales 模型，決定性亂數
    sales=store['sales']
    if days>1:
        if sales.get('daily'):
            weekday_flags=sales['weekday'];channels=sales['channels'];group=sales['group'];group_seen=False
            for d in range(days):
                day=start+datetime.timedelta(days=d);week=d//7
                rng=random.Random(f'{kind}:{stage}:{day.isoformat()}')
                if not weekday_flags[day.weekday()]:continue
                j=0
                for name,base,spread in channels:
                    amount=rng.randint(base-spread,base+spread)
                    s['transactions'].append(dict(id=f't{d}-{j}',date=day.isoformat(),amount=amount,channel=name,
                                                   customer_type='unknown',source='orders',row=len(s['transactions'])+2))
                    j+=1
                if week>=group['start_week'] and day.weekday()==group['weekday']:
                    amount=group['amount']+rng.randint(-150,150)
                    customer_type='new' if not group_seen else 'returning';group_seen=True
                    s['transactions'].append(dict(id=f't{d}-{j}',date=day.isoformat(),amount=amount,channel=group['channel'],
                                                   customer_type=customer_type,source='orders',row=len(s['transactions'])+2))
        else:
            channels=sales['channels'];weights=sales['weights']
            for d in range(days):
                day=start+datetime.timedelta(days=d)
                rng=random.Random(f'{kind}:{stage}:{day.isoformat()}')
                lo,hi=sales['jitter'];variation=rng.randint(lo,hi)
                count=min(sales['cap'],max(0,sales['weekday'][day.weekday()]+variation))
                for j in range(count):
                    amount=sales['base']+rng.randrange(sales['steps'])*sales['step']
                    bucket=rng.randrange(100)
                    channel=channels[next((i for i,v in enumerate(weights) if bucket<v),len(channels)-1)] if rng.random()>.07 else ''
                    customer_type=('returning' if rng.random()<sales['returning'] else 'new') if rng.random()>.09 else 'unknown'
                    s['transactions'].append(dict(id=f't{d}-{j}',date=day.isoformat(),amount=amount,channel=channel,
                                                   customer_type=customer_type,source='orders',row=len(s['transactions'])+2))
        s['reporting']['coverage']=[{'start':start.isoformat(),'end':AS_OF,'source':'coverage','complete':True}]
        s['sources'].append(dict(id='coverage',name='交易表完整期間・示例核對',kind='note',
                                  content=f'教學資料確認：{start} 至 {AS_OF} 每日逐筆交易全部包含在「交易紀錄.csv」。缺列的日子才能視為零交易。本聲明只適用於本教學情境。',
                                  at=AS_OF+'T08:30:00+08:00',demo=True))
    csv_source(s,'orders','交易紀錄.csv',s['transactions'],['date','amount','channel','customer_type'])

    # actions：第一件用 first_task，其餘五件用 actions；狀態沿用舊規則
    ft=store['first_task']
    if stage=='day1':first_title,first_reason=ft['day1_title'],ft['reason']
    elif stage=='month3':first_title,first_reason=ft['month3_title'],ft['month3_reason']
    else:first_title,first_reason=ft['title'],ft['reason']
    def person_id(name):return next((p['id'] for p in s['people'] if p['name']==name),None)
    store_actions=store['actions'];action_count=1 if stage=='day1' else 1+len(store_actions)
    s['actions']=[]
    for i in range(action_count):
        if i==0:
            title,node,reason,drafts,person_name=first_title,store['focus'],first_reason,[ft['draft']],ft['person']
        else:
            a_title,a_node,a_person,a_reason,a_draft=store_actions[i-1]
            title,node,reason,drafts,person_name=a_title,a_node,a_reason,[a_draft],a_person
        status='prepared' if i<3 else 'approved' if i==3 else 'done'
        result=store['results'][i-4] if i>=4 else ''
        aid='first' if i==0 else f'a{i}'
        action=dict(id=aid,title=title,node=node,reason=reason,source='leads' if i==0 else 'brief',
                    status=status,drafts=drafts,result=result,
                    created=(end-datetime.timedelta(days=max(0,i-2))).isoformat()+'T08:20:00+08:00',
                    due=AS_OF if i<4 else '',demo=True)
        pid=person_id(person_name)
        if pid:action['person']=pid
        s['actions'].append(action)
        if i>=4:s['events'].append(dict(id=f'e{i}',at=action['created'],text=title,action=aid,source=action['source']))
    if stage=='month3':s['actions'][0]['source']='worklog'

    if stage!='day1':
        history=store['history']
        for hi,(title,result) in enumerate(history[:min(len(history),days//14)]):
            at=(end-datetime.timedelta(days=7*(hi+1))).isoformat()+'T18:30:00+08:00';aid=f'review-{hi}'
            s['actions'].append(dict(id=aid,title=title,node=store['focus'],reason='店主的階段回顧，保留當時做決定的原因。',
                                      source='worklog',status='done',drafts=[],result=result,created=at,updated=at,demo=True))
            s['events'].append(dict(id='event-'+aid,at=at,text=title,action=aid,source='worklog'))

    worklog='【虛構工作往返與回顧】\n\n'+'\n\n'.join(
        a['created']+' '+a['title']+'\n'+a['reason']+'\n'+'\n'.join(a['drafts'])+'\n實際結果：'+(a['result'] or '尚未記下，內容未對外發送')
        for a in s['actions'])
    s['sources'].append(dict(id='worklog',name='工作往返與階段回顧',kind='note',content=worklog,at=AS_OF+'T08:30:00+08:00',demo=True))
    for a in s['actions'][1:]:a['source']='worklog'
    for e in s['events']:e['source']=next(a['source'] for a in s['actions'] if a['id']==e['action'])
    s['events'].sort(key=lambda x:x['at'])

    s['notes']=[dict(id='n1',title='這輪觀察',content=s['reporting']['headline'],source='brief',at=AS_OF),
                dict(id='n2',title='我們決定先不做的事',content=store['answers']['boundaries'],source='brief',at=AS_OF),
                dict(id='n3',title='下次要驗證的問題',content=store['answers']['experiment'],source='brief',at=AS_OF)]

    # flows：只用 store 的相關格，依六格順序排列；只有 focus 流程帶 metric
    s['flows']=[];metric_rows=[];flow_results=[];observed=store['observed']
    flows_sorted=sorted(store['flows'],key=lambda f:NODES.index(f[1]))
    for ni,(title,node,labels,details) in enumerate(flows_sorted):
        focus=node==store['focus'];steps=[]
        cohort_values=None if stage=='day1' else store['cohort'][stage]
        for si,(label,detail) in enumerate(zip(labels,details)):
            if focus:status='done' if si==0 and days>1 else 'review' if si==1 and days>1 else 'pending'
            else:status='done' if si==0 and days>1 else 'pending'
            result=observed.get(ni,'') if status=='done' else ''
            if result:flow_results.append(title+' / '+label+'\n'+result)
            st=dict(id=f'f{ni}s{si}',title=label,detail=detail,owner=step_owner(label,detail),status=status,
                    source='flow-results' if result else 'brief',result=result)
            if focus:
                st['action']='first' if si==1 else 'a3' if si==2 and days>1 else ''
                value=cohort_values[si] if cohort_values is not None else None
                cohort_label=f'{kind}-本批對象';begin=(end-datetime.timedelta(days=27 if stage=='month3' else 6)).isoformat()
                unit=store['cohort']['unit'];row=len(metric_rows)+2
                metric_rows.append(dict(step=label,value='' if value is None else value,unit=unit,cohort=cohort_label,start=begin,end=AS_OF))
                st['metric']=dict(value=value,unit=unit,cohort=cohort_label,start=begin,end=AS_OF,
                                   basis='record' if value is not None else 'unknown',source='flow-counts',row=row,field='value')
            steps.append(st)
        s['flows'].append(dict(id=f'f{ni}',title=title,node=node,source='brief',goal=store['answers'][GOAL_KEY[node]],steps=steps))
    csv_source(s,'flow-counts','本批流程追蹤.csv',metric_rows,['step','value','unit','cohort','start','end'])
    s['sources'].append(dict(id='flow-results',name='流程實作與客人回音',kind='note',
                              content='【虛構教學紀錄】\n\n'+'\n\n'.join(flow_results),at=AS_OF+'T08:30:00+08:00',demo=True))

    s['preferences']['home']=store['home']
    s['preferences']['period']=28 if stage=='month3' else 7

    priority=priority or store['priority']
    focus=PRIORITY_NODE.get(priority,store['focus'])
    if focus!=store['focus']:
        s['business']['focus']=focus
        node_entry=s['business']['nodes'][focus]
        if not node_entry.get('relevant'):node_entry['why']='這次你選了先看這一格'  # 原本「先不做」的原因不再適用
        node_entry['relevant']=True
        s['actions'][0].update(node=focus,title='先一起看「'+focus+'」的實際做法',
                                reason='依這次選擇的重點，先回看訪談與已存的流程。',drafts=[],status='suggested')

    s['setup']={'step':4,'complete':True,
                'answers':{'name':store['name'],'kind':kind,'mode':'sample','goal':store['goal'],
                           'region':s['business']['region'],'priority':priority}}
    return s
