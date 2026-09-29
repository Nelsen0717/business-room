"""脈絡地圖：訪談中途就能交、一塊一塊長大。純資料檢查與合併，不呼叫模型。

助手每答完一站，就把長出來的那幾塊交進來（agent.py map --file）。同一塊再交一次就換成新的；
沒交的塊保留原樣。畫面上的每個數字都要指得回一條出處（sources），答不出「從哪來」的數字不收。
"""
import copy, re
from domain import NODES, now

SRC = {'said', 'data', 'web', 'est', 'calc', 'youest'}
STEPS = ('S', 'C', 'A', 'L', 'E')
SECTIONS = ('store', 'scale', 'who', 'key', 'flow', 'success', 'time', 'opps', 'map', 'data', 'next', 'persona')
NODE_STATES = {'leak', 'hole', 'rel', 'later', 'unknown'}
PIN_STATES = {'todo', 'going', 'won', 'past'}
LANES = ('on', 'can', 'only', 'none')
OPP_KINDS = {'補洞', '放大成功', '交給助手'}
HUES = ('orange', 'coral', 'berry', 'violet', 'indigo', 'teal', 'green', 'mustard')
EYES = ('capsule', 'round', 'sleepy')
# 本命星座的每一顆星，都要指到地圖上真的有的一件事（格式照這張表）
STAR_PATH = re.compile(r'^(who\.facts\.\d|who\.fix|key|success\.terms\.\d|time\.(week\.\d|free|handoff)'
                       r'|flow\.(nodes\.(找客|迎客|成交|口碑|養客|回客)|eq\.inputs\.\d|funnel\.rows\.\d)'
                       r'|opps\.items\.\d(\.ctx\.\d)?|map\.pins\.\d{1,2}|data\.lanes\.\d\.items\.\d{1,2})$')


def _t(value, label, limit, required=True):
    if value is None and not required:
        return ''
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
        raise ValueError(f'地圖的「{label}」請用 {limit} 字以內的一句話。')
    return value.strip()


def _src(value, label):
    if value not in SRC:
        raise ValueError(f'地圖的「{label}」要標出處：你說的、你的資料、查到的、估的、算的或你估的。')
    return value


def _num(value, label, lo, hi):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not lo <= value <= hi:
        raise ValueError(f'地圖的「{label}」要是 {lo} 到 {hi} 之間的數字。')
    return value


def _list(value, label, most, least=0):
    if not isinstance(value, list) or not least <= len(value) <= most:
        raise ValueError(f'地圖的「{label}」最多 {most} 項。' if not least else f'地圖的「{label}」要有 {least} 到 {most} 項。')
    return value


def _dict(value, label):
    if not isinstance(value, dict):
        raise ValueError(f'地圖的「{label}」格式不符。')
    return value


def _key(value, label, required=False):
    if value is None and not required:
        return None
    return _t(value, label + '的出處編號', 40)


def _headline(d, label):
    return _t(d.get('headline'), label + '的重點句', 30)


def store(d):
    d = _dict(d, '店名')
    return dict(name=_t(d.get('name'), '店名', 40), meta=_t(d.get('meta'), '地區與時間', 60, False))


def scale(d):
    d = _dict(d, 'SCALE')
    if d.get('step') not in STEPS:
        raise ValueError('SCALE 的步驟只能是 S、C、A、L、E。')
    return dict(step=d['step'], loop=int(_num(d.get('loop', 1), 'SCALE 第幾圈', 1, 50)), label=_t(d.get('label'), 'SCALE 說明', 30, False))


def who(d):
    d = _dict(d, '我理解的你')
    facts = [dict(t=_t(f.get('t'), '關鍵事實', 30), src=_src(f.get('src'), '關鍵事實'), key=_key(f.get('key'), '關鍵事實'))
             for f in (_dict(x, '關鍵事實') for x in _list(d.get('facts', []), '關鍵事實', 4))]
    out = dict(line=_t(d.get('line'), '我理解的你', 60), soft=_t(d.get('soft'), '還在問的提示', 20, False), facts=facts)
    if d.get('fix') is not None:
        fx = _dict(d['fix'], '本人改過的話')
        out['fix'] = dict(q=_t(fx.get('q'), '本人改過的話', 80), src=_src(fx.get('src', 'said'), '本人改過的話'))
    return out


def key(d):
    if d is None:
        return None
    d = _dict(d, '最重要的數字')
    if d.get('kind') not in {'leak', 'win'}:
        raise ValueError('最重要的數字要標是「在漏」還是「成果」。')
    out = dict(kind=d['kind'], label=_t(d.get('label'), '這個數字在說什麼', 30), value=_t(d.get('value'), '數字', 12),
               unit=_t(d.get('unit'), '單位', 10, False), sub=_t(d.get('sub'), '補一句', 40, False),
               src=_src(d.get('src'), '最重要的數字'), key=_key(d.get('key'), '最重要的數字', True))
    if d.get('count') is not None:
        out['count'] = _num(d['count'], '數字（跳動用）', 0, 1_000_000_000)
    return out


def flow(d):
    d = _dict(d, '客人怎麼走')
    nodes = _dict(d.get('nodes', {}), '六格')
    if set(nodes) - set(NODES):
        raise ValueError('六格只能用找客、迎客、成交、口碑、養客、回客。')
    out_nodes = {}
    for n in NODES:
        if n not in nodes:
            continue
        x = _dict(nodes[n], n)
        if x.get('st') not in NODE_STATES:
            raise ValueError(f'「{n}」的狀態要是：在漏（最大的洞）、也在漏、有關、先不做或還不知道。')
        item = dict(st=x['st'], s=_t(x.get('s'), n + '底下的短字', 12, False), why=_t(x.get('why'), n + '的原因', 80, False),
                    more=_t(x.get('more'), n + '的補充', 160, False), value=_t(x.get('value'), n + '的數字', 20, False))
        if x.get('src') is not None:
            item['src'] = _src(x['src'], n)
        out_nodes[n] = item
    leaks = [n for n, x in out_nodes.items() if x['st'] == 'leak']
    holes = [n for n, x in out_nodes.items() if x['st'] in {'leak', 'hole'}]
    if len(leaks) > 1:
        raise ValueError('最大的洞只能有一格；第二個洞請標「也在漏」。')
    if len(holes) > 2:
        raise ValueError('一次最多標兩個洞：先補最大的一兩個，其他的下一圈再看。')
    out = dict(headline=_headline(d, '客人怎麼走'), nodes=out_nodes)
    if d.get('eq') is not None:
        e = _dict(d['eq'], '算式')
        out['eq'] = dict(inputs=[[_t(a, '算式項目', 20), _t(b, '算式數值', 16)] for a, b in
                                 (x if isinstance(x, list) and len(x) == 2 else (None, None) for x in _list(e.get('inputs'), '算式項目', 6, 1))],
                         res=_t(e.get('res'), '算式結果', 16), key=_key(e.get('key'), '算式結果', True))
    if d.get('funnel') is not None:
        f = _dict(d['funnel'], '進度')
        rows = []
        for r in _list(f.get('rows'), '進度', 5, 2):
            if not isinstance(r, list) or len(r) != 2:
                raise ValueError('進度每一步要寫成「步驟、數量」。')
            rows.append([_t(r[0], '進度步驟', 10), int(_num(r[1], '進度數量', 0, 1_000_000))])
        out['funnel'] = dict(rows=rows, key=_key(f.get('key'), '進度', True))
    return out


def success(d):
    d = _dict(d, '成功公式')
    terms = []
    for i, t in enumerate(_list(d.get('terms'), '成功公式', 4, 4)):
        t = _dict(t, '成功公式')
        item = dict(k=_t(t.get('k'), '成功公式的欄名', 8), v=_t(t.get('v'), '成功公式的內容', 30))
        if i == 3:
            item.update(src=_src(t.get('src'), '成功公式的值'), key=_key(t.get('key'), '成功公式的值', True))
        terms.append(item)
    return dict(headline=_headline(d, '成功公式'), terms=terms, quote=_t(d.get('quote'), '本人原話', 600, False))


def time(d):
    d = _dict(d, '時間花在哪')
    week = []
    for w in _list(d.get('week'), '一週的時間', 6, 1):
        w = _dict(w, '一週的時間')
        cls = w.get('cls', '')
        if cls not in {'', 'main', 'hand'}:
            raise ValueError('時間的標記只能是主要（main）或可以交給助手（hand）。')
        week.append(dict(n=_t(w.get('n'), '時間項目', 10), h=_num(w.get('h'), '時數', 0, 168), cls=cls, key=_key(w.get('key'), '時間項目')))
    h = _dict(d.get('handoff'), '可以交給助手的時間')
    fr = _dict(d.get('free'), '有空的時段')
    dy = _dict(d.get('day'), '一天的時段')
    start, end = _num(dy.get('start'), '一天從幾點', 0, 23), _num(dy.get('end'), '一天到幾點', 1, 24)
    if end <= start:
        raise ValueError('一天的時段要從早到晚。')
    busy = []
    for b in _list(dy.get('busy', []), '忙的時段', 6):
        if not isinstance(b, list) or len(b) != 2:
            raise ValueError('忙的時段要寫成「開始、結束」。')
        busy.append([_num(b[0], '忙的開始', start, end), _num(b[1], '忙的結束', start, end)])
    return dict(headline=_headline(d, '時間花在哪'), week=week,
                handoff=dict(v=_num(h.get('v'), '可以交給助手的時數', 0, 168), src=_src(h.get('src'), '可以交給助手的時數'), key=_key(h.get('key'), '可以交給助手的時數', True)),
                free=dict(**{'from': _num(fr.get('from'), '有空從幾點', start, end)}, to=_num(fr.get('to'), '有空到幾點', start, end),
                          label=_t(fr.get('label'), '有空時段的說明', 30), src=_src(fr.get('src'), '有空的時段'), key=_key(fr.get('key'), '有空的時段')),
                day=dict(start=start, end=end, busy=busy, ticks=[int(_num(x, '時刻', 0, 24)) for x in _list(dy.get('ticks', []), '時刻', 8)]))


def opps(d):
    d = _dict(d, '三個機會')
    items = []
    for it in _list(d.get('items'), '機會', 3, 1):
        it = _dict(it, '機會')
        if it.get('kind') not in OPP_KINDS:
            raise ValueError('機會只分三種：補洞、放大成功、交給助手。')
        items.append(dict(kind=it['kind'], node=_t(it.get('node'), '機會的格子', 6, False), t=_t(it.get('t'), '機會的做法', 40),
                          v=_t(it.get('v'), '機會值多少', 16), vcls={'leak': 'leak', 'acc': 'acc'}.get(it.get('vcls'), ''),
                          key=_key(it.get('key'), '機會值多少', True),
                          ctx=[[_t(c[0], '脈絡', 30), _src(c[1], '脈絡')] for c in
                               (x if isinstance(x, list) and len(x) == 2 else (None, None) for x in _list(it.get('ctx', []), '脈絡', 3))]))
    out = dict(headline=_headline(d, '三個機會'), goal=_t(d.get('goal'), '目標', 60), bounds=_t(d.get('bounds'), '界線', 60, False), items=items)
    if d.get('learned') is not None:
        out['learned'] = [[_t(x[0], '學到的', 16), _t(x[1], '學到的說明', 40)] for x in
                          (y if isinstance(y, list) and len(y) == 2 else (None, None) for y in _list(d['learned'], '學到的', 4))]
    return out


def map_(d):
    d = _dict(d, '附近')
    c = _dict(d.get('center'), '地圖中心')
    pins = []
    for p in _list(d.get('pins'), '地圖上的對象', 12, 1):
        p = _dict(p, '地圖上的對象')
        if p.get('st') not in PIN_STATES:
            raise ValueError('地圖上的對象狀態只能是：還沒聯絡、聯絡中、成交或訂過。')
        pins.append(dict(n=_t(p.get('n'), '對象名稱', 20), lat=_num(p.get('lat'), '緯度', -90, 90), lng=_num(p.get('lng'), '經度', -180, 180),
                         st=p['st'], chip=_t(p.get('chip'), '對象狀態', 10), note=_t(p.get('note'), '對象備註', 80, False),
                         src=_src(p.get('src', 'web'), '對象')))
    out = dict(headline=_headline(d, '附近'), cond=_t(d.get('cond'), '挑選條件', 60, False), cond_src=_src(d.get('cond_src', 'web'), '挑選條件'),
               center=dict(lat=_num(c.get('lat'), '中心緯度', -90, 90), lng=_num(c.get('lng'), '中心經度', -180, 180)), pins=pins)
    if d.get('px_per_m') is not None:
        out['px_per_m'] = _num(d['px_per_m'], '地圖比例', 0.02, 2)
    return out


def data(d):
    d = _dict(d, '資料')
    lanes = []
    for i, l in enumerate(_list(d.get('lanes'), '資料的四種狀態', 4, 4)):
        l = _dict(l, '資料')
        items = [[_t(x[0] if isinstance(x, list) and x else None, '資料項目', 30)] for x in _list(l.get('items', []), '資料項目', 6)]
        lanes.append(dict(cls=LANES[i], title=_t(l.get('title'), '資料分類', 12), items=items))
    return dict(headline=_headline(d, '資料'), lanes=lanes)


def next_(d):
    d = _dict(d, '下一步')
    t, r = _dict(d.get('task'), '第一件事'), _dict(d.get('rhythm'), '節奏')
    on = _list(r.get('on', []), '節奏的星期', 7)
    if not all(isinstance(x, int) and not isinstance(x, bool) and 0 <= x <= 6 for x in on):
        raise ValueError('節奏的星期要用 0（週一）到 6（週日）。')
    return dict(headline=_headline(d, '下一步'),
                task=dict(k=_t(t.get('k'), '第一件事的標籤', 12), t=_t(t.get('t'), '第一件事', 40), to=_t(t.get('to'), '草稿要給誰', 30, False),
                          draft=_t(t.get('draft'), '草稿', 300, False)),
                rhythm=dict(on=on, cap=_t(r.get('cap'), '節奏', 30), rc=_t(r.get('rc'), '節奏的回執', 60, False)))


def sources(d):
    d = _dict(d, '出處')
    if len(d) > 60:
        raise ValueError('出處最多 60 條。')
    return {_t(k, '出處編號', 40): dict(title=_t(v.get('title'), '出處標題', 30), value=_t(v.get('value'), '出處的值', 30, False),
                                         src=_src(v.get('src'), '出處'), body=_t(v.get('body'), '出處說明', 600))
            for k, v in ((k, _dict(v, '出處')) for k, v in d.items())}


def persona(d):
    """本命：這家店的星座、顏色、助手的眼睛。骨架固定、表情自由——顏色和眼睛只能從定好的選項挑，
    星座的每一顆星都要指到地圖上真的有的一件事（不是算命）。"""
    d = _dict(d, '本命')
    hue, eyes = d.get('hue', 'orange'), d.get('eyes', 'capsule')
    if hue not in HUES:
        raise ValueError('本命色只能從這八個挑：' + '、'.join(HUES) + '。')
    if eyes not in EYES:
        raise ValueError('助手的眼睛只能從這三種挑：' + '、'.join(EYES) + '。')
    out = dict(hue=hue, eyes=eyes)
    if d.get('sign') is not None:
        g = _dict(d['sign'], '本命星座')
        stars = _list(g.get('stars'), '本命星座的星', 5, 3)
        if not all(isinstance(x, str) and STAR_PATH.match(x) for x in stars):
            raise ValueError('本命星座的每一顆星都要指到地圖上的一件事，例如 who.facts.0、success.terms.2、time.week.1。')
        if len(set(stars)) != len(stars):
            raise ValueError('本命星座的星不能重複。')
        out['sign'] = dict(name=_t(g.get('name'), '本命星座的名字', 6), line=_t(g.get('line'), '本命星座的那一句話', 28), stars=stars)
    return out


CHECK = dict(store=store, scale=scale, who=who, key=key, flow=flow, success=success, time=time, opps=opps, map=map_, data=data, next=next_, persona=persona)


def validate(payload):
    """檢查這次交進來的那幾塊；沒交的塊不檢查、不動。"""
    payload = _dict(payload, '脈絡地圖')
    unknown = set(payload) - set(SECTIONS) - {'sources'}
    if unknown:
        raise ValueError('脈絡地圖沒有這幾塊：' + '、'.join(sorted(unknown)))
    out = {k: CHECK[k](payload[k]) for k in SECTIONS if k in payload}
    if 'sources' in payload:
        out['sources'] = sources(payload['sources'])
    if not out:
        raise ValueError('這次沒有交任何一塊。')
    return out


def _keys(section):
    """這一塊用到的出處編號。"""
    found = set()
    def walk(v):
        if isinstance(v, dict):
            for k, x in v.items():
                if k == 'key' and isinstance(x, str) and x:
                    found.add(x)
                else:
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(section)
    return found


def merge(state, payload):
    """把這次交進來的塊換上去；每個出處編號都要找得到，找不到就整筆不收。"""
    p = validate(payload)
    s = copy.deepcopy(state)
    m = s.setdefault('map', dict(revision=0, updated={}, sources={}))
    merged_sources = {**m.get('sources', {}), **p.get('sources', {})}
    for name in SECTIONS:
        if name in p:
            missing = _keys(p[name]) - set(merged_sources)
            if missing:
                raise ValueError('這些數字還沒寫出處：' + '、'.join(sorted(missing)) + '。先把出處放進 sources 再交。')
    at = now()
    for name in SECTIONS:
        if name in p:
            m[name] = p[name]
            m['updated'][name] = at
    m['sources'] = merged_sources
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s


def model(state):
    """給畫面用：地圖有的就畫；還沒問到的塊，畫面會顯示「還在問」。"""
    m = copy.deepcopy(state.get('map') or {})
    if not m:
        return None
    m.pop('revision', None)
    return m
