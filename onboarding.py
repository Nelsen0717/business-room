"""把原對話接到第一件工作；純資料操作，不呼叫模型或外部服務。"""
import copy
import hashlib
import json
from domain import KINDS, NODES, clean, now, record, uid
from interview import QUESTIONS


def required(value, label, limit=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"請提供{label}（最多 {limit} 字）。")
    return value.strip()


def question(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("待補問題格式不符。")
    choices = value.get('options', [])
    if not isinstance(choices, list) or not 2 <= len(choices) <= 4:
        raise ValueError("待補問題需要 2–4 個白話選項，也容許本人補充。")
    return dict(text=required(value.get('text'), '一個待補問題', 300),
                why=required(value.get('why'), '這題如何幫助眼前工作', 600),
                options=[required(x, '問題選項', 160) for x in choices])


def diagnosis(value, focus):
    """六格診斷：哪幾格跟這家店有關、哪幾格先不做，最痛那格一個月大概漏多少。可省略。"""
    if value is None:
        return None
    if not isinstance(value, dict) or not value or set(value) - set(NODES):
        raise ValueError("六格診斷只能用找客、迎客、成交、口碑、養客、回客。")
    out = {}
    for node in NODES:
        item = value.get(node)
        if item is None:
            continue
        if not isinstance(item, dict) or not isinstance(item.get('relevant'), bool):
            raise ValueError(f"請標明「{node}」跟這家店有沒有關係。")
        entry: dict = dict(relevant=item['relevant'], why=clean(item.get('why'), 120))
        leak = item.get('leak')
        if leak is not None:
            if not item['relevant']:
                raise ValueError(f"「{node}」先不做，就不用估漏掉多少。")
            amount, inputs = leak.get('amount') if isinstance(leak, dict) else None, (leak or {}).get('inputs', [])
            if not isinstance(amount, int) or isinstance(amount, bool) or not 0 <= amount <= 100_000_000:
                raise ValueError(f"「{node}」一個月大概漏多少，請給整數金額。")
            if leak.get('basis') not in {'record', 'memory'}:
                raise ValueError(f"「{node}」的估算請區分原始紀錄與本人回憶。")
            if not isinstance(inputs, list) or len(inputs) > 6 or not all(
                    isinstance(x, list) and len(x) == 2 for x in inputs):
                raise ValueError(f"「{node}」的估算條件請寫成最多六組「項目、數值」。")
            entry['leak'] = dict(amount=amount, basis=leak['basis'],
                                 formula=required(leak.get('formula'), '這一格的算式', 120),
                                 inputs=[[required(k, '估算項目', 40), required(v, '估算數值', 40)] for k, v in inputs],
                                 note=clean(leak.get('note'), 160))
        out[node] = entry
    if out.get(focus, {}).get('relevant') is False:
        raise ValueError("最痛的那一格不能同時標成先不做。")
    return out


def validate(payload):
    if not isinstance(payload, dict):
        raise ValueError("對話交接格式不符。")
    b, c, t = (payload.get(k, {}) for k in ('business', 'conversation', 'first_task'))
    if not all(isinstance(x, dict) for x in (b, c, t)):
        raise ValueError("請提供生意、對話摘要與第一件工作的內容。")
    if b.get('kind') not in KINDS or b.get('focus') not in NODES:
        raise ValueError("請指定生意類型與六節點之一。")
    if c.get('basis') not in {'record', 'memory'}:
        raise ValueError("這次材料請區分原始紀錄與本人回憶。")
    drafts = t.get('drafts', [])
    if not isinstance(drafts, list) or not 1 <= len(drafts) <= 3:
        raise ValueError("第一件工作至少需要一份能直接檢視的內容。")
    context = payload.get('context', {})
    if not isinstance(context, dict) or set(context) - QUESTIONS.keys():
        raise ValueError("生意脈絡題目不符。")
    answers = {}
    for key, value in context.items():
        if not isinstance(value, dict) or value.get('basis') not in {'record', 'memory', 'unknown'}:
            raise ValueError("每項脈絡都需要依據類型。")
        answers[key] = dict(text=required(value.get('text'), '脈絡內容', 5000), basis=value['basis'])
    confirmation = payload.get('confirmation')
    if confirmation is not None:
        if not isinstance(confirmation, dict) or confirmation.get('confirmed') is not True:
            raise ValueError("若原對話尚未確認，請省略 confirmation，讓本人在畫面確認。")
        confirmation = dict(confirmed=True, quote=required(confirmation.get('quote'), '本人確認的原話', 1000))
    from workcycle import table_spec
    observation=table_spec(payload['observation']) if payload.get('observation') is not None else None
    nodes = diagnosis(b.get('nodes'), b['focus'])
    return dict(id=required(payload.get('id'), '固定交接編號', 120),
                business=dict(name=required(b.get('name'), '生意名稱', 80), kind=b['kind'],
                              goal=required(b.get('goal'), '這次目的', 300), focus=b['focus'],
                              region=clean(b.get('region'), 100), demo=payload.get('demo') is True,
                              **({'nodes': nodes} if nodes else {})),
                conversation=dict(assistant=required(c.get('assistant'), '原助手名稱', 80),
                                  label=required(c.get('label'), '原對話名稱', 160),
                                  excerpt=required(c.get('excerpt'), '本人原話或提供的材料', 20000), basis=c['basis']),
                first_task=dict(title=required(t.get('title'), '第一件工作名稱', 160),
                                reason=required(t.get('reason'), '這件工作與目的的關係', 1200),
                                drafts=[required(x, '準備內容') for x in drafts]),
                context=answers, next_question=question(payload.get('next_question')), confirmation=confirmation,observation=observation)


def handoff(state, payload):
    p = validate(payload)
    canonical={k:v for k,v in p.items() if not (k=='observation' and v is None)}
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    old = state.get('onboarding')
    if old and old['id'] == p['id'] and old['digest'] == digest:
        return copy.deepcopy(state)  # 重試、隔天開啟都不重建或覆蓋。
    if old or state['setup']['complete']:
        raise ValueError("這裡已有自己的內容。請用 resume 接著做；不要重新交接覆蓋。")
    s = copy.deepcopy(state)
    sid = uid()
    s['sources'].append(dict(id=sid, name=p['conversation']['label'], kind='interview',
        content=f"原助手：{p['conversation']['assistant']}\n依據：{'本人回憶，未對帳' if p['conversation']['basis']=='memory' else '本人提供紀錄'}\n\n" + p['conversation']['excerpt'],
        at=now(), demo=p['business']['demo']))
    s['onboarding'] = dict(id=p['id'], digest=digest, status='review', source=sid, payload=p,
                           question=p['next_question'], answers=[], at=now())
    record(s, '原對話已帶入，待展開第一件工作', source=sid)
    s['revision'] += 1
    if p['confirmation']:
        return confirm(s, {}, via='conversation')
    return s


def confirm(state, edits, via='screen'):
    s = copy.deepcopy(state)
    o = s.get('onboarding', {})
    if o.get('status') == 'active':
        return s
    if o.get('status') != 'review' or s['setup']['complete']:
        raise ValueError("目前沒有待確認的原對話。")
    p = copy.deepcopy(o['payload'])
    if via == 'screen':
        for key, limit in [('name', 80), ('goal', 300)]:
            if key in edits:
                p['business'][key] = required(edits[key], '生意名稱' if key == 'name' else '這次目的', limit)
        if 'draft' in edits:
            p['first_task']['drafts'][0] = required(edits['draft'], '第一份準備內容')
    sid = uid()
    receipt = ('原助手帶入的本人確認原話：' + p['confirmation']['quote']) if via == 'conversation' else '本人在工作台確認目的與第一件工作。'
    details = [receipt, '生意：' + p['business']['name'], '目的：' + p['business']['goal'],
               '第一件工作：' + p['first_task']['title'], p['first_task']['reason']]
    details += [f'準備內容 {i + 1}：\n{x}' for i, x in enumerate(p['first_task']['drafts'])]
    details += [QUESTIONS[k]['title'] + '\n' + v['text'] for k, v in p['context'].items()]
    s['sources'].append(dict(id=sid, name='第一次展開・確認內容', kind='note',
        content='\n\n'.join(details),
        previous_source=o['source'], at=now(), demo=p['business']['demo']))
    s['business'] = p['business']
    s['setup'].update(complete=True, step=4, answers={**p['business'], 'mode':'own'})
    task = p['first_task']; aid = uid()
    s['actions'].append(dict(id=aid, **task, node=s['business']['focus'], source=sid,
        status='prepared', result='', created=now(), demo=s['business']['demo']))
    answers = s.setdefault('interview', dict(section=0, answers={}))['answers']
    for key, value in p['context'].items():
        if not answers.get(key, {}).get('confirmed'):
            answers[key] = dict(**value, source=o['source'], confirmed=True)
    if not s['preferences'].get('user_customized'):
        # 有六格診斷時，第一眼先看自己的六格地圖（課綱第 3 章的成果），再看第一件工作
        s['preferences']['home'] = ['journey', 'work'] if p['business'].get('nodes') else ['work', 'journey']
        if s['transactions']:
            s['preferences']['home'] = ['pulse', 'focus', 'revenue', 'work', 'journey']
    o.update(status='active', action=aid, confirmation_source=sid, confirmed_via=via, confirmed_at=now())
    if p.get('observation'):
        from workcycle import add_table
        o['observation']=add_table(s,{**p['observation'],'source':sid})
    record(s, '從原對話展開第一件工作；內容待本人選擇，尚未執行', action=aid, source=sid)
    s['revision'] += 1
    return s


def answer(state, data):
    s = copy.deepcopy(state); o = s.get('onboarding', {}); q = o.get('question')
    if o.get('status') != 'active' or not q:
        raise ValueError("這題已保存，或目前沒有待補的問題。")
    if data.get('question') != q['text']:
        raise ValueError("問題已更新，請重新看目前的問題。")
    basis = data.get('basis')
    if basis not in {'record', 'memory', 'unknown'}:
        raise ValueError("請選擇回答的依據。")
    text = required(data.get('text'), '這題的回答', 5000)
    sid = uid()
    s['sources'].append(dict(id=sid, name='接著補充・' + q['text'], kind='interview',
        content=f"{q['text']}\n為什麼現在問：{q['why']}\n依據：{basis}\n{text}", at=now(), demo=s['business']['demo']))
    o['answers'].append(dict(question=q['text'], text=text, basis=basis, source=sid, at=now()))
    o['question'] = None
    record(s, '已保存補充，原助手下次接續可讀取', source=sid)
    s['revision'] += 1
    return s


DAILY_LOG = 20   # 紀錄帶最近 20 則：每天開門、打烊加換天時程式記的那一則，夠盤點算一週


def _daily(m):
    """開門、打烊、盤點要讀的整張地圖（v13）：原樣帶回（v13.1 的模組 mods、你的小二 companion 也在裡面），紀錄帶最近 20 則；
    達成率由程式算好，不用助手心算。換天時程式會把前一天按過的結果記成一則（kind note、src data），盤點的一週合計照那幾則算。
    交回去時，紀錄只交新的那一則、附近只交改了的那幾家；其他塊交一塊就是整塊換掉。
    companion 一定在：沒交過就是預設的（小二、掌櫃的…，rev 0）；交回去要帶同一個 rev，畫面上剛改過的話以畫面為準。
    小二不戴配件（10/2 17:00 拿掉 acc、art）：他在對話裡說想改怎麼叫他、怎麼說話，就照他說的改 call、tone、voice、hello。"""
    m = m if isinstance(m, dict) else {}
    out = {k: copy.deepcopy(v) for k, v in m.items() if k not in ('revision', 'updated', 'sources', 'log')}
    from contextmap import COMPANION_DEFAULT, companion_stored, _sec, _shaped
    # v14：存著的某一塊被直接改壞（例如 mods.items 寫成物件）：照原樣帶回去、標在 broken，小二照錯誤訊息整塊重交；其他塊照讀
    broken = sorted(k for k, v in m.items() if k not in ('revision', 'updated') and v is not None and not _shaped(k, v))
    if broken:
        out['broken'] = broken
    if 'log' in m:
        out['log'] = dict(items=((_sec(m, 'log') or {}).get('items') or [])[:DAILY_LOG])
    if m:
        out['companion'] = {**COMPANION_DEFAULT, **companion_stored(m.get('companion'))}   # 舊格式的配件不帶回去
    if isinstance(m.get('sources'), dict) and m['sources']:
        out['source_keys'] = sorted(map(str, m['sources']))
    goals = out.get('goals') if isinstance(out.get('goals'), dict) else {}
    for g in goals.get('items', []) if isinstance(goals.get('items'), list) else []:
        try:
            span = g['target'] - g['base']
            g['rate'] = round((g['now'] - g['base']) / span, 4) if span else None
        except (KeyError, TypeError, ZeroDivisionError, OverflowError):
            pass   # 這一個目標的數字壞了：不算達成率，其他照算
    from shape import _items
    if any(isinstance(x, dict) and x.get('view') for x in _items(m)):
        # v14：模組畫面算好的數（還能用幾天、夠不夠、驗算對不對得上）與一行提醒，由程式算，小二照讀、不自己心算
        from shape import views, alerts
        out['views'] = views(m)
        out['alerts'] = alerts(m, out['views'])
    return out


def resume(s):
    """不呼叫模型、不改資料；把原助手需要接續的最小脈絡帶回。"""
    o = s.get('onboarding', {})
    active = [x for x in s['actions'] if x['status'] not in {'done', 'dismissed'}]
    results = sorted([x for x in s['actions'] if x['status'] == 'done'], key=lambda x:x.get('updated', ''), reverse=True)
    return dict(revision=s['revision'], ready=s['setup']['complete'], business=s['business'],
        conversation=o.get('payload', {}).get('conversation'),
        first_task=None if (s.get('map') or {}).get('today') else (active[0] if active else None), recent_results=results[:3],
        next_question=o.get('question'), added_context=o.get('answers', []),
        observations=s.get('observations',[]),
        map=dict(sections=sorted(k for k in (s.get('map') or {}) if k not in {'revision','updated','sources'}),revision=(s.get('map') or {}).get('revision',0)),
        daily=_daily(s.get('map') or {}),
        pending_discussions=[x for x in s.get('companion', {}).get('turns', []) if x['status'] == 'queued'],
        instruction=('排程或他叫你「開門」「打烊」「盤點」時，照 .business-room/例行.md 做，讀 daily（今天、想問你、目標、在跑的模組、紀錄）；'
                     '用 daily.companion 的名字、怎麼叫他、語氣說話。'
                     if (s.get('map') or {}).get('today') else
                     '先讀已有原話與結果，不重問。若有未完成的工作先接續；若已有結果，先問是否回看，再準備下一個有依據的做法。')
                    + '不要自行宣告背景運作；不替他送出任何訊息。')
