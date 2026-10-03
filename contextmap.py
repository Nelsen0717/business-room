"""脈絡地圖：訪談中途就能交、一塊一塊長大。純資料檢查與合併，不呼叫模型。

助手每答完一站，就把長出來的那幾塊交進來（agent.py map --file）。同一塊再交一次就換成新的；
沒交的塊保留原樣。畫面上的每個數字都要指得回一條出處（sources），答不出「從哪來」的數字不收。
v13.1 多了模組（mods，樂高）：一次最多三個在跑，今天的事可以帶它從哪個模組來（mod）；
還有你的小二（companion）：名字、怎麼叫他、語氣、長相、動態。顏色和眼睛沿用本命（persona），不另存。
v14（做成你的形狀）：模組分獲客做法（way）與日常工具（tool），可以帶只放資料的畫面（view，三種積木，
算出來的數由程式算）；每個模組自己一個 rev；小二那一格可以換成照片（skin、photo）；版面分組（layout）。
伺服器讀檔時也跑同一套檢查（check_map）。
"""
import copy, re
from domain import NODES, now

SRC = {'said', 'data', 'web', 'est', 'calc', 'youest'}
# 紀錄另外多一種出處：screen＝他在畫面上改的（調整器存檔）。只收在紀錄裡，其他塊照舊只收上面六種
LOG_SRC = SRC | {'screen'}
STEPS = ('S', 'C', 'A', 'L', 'E')
SECTIONS = ('store', 'scale', 'who', 'key', 'flow', 'success', 'time', 'opps', 'map', 'data', 'next', 'persona',
            'stage', 'purpose', 'people', 'goals', 'today', 'log', 'rhythm', 'offer', 'assets', 'asks', 'mods', 'companion', 'layout')
# 給他看的塊名（讀檔不合格時的那一句白話用）
SECTION_WORDS = dict(store='店名', scale='SCALE', who='我理解的你', key='最重要的數字', flow='六格', success='成功公式', time='時間花在哪',
                     opps='三個機會', map='附近', data='資料', next='這一週', persona='本命', stage='訪談進度', purpose='目的',
                     people='你的客人', goals='目標', today='今天', log='紀錄', rhythm='節奏', offer='你的招牌', assets='存下來的',
                     asks='想問你', mods='模組', companion='小二', layout='版面', sources='出處')
NODE_STATES = {'leak', 'hole', 'rel', 'later', 'unknown'}
PIN_STATES = {'todo', 'going', 'won', 'past', 'drop'}   # drop：不再追，從圖上拿掉（past 是「訂過」，留在圖上）
MOST_PINS = 12
PIN_KINDS = ('shop', 'hub')          # 店；聚點（材料行、學校、社團、商圈協會：一次碰得到很多人）
MAP_MODES = ('store', 'area')        # 有實體店：畫中心與走路圈；沒有：只畫對象
PLACE_KINDS = ('group', 'hub', 'list', 'event')   # 社團、聚點、名錄、活動
LIST_KINDS = ('own', 'borrowed', 'none')          # 333 的名單：自己的、借來的、還沒有
LANES = ('on', 'can', 'only', 'none')
OPP_KINDS = {'補洞', '放大成功', '交給小二', '交給助手'}   # 交給助手＝v11 的舊寫法，照收
HUES = ('orange', 'coral', 'berry', 'violet', 'indigo', 'teal', 'green', 'mustard')
EYES = ('capsule', 'round', 'sleepy')
# v13：新客／回頭客為主，付費與其他也接得住
LANE_KEYS = ('new', 'return', 'paid', 'other')
TYPE_LANES = ('new', 'return', 'exist')
DONE = ('todo', 'done', 'skip')
RESULTS = ('replied', 'booked', 'won', 'none', 'later')
RUN_KINDS = ('open', 'close', 'week')
RUN_STATES = ('set', 'todo', 'manual')
INTAKE_HOW = ('folder', 'connector', 'said', 'photo')
CADENCE = ('daily', 'weekly', 'manual')
LOG_KINDS = ('open', 'close', 'week', 'note')
# 新的做法先「學習期」（找出哪種做法有效），跑順了才「衝刺期」（追結果）
PHASES = ('learn', 'push')
# 會越積越多、不用每天重做的四種東西：自己的名單、官網與商家頁、被搜得到、不用人工的流程
ASSET_KINDS = ('list', 'site', 'search', 'flow')
# v13.1 樂高：內建模組。id 固定，程式與畫面都認這張表；正文在 模組/<id>.md（安裝到 .business-room/模組/）
# 欄位：id、名字、偏哪一邊（lane）、在哪一格（node）、存進哪一種（grows，付費廣告沒有）
MOD_TABLE = (
    ('dormant-ties', '舊識問候', 'new', '找客', 'list'),
    ('hubs', '聚點', 'new', '找客', 'list'),
    ('directory', '名錄開發', 'new', '找客', 'list'),
    ('site-page', '官網與商家頁', 'new', '找客', 'site'),
    ('social-post', '社群內容', 'new', '找客', 'search'),
    ('fast-reply', '一小時回覆', 'new', '迎客', 'flow'),
    ('one-page-offer', '一次講完的報價', 'new', '成交', 'site'),
    ('review-ask', '評論邀請', 'other', '口碑', 'search'),
    ('referral', '轉介紹', 'new', '口碑', 'list'),
    ('own-list', '自己的名單', 'other', '養客', 'list'),
    ('winback-ladder', '叫回梯子', 'return', '回客', 'list'),
    ('fresh-start', '新起點問候', 'return', '回客', 'list'),
    ('paid-ads', '付費廣告', 'paid', '找客', None),
    ('auto-flow', '不用人工的流程', 'other', '迎客', 'flow'),
)
LIBRARY_MODS = tuple(x[0] for x in MOD_TABLE)
LIBRARY = {i: dict(name=n, lane=lane, node=node, grows=g) for i, n, lane, node, g in MOD_TABLE}
MOD_FROM = ('library', 'mine')                  # 內建的；他自己長的（寫在「我的經營室/模組/」，my- 開頭）
MOD_STATES = ('try', 'on', 'paused', 'done')    # 試做中、開著、暫停、收工
RUNNING = ('try', 'on')                         # 在跑的
MOST_RUNNING, MOST_MODS = 3, 8                  # 減法：一次最多三個獲客做法在跑；全部（獲客做法＋日常工具）最多八個
# v14：模組的種類。way＝獲客做法（掛六格、算進三個在跑、先試兩週）；tool＝日常工具（不掛六格、不算進三個在跑、要寫 for）
MOD_KINDS = ('way', 'tool')
MOD_ON = ('open', 'close', 'week', 'day')       # 掛在哪些例行上：開門、打烊、盤點、換天（只有這四個，小二不能自己加）
MOD_BY = ('xiaoer', 'owner')                    # 這個模組最後是誰改的：小二交的／他在畫面上按的（程式記，交了也照程式的）
MOD_ACTS = ('done', 'skip', 'pick')             # 模組的按鈕只有三種：做了、先不做、選一個
VIEW_TYPES = ('bignum', 'listrow', 'verify')    # 積木只有三種：大數字、名單列、驗算
MOST_BLOCKS, MOST_ROWS, MOST_PICKS = 6, 8, 4
# 積木裡程式算的欄位：小二交了也忽略（不擋、不存），畫面只從 pack.views 讀算好的
VIEW_CALC = dict(bignum={'delta'}, listrow=set(), verify={'lhs', 'rhs', 'diff', 'ok'})
ROW_CALC = {'state', 'days'}
MOD_CALC = {'halted'}
# 版面：照 contextmap.js 的 ORDER_DAY；第一屏的東西搬不出來，也搬不進去
DAY_BLOCKS = ('today', 'asks', 'mods', 'who', 'offer', 'people', 'aim', 'assets', 'flow', 'success', 'opps', 'map', 'data', 'rhythm', 'next')
FIRST_SCREEN = ('today', 'asks', 'companion', 'xiaoer', 'orbit', 'dayline', 'three', 'alert', 'alerts')
GROUP_BLOCKS = tuple(b for b in DAY_BLOCKS if b not in FIRST_SCREEN)
MOST_GROUPS = 8
WHOLE_MAP = '整份地圖'   # check_map 回報「整份地圖格式不符」用的塊名（不能用 map：map 是「附近」那一塊）
PERDAY_MIN = 0.001     # 名單列「一天大約用多少」：0（不是每天用）或 0.001 以上；更小的會算出幾百位數的天
STALE_LAYOUT = '畫面上剛改過版面，先照畫面上的。'
# 字的檢查（v14 新欄位與積木）：不收角括號、網址、色碼、換行這類控制字元
URLISH = re.compile(r'(?i)(?://|www\.|(?:javascript|vbscript|data|mailto|file|https?|ftp):|[a-z0-9-]+\.(?:com|net|org|tw|io|co|app|dev|me|info|biz|xyz|ly|cc|gl|site|shop|page|link|ai)(?![a-z0-9]))')
COLORISH = re.compile(r'(?i)(?:#[0-9a-f]{3,8}(?![0-9a-z])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\()')
CONTROL = re.compile(r'[\x00-\x1f\x7f]')
SMALL_LIST = 20                                 # 名單少於 20 位：先從新客開始（333 的比例在小名單會跳）
# 你的小二（10/2 15:30 定案、17:00 簡化）：只開放表情層；顏色、眼睛在 persona。配件（acc、art）已拿掉
TONES = ('warm', 'brisk', 'playful', 'steady')
FACES = ('round', 'bean', 'soft')
BLINKS = ('slow', 'normal', 'lively')
BYS = ('xiaoer', 'owner', 'agent')
COMPANION_KEYS = ('name', 'call', 'tone', 'voice', 'face', 'follow', 'blink', 'hello', 'by', 'rev')
COMPANION_DEFAULT = dict(name='小二', call='掌櫃的', tone='warm', voice='', face='round',
                         follow=True, blink='normal', hello='', by='xiaoer', rev=0)
# v14：小二那一格可以換成照片。沒寫就是畫的小二（drawn），存檔裡也不出現這兩個欄位
COMPANION_MORE = ('skin', 'photo')
COMPANION_ALL = COMPANION_KEYS + COMPANION_MORE
SKINS = ('drawn', 'photo')
PHOTO_DIR = '作品/'
COMPANION_GONE = ('acc', 'art')     # 舊格式的配件：交進來就拿掉、回一句白話，不整包擋
GONE_COMPANION = '小二現在不戴配件了，交來的配件已經拿掉，其他照收。下次交小二不用寫配件。'
STALE_COMPANION = '畫面上剛改過你的小二，先照畫面上的。'
LANE_WORDS = {'new': '新客', 'return': '回頭客', 'paid': '付費', 'other': '其他'}
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
DIGIT = re.compile(r'[0-9０-９]')
HHMM = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
SLUG = re.compile(r'^[a-z0-9][a-z0-9-]{0,23}$')
MINE = re.compile(r'^my-[a-z0-9][a-z0-9-]*$')
# 本命星座的每一顆星，都要指到地圖上真的有的一件事（格式照這張表）
STAR_PATH = re.compile(r'^(who\.facts\.\d|who\.fix|key|success\.terms\.\d|time\.(week\.\d|free|handoff)'
                       r'|flow\.(nodes\.(找客|迎客|成交|口碑|養客|回客)|eq\.inputs\.\d|funnel\.rows\.\d)'
                       r'|opps\.items\.\d(\.ctx\.\d)?|map\.pins\.\d{1,2}|data\.lanes\.\d\.items\.\d{1,2}'
                       r'|purpose|people\.types\.\d|goals\.items\.\d|offer|offer\.special\.\d|assets\.items\.\d|mods\.items\.\d)$')


def _t(value, label, limit, required=True):
    if value is None and not required:
        return ''
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
        raise ValueError(f'地圖的「{label}」請用 {limit} 字以內的一句話。')
    return value.strip()


def _mtext(value, label, limit, required=True):
    """模組的字（v14）：畫面會直接顯示，跟小二的字（_plain）一樣不收角括號。"""
    out = _t(value, label, limit, required)
    if '<' in out or '>' in out:
        raise ValueError(f'地圖的「{label}」只收文字，不收 < > 這種符號。')
    return out


def _word(value, label, limit, required=True):
    """積木、版面、日常工具的 for（v14 新加的字）：不收角括號、網址、色碼、換行。字數上限照 _t 的慣例。"""
    out = _mtext(value, label, limit, required)
    if URLISH.search(out):
        raise ValueError(f'地圖的「{label}」不收網址，寫成一句話就好。')
    if COLORISH.search(out):
        raise ValueError(f'地圖的「{label}」不收色碼；顏色由經營室自己配（本命色）。')
    if CONTROL.search(out):
        raise ValueError(f'地圖的「{label}」不收換行或控制字元。')
    return out


def _rev(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f'{label}要是 0 以上的整數，照 daily 裡的那個數字寫。')
    return value


def safe_rel(path):
    """「作品/豆豆.jpg」這種相對路徑：不能用 / 開頭、不能有 ..、空的一段、反斜線、冒號或控制字元。"""
    if not isinstance(path, str) or not path or len(path) > 200 or path.startswith('/'):
        return False
    if '\\' in path or ':' in path or CONTROL.search(path):
        return False
    return all(part not in ('', '.', '..') for part in path.split('/'))


def _src(value, label):
    if value not in SRC:
        raise ValueError(f'地圖的「{label}」要標出處：你說的、你的資料、查到的、估的、算的或你估的。')
    return value


def _log_src(value):
    if value not in LOG_SRC:
        raise ValueError('地圖的「紀錄」要標出處：你說的、你的資料、查到的、估的、算的、你估的，或你在畫面上改的（screen）。')
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


def _bool(value, label, default=None):
    """是非題只收 true／false；寫成字串 "false" 會被當成真，所以直接擋下。"""
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ValueError(f'地圖的「{label}」只能寫 true 或 false。')
    return value


def _key(value, label, required=False):
    if value is None and not required:
        return None
    if value is None:
        raise ValueError(f'地圖的「{label}」有數字，要寫出處編號（key），並把出處放進 sources。')
    return _t(value, label + '的出處編號', 40)


def _headline(d, label):
    return _t(d.get('headline'), label + '的重點句', 30)


def store(d):
    d = _dict(d, '店名')
    out = dict(name=_t(d.get('name'), '店名', 40), meta=_t(d.get('meta'), '地區與時間', 60, False))
    # 示範店（虛構演練）：寫 demo true，畫面標「示範」；店名後面加「（示範）」照舊
    if _bool(d.get('demo'), '是不是示範店（demo）', False):
        out['demo'] = True
    return out


def scale(d):
    d = _dict(d, 'SCALE')
    if d.get('step') not in STEPS:
        raise ValueError('SCALE 的步驟只能是 S、C、A、L、E。')
    return dict(step=d['step'], loop=int(_num(d.get('loop', 1), 'SCALE 第幾圈', 1, 50)), label=_t(d.get('label'), 'SCALE 說明', 30, False))


def who(d):
    d = _dict(d, '我理解的你')
    facts = [dict(t=_t(f.get('t'), '關鍵事實', 30), src=_src(f.get('src'), '關鍵事實'),
                  key=_key(f.get('key'), '關鍵事實', bool(DIGIT.search(f.get('t') or ''))))
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
        raise ValueError('最重要的數字要標是「最卡的一格」（leak）還是「成果」（win）。')
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
            raise ValueError(f'「{n}」的狀態要是：最卡的一格（leak）、也卡住（hole）、有關（rel）、先不做（later）或還不知道（unknown）。')
        item = dict(st=x['st'], s=_t(x.get('s'), n + '底下的短字', 12, False), why=_t(x.get('why'), n + '的原因', 80, False),
                    more=_t(x.get('more'), n + '的補充', 160, False), value=_t(x.get('value'), n + '的數字', 20, False),
                    now=_t(x.get('now'), n + '你現在怎麼做', 40, False), tip=_t(x.get('tip'), n + '的一句建議', 40, False))
        if x.get('src') is not None:
            item['src'] = _src(x['src'], n)
        if DIGIT.search(item['value'] + item['s']):
            if 'src' not in item:
                item['src'] = _src(None, n + '的數字')
            if x.get('key') is not None:
                item['key'] = _key(x['key'], n + '的數字')
        out_nodes[n] = item
    leaks = [n for n, x in out_nodes.items() if x['st'] == 'leak']
    holes = [n for n, x in out_nodes.items() if x['st'] in {'leak', 'hole'}]
    if len(leaks) > 1:
        raise ValueError('最卡的一格只能有一格；第二格請標「也卡住」（hole）。')
    if len(holes) > 2:
        raise ValueError('一次最多標兩格卡住：先補最卡的一兩格，其他的下一圈再看。')
    out = dict(headline=_headline(d, '客人怎麼走'), nodes=out_nodes)
    if d.get('eq') is not None:
        e = _dict(d['eq'], '算式')
        out['eq'] = dict(inputs=[[_t(a, '算式項目', 20), _t(b, '算式數值', 16)] for a, b in
                                 (x if isinstance(x, list) and len(x) == 2 else (None, None) for x in _list(e.get('inputs'), '算式項目', 6, 1))],
                         res=_t(e.get('res'), '算式結果', 16), key=_key(e.get('key'), '算式結果', True))
    for n, item in out_nodes.items():
        # 格子裡的數字（value 或底下的短字 s）要指得到出處；最大的洞的數字就是那條算式，沿用算式的出處
        if DIGIT.search(item['value'] + item['s']) and not item.get('key'):
            if item['st'] == 'leak' and 'eq' in out:
                item['key'] = out['eq']['key']
            elif item['st'] != 'leak':
                raise ValueError(f'「{n}」的數字（{item["value"] or item["s"]}）要寫出處編號（key），並把出處放進 sources。')
            # 最大的洞這一次沒帶算式：合併時用地圖上已有的算式或「最重要的數字」的出處
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
        week.append(dict(n=_t(w.get('n'), '時間項目', 10), h=_num(w.get('h'), '時數', 0, 168), cls=cls, key=_key(w.get('key'), '時間項目', True)))
    h = _dict(d['handoff'], '可以交給助手的時間') if d.get('handoff') is not None else None
    fr = _dict(d.get('free'), '有空的時段')
    dy = _dict(d['day'], '一天的時段') if d.get('day') is not None else {'start': 0, 'end': 24}
    start, end = _num(dy.get('start'), '一天從幾點', 0, 23), _num(dy.get('end'), '一天到幾點', 1, 24)
    if end <= start:
        raise ValueError('一天的時段要從早到晚。')
    busy = []
    for b in _list(dy.get('busy', []), '忙的時段', 6):
        if not isinstance(b, list) or len(b) != 2:
            raise ValueError('忙的時段要寫成「開始、結束」。')
        busy.append([_num(b[0], '忙的開始', start, end), _num(b[1], '忙的結束', start, end)])
    return dict(headline=_headline(d, '時間花在哪'), week=week,
                handoff=None if h is None else dict(v=_num(h.get('v'), '可以交給助手的時數', 0, 168), src=_src(h.get('src'), '可以交給助手的時數'), key=_key(h.get('key'), '可以交給助手的時數', True)),
                free=dict(**{'from': _num(fr.get('from'), '有空從幾點', start, end)}, to=_num(fr.get('to'), '有空到幾點', start, end),
                          label=_t(fr.get('label'), '有空時段的說明', 30), src=_src(fr.get('src'), '有空的時段'), key=_key(fr.get('key'), '有空的時段')),
                day=None if d.get('day') is None else dict(start=start, end=end, busy=busy, ticks=[int(_num(x, '時刻', 0, 24)) for x in _list(dy.get('ticks', []), '時刻', 8)]))


def opps(d):
    d = _dict(d, '三個機會')
    items = []
    for it in _list(d.get('items'), '機會', 3, 1):
        it = _dict(it, '機會')
        if it.get('kind') not in OPP_KINDS:
            raise ValueError('機會只分三種：補洞、放大成功、交給小二。')
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


MAP_HEADER = ('headline', 'cond', 'cond_src', 'center', 'mode', 'px_per_m')


def _pin(p):
    p = _dict(p, '地圖上的對象')
    if p.get('st') not in PIN_STATES:
        raise ValueError('地圖上的對象狀態只能是：todo 還沒聯絡、going 聯絡中、won 成交、past 訂過，或 drop 不再追（從圖上拿掉）。')
    if p['st'] == 'drop':
        # 不再追：只要名稱對得上就拿掉，其他欄位不用寫
        return dict(n=_t(p.get('n'), '對象名稱', 20), st='drop')
    return dict(n=_t(p.get('n'), '對象名稱', 20), lat=_num(p.get('lat'), '緯度', -90, 90), lng=_num(p.get('lng'), '經度', -180, 180),
                st=p['st'], chip=_t(p.get('chip'), '對象狀態', 10), note=_t(p.get('note'), '對象備註', 80, False),
                src=_src(p.get('src', 'web'), '對象'), kind=_choice(p.get('kind'), '對象的種類（shop 店、hub 聚點）', PIN_KINDS, 'shop'))


def map_(d):
    """附近。之後只交改了的那幾家：表頭（headline、center、mode、cond…）沒交就沿用地圖上的，合併時補回；
    第一次交還是要有 headline 和 center。不再追的那家寫 drop，就從圖上拿掉。"""
    d = _dict(d, '附近')
    raw = _list(d.get('pins'), '地圖上的對象', MOST_PINS * 2, 1)
    pins = [_pin(p) for p in raw]
    if sum(1 for p in pins if p['st'] != 'drop') > MOST_PINS:
        raise ValueError(f'附近的對象最多 {MOST_PINS} 家。')
    out = dict(pins=pins, _given=sorted(k for k in MAP_HEADER if d.get(k) is not None))
    if d.get('headline') is not None:
        out['headline'] = _headline(d, '附近')
    if d.get('center') is not None:
        c = _dict(d.get('center'), '地圖中心')
        out['center'] = dict(lat=_num(c.get('lat'), '中心緯度', -90, 90), lng=_num(c.get('lng'), '中心經度', -180, 180))
    out['cond'] = _t(d.get('cond'), '挑選條件', 60, False)
    out['cond_src'] = _src(d.get('cond_src', 'web'), '挑選條件')
    out['mode'] = _choice(d.get('mode'), '有沒有實體店（store 有、area 沒有）', MAP_MODES, 'store')
    if d.get('px_per_m') is not None:
        out['px_per_m'] = _num(d['px_per_m'], '地圖比例', 0.02, 2)
    return out


def _map_done(m):
    """合併完（或第一次交）：表頭要齊、drop 的拿掉、至少留一家。"""
    m = {k: v for k, v in m.items() if k != '_given'}
    m['pins'] = [p for p in m['pins'] if p['st'] != 'drop']
    if not m.get('center'):
        raise ValueError('地圖的「地圖中心」格式不符：第一次交附近要寫 center（lat、lng）。')
    if not m.get('headline'):
        _headline({}, '附近')
    if not m['pins']:
        raise ValueError('附近至少留一家：要把舊的都寫 drop，同一次先把要追的新對象一起交進來。')
    return m


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


def _choice(value, label, options, default=None):
    value = default if value is None else value
    if value not in options:
        raise ValueError(f'地圖的「{label}」只能是：' + '、'.join(options) + '。')
    return value


def _date(value, label):
    if not isinstance(value, str) or not DATE.match(value):
        raise ValueError(f'地圖的「{label}」請寫成 2026-10-02 這樣的日期。')
    return value


def _int(value, label, lo, hi):
    return int(_num(value, label, lo, hi))


def stage(d):
    """訪談走到第幾站；live 為真時畫面顯示訪談進度。"""
    d = _dict(d, '訪談進度')
    of = _int(d.get('of', 7), '訪談共幾站', 1, 9)
    return dict(at=_int(d.get('at'), '訪談第幾站', 1, of), of=of, label=_t(d.get('label'), '這一站的名字', 12, False),
                live=_bool(d.get('live'), '還在訪談嗎（live）', True))


def purpose(d):
    """目的：他做這門生意現在是為了什麼。用他的話，原話另外存。"""
    d = _dict(d, '目的')
    line, why = _t(d.get('line'), '目的', 40), _t(d.get('why'), '目的的補充', 60, False)
    # 目的寫了數字（例如「每個月多賺 3 萬」）就要指得到出處；原話（quote）是他說的，不用
    return dict(line=line, why=why, quote=_t(d.get('quote'), '目的的原話', 300, False), src=_src(d.get('src', 'said'), '目的'),
                key=_key(d.get('key'), '目的', bool(DIGIT.search(line + why))))


def people(d):
    """你的客人：最多三種，各自偏新客、回頭客或熟客；平常多久回來一次；333 法則決定先從哪一邊開始。"""
    d = _dict(d, '你的客人')
    types = []
    for t in _list(d.get('types'), '客人的種類', 3, 1):
        t = _dict(t, '客人的種類')
        item = dict(name=_t(t.get('name'), '客人種類的名字', 10), who=_t(t.get('who'), '是誰', 30), why=_t(t.get('why'), '為什麼來', 30),
                    path=_t(t.get('path'), '他們實際怎麼來的', 30, False),
                    where=_t(t.get('where'), '去哪找', 30), lane=_choice(t.get('lane'), '這種客人偏哪一邊（new 新客、return 回頭客、exist 熟客）', TYPE_LANES),
                    src=_src(t.get('src'), '客人的種類'))
        if t.get('n') is not None:
            item['n'] = _int(t['n'], '這種客人有幾位', 0, 1_000_000)
        if t.get('value') is not None:
            item['value'] = _t(t['value'], '這種客人值多少', 16)
        if t.get('unit') is not None:
            item['unit'] = _t(t['unit'], '這種客人的單位（家、位、人）', 4)
        if t.get('places') is not None:
            item['places'] = []
            for x in _list(t['places'], '去哪找的入口', 4):
                x = _dict(x, '去哪找的入口')
                pl = dict(n=_t(x.get('n'), '入口名稱', 20), kind=_choice(x.get('kind'), '入口的種類（group 社團、hub 聚點、list 名錄、event 活動）', PLACE_KINDS))
                if x.get('size') is not None:
                    pl['size'] = _int(x['size'], '入口有多少人', 0, 100_000_000)
                if x.get('url') is not None:
                    url = _t(x['url'], '入口網址', 200)
                    if not url.startswith(('https://', 'http://')):
                        raise ValueError('入口網址要是 https:// 開頭的公開網址。')
                    pl['url'] = url
                if x.get('checked') is not None:
                    pl['checked'] = _date(x['checked'], '入口查證的日期')
                if 'size' in pl:
                    pl['key'] = _key(x.get('key'), '入口的人數', True)
                item['places'].append(pl)
        if t.get('bands') is not None:
            b = _dict(t['bands'], '三圈各幾位')
            item['bands'] = {k: _int(b.get(k, 0), '三圈的人數', 0, 1_000_000) for k in ('in', 'slip', 'out')}
            if 'n' in item and item['n'] != sum(item['bands'].values()):
                raise ValueError(f'「{item["name"]}」寫了 {item["n"]} 位，三圈合計是 {sum(item["bands"].values())} 位；'
                                 '有三圈的那一種，人數要等於三圈合計（名單只算來過的人）。')
        if 'n' in item or 'value' in item or 'bands' in item:
            item['key'] = _key(t.get('key'), '客人的種類', True)
        types.append(item)
    out = dict(headline=_headline(d, '你的客人'), types=types)
    if d.get('cycle') is not None:
        c = _dict(d['cycle'], '平常多久回來一次')
        out['cycle'] = dict(days=_int(c.get('days'), '平常幾天回來一次', 1, 3650), src=_src(c.get('src'), '平常多久回來一次'),
                            key=_key(c.get('key'), '平常多久回來一次', True))
    if d.get('rule') is not None:
        r = _dict(d['rule'], '先從哪一邊開始')
        lst = _choice(r.get('list'), '名單是哪一種（own 自己的、borrowed 借來的、none 還沒有）', LIST_KINDS, 'own')
        if lst == 'none':
            # 還沒有自己的名單（新開的店、新課）：直接從新客開始，不硬塞情境值
            if r.get('start', 'new') != 'new':
                raise ValueError('還沒有名單時，起點只能是新客（new）。')
            out['rule'] = dict(list='none', total=0, dormant=0, start='new', auto='new', override=False, why=_t(r.get('why'), '為什麼從這一邊開始', 40, False),
                               key=_key(r.get('key'), '先從哪一邊開始'), set='start' in r)
            return out
        total = _int(r.get('total'), '名單上一共幾位', 1, 1_000_000)
        dormant = _int(r.get('dormant'), '很久沒來的有幾位', 0, total)
        # 名單少於 20 位先從新客開始；20 位以上照 333：很久沒來的超過三分之一，先從回頭客開始
        auto = 'new' if total < SMALL_LIST else ('return' if dormant * 3 > total else 'new')
        start = _choice(r.get('start', auto), '先從哪一邊開始（new 新客、return 回頭客）', ('new', 'return'))
        override = _bool(r.get('override'), '他要反過來嗎（override）', False)
        why = _t(r.get('why'), '為什麼從這一邊開始', 40, False)
        if start != auto and not override:
            if total < SMALL_LIST:
                raise ValueError(f'名單只有 {total} 位，少於 {SMALL_LIST} 位，先從新客開始。他想先做回頭客可以，請加上 override 和他的理由。')
            word = '回頭客' if auto == 'return' else '新客'
            raise ValueError(f'333 法則算出來要先從{word}開始：很久沒來的 {dormant} 位占 {round(dormant * 100 / total)}%。'
                             '他想反過來可以，請加上 override 和他的理由。')
        if override and not why:
            raise ValueError('起點跟 333 法則算的不一樣時，要寫他的理由。')
        out['rule'] = dict(list=lst, total=total, dormant=dormant, start=start, auto=auto, override=override, why=why, key=_key(r.get('key'), '先從哪一邊開始', True),
                           set='start' in r)
        banded = [t for t in types if 'bands' in t]
        if banded:
            all_n = sum(sum(t['bands'].values()) for t in banded)
            out_n = sum(t['bands']['out'] for t in banded)
            if (all_n, out_n) != (total, dormant):
                raise ValueError(f'三圈的人數要跟 333 對得起來：三圈合計 {all_n} 位、很久沒來 {out_n} 位；'
                                 f'333 寫名單 {total} 位、很久沒來 {dormant} 位。名單只算來過的人（預約了還沒來的不算）。')
    return out


def goals(d):
    """目的拆成的目標：新客、回頭客（付費、其他也接得住）；達成率＝（現在－起點）÷（目標－起點）。"""
    d = _dict(d, '目標')
    start, end = _date(d.get('from'), '目標的開始日'), _date(d.get('to'), '目標的到期日')
    if end < start:
        raise ValueError('目標的到期日要在開始日之後。')
    items = []
    for g in _list(d.get('items'), '目標', 4, 1):
        g = _dict(g, '目標')
        base, cur, target = (_num(g.get(k), '目標的' + w, -1_000_000_000, 1_000_000_000) for k, w in (('base', '起點'), ('now', '現在'), ('target', '目標值')))
        if target == base:
            raise ValueError('目標值要跟起點不一樣，才算得出達成率。')
        items.append(dict(lane=_choice(g.get('lane'), '目標屬於哪一邊（new、return、paid、other）', LANE_KEYS), t=_t(g.get('t'), '目標', 24),
                          base=base, now=cur, target=target, unit=_t(g.get('unit'), '目標的單位', 6), how=_t(g.get('how'), '怎麼做到', 40, False),
                          phase=_choice(g.get('phase'), '目標在哪個時期（learn 學習期、push 衝刺期）', PHASES, 'push'),
                          key=_key(g.get('key'), '目標', True),
                          # 現在值離開起點了，就要指得到「這個數字怎麼算的」（照地圖格式.md 的「怎麼算一位」）
                          now_key=_key(g.get('now_key'), '目標的現在值（now_key）', cur != base)))
        if g.get('learn') is not None:
            ln = _dict(g['learn'], '學習期試了幾種')
            done, of = _int(ln.get('done'), '已經試了幾種', 0, 20), _int(ln.get('of'), '要試幾種', 1, 20)
            items[-1]['learn'] = dict(t=_t(ln.get('t'), '在試什麼', 16), done=min(done, of), of=of)
    lead = []
    for x in _list(d.get('lead', []), '前導指標', 3):
        x = _dict(x, '前導指標')
        lead.append(dict(t=_t(x.get('t'), '前導指標', 20), done=_num(x.get('done'), '已經做了多少', 0, 1_000_000),
                         target=_num(x.get('target'), '要做多少', 1, 1_000_000), unit=_t(x.get('unit'), '前導指標的單位', 6), key=_key(x.get('key'), '前導指標', True)))
    return dict(headline=_headline(d, '目標'), **{'from': start}, to=end, items=items, lead=lead)


def _today_item(x, seen):
    x = _dict(x, '今天的事')
    iid = x.get('id')
    if not isinstance(iid, str) or not SLUG.match(iid):
        raise ValueError('今天的每件事要有一個英數小寫的編號（例如 call-peisheng），24 字內。')
    if iid in seen:
        raise ValueError('今天的事編號不能重複：' + iid)
    seen.add(iid)
    status = _choice(x.get('status'), '今天的事的狀態（todo、done、skip）', DONE, 'todo')
    item = dict(id=iid, lane=_choice(x.get('lane'), '今天的事屬於哪一邊（new、return、paid、other）', LANE_KEYS), t=_t(x.get('t'), '今天的事', 40),
                when=_t(x.get('when'), '什麼時候、在哪做', 12, False), to=_t(x.get('to'), '對象', 30, False),
                draft=_t(x.get('draft'), '草稿', 400, False), status=status)
    if x.get('node') is not None:
        item['node'] = _choice(x['node'], '今天的事在哪一格', NODES)
    if x.get('grows') is not None:
        item['grows'] = _choice(x['grows'], '這件事存進哪一種（list 名單、site 官網與商家頁、search 被搜得到、flow 不用人工的流程）', ASSET_KINDS)
    if x.get('mod') is not None:
        # 這件事從哪個模組來；要對到地圖上在跑的模組，合併時才對得到（今天和模組可能分兩次交）
        if not isinstance(x['mod'], str) or not SLUG.match(x['mod']):
            raise ValueError('今天的事帶的模組，要寫模組的編號（例如 directory、my-lunch-call）。')
        item['mod'] = x['mod']
    if x.get('try') is not None:
        if not isinstance(x['try'], bool):
            raise ValueError('「試新的」只能寫 true 或 false。')
        if x['try']:
            item['try'] = True
    if x.get('n') is not None:
        item['n'] = _int(x['n'], '今天的事幾件', 1, 999)
    if x.get('result') is not None:
        if status != 'done':
            raise ValueError('還沒做的事不能先寫結果。')
        item['result'] = _choice(x['result'], '結果（replied 回了、booked 約了、won 成交、none 沒回、later 晚點再說）', RESULTS)
    if x.get('at') is not None:
        item['at'] = _t(x['at'], '按下的時間', 40)
    if x.get('fix') is not None:
        item['fix'] = _t(x['fix'], '改他按過的狀態的理由', 40)
    return item


def today(d):
    """今天：開門時排好的一到五件事；狀態與結果由畫面按鈕寫回。"""
    d = _dict(d, '今天')
    seen = set()
    return dict(date=_date(d.get('date'), '今天的日期'), note=_t(d.get('note'), '開門的一句話', 60, False),
                items=[_today_item(x, seen) for x in _list(d.get('items'), '今天的事', 5, 1)])


LOG_FIELDS = {'date', 'kind', 't', 'src'}


def log(d):
    """紀錄：開門、打烊、盤點時助手寫的一句（新的在前）。
    寫法只有一種：{"items": [{date, kind, t, src}]}。只交一則、沒包 items（{date, kind, t}）或直接交一串，程式自動包好；
    以前這種寫法會回成功卻什麼都沒存。不認得的欄位一律擋下，不默默丟掉。"""
    if isinstance(d, list):
        d = {'items': d}
    d = _dict(d, '紀錄')
    if 'items' not in d and ({'kind', 't'} & set(d)):
        d = {'items': [d]}
    if set(d) - {'items'}:
        raise ValueError('紀錄只收 items：' + '、'.join(sorted(set(d) - {'items'})) + ' 不認得。寫法是 {"items": [{"date", "kind", "t", "src"}]}。')
    for y in d.get('items', []) if isinstance(d.get('items'), list) else []:
        extra = set(y) - LOG_FIELDS if isinstance(y, dict) else set()
        if extra:
            raise ValueError('紀錄的一則只收 date、kind、t、src：' + '、'.join(sorted(extra)) + ' 不認得。')
    return dict(items=[dict(date=_date(x.get('date'), '紀錄的日期'), kind=_choice(x.get('kind'), '紀錄的種類（open、close、week、note）', LOG_KINDS),
                            t=_t(x.get('t'), '紀錄', 80), src=_log_src(x.get('src', 'data')))
                       for x in (_dict(y, '紀錄') for y in _list(d.get('items', []), '紀錄', 40))])


def rhythm(d):
    """節奏：開門、打烊、盤點的時間與排程回執；資料怎麼進來。寫「排好了」一定要有回讀到的排程編號。"""
    d = _dict(d, '節奏')
    runs, kinds = [], set()
    for r in _list(d.get('runs', []), '例行', 3):
        r = _dict(r, '例行')
        kind = _choice(r.get('kind'), '例行的種類（open 開門、close 打烊、week 盤點）', RUN_KINDS)
        if kind in kinds:
            raise ValueError('同一種例行只寫一次。')
        kinds.add(kind)
        if not isinstance(r.get('at'), str) or not HHMM.match(r['at']):
            raise ValueError('例行的時間請寫成 08:30 這樣。')
        on = _list(r.get('on'), '例行的星期', 7, 1)
        if not all(isinstance(x, int) and not isinstance(x, bool) and 0 <= x <= 6 for x in on):
            raise ValueError('例行的星期要用 0（週一）到 6（週日）。')
        st = _choice(r.get('st'), '例行的狀態（set 排好了、todo 待排、manual 他自己叫）', RUN_STATES, 'todo')
        rid = _t(r.get('id'), '排程編號', 60, False)
        if st == 'set' and not rid:
            raise ValueError('寫「排好了」要附上回讀到的排程編號；沒有編號就寫 todo（待排）。')
        runs.append(dict(kind=kind, at=r['at'], on=sorted(set(on)), tool=_t(r.get('tool'), '在哪裡跑', 20, False), id=rid, st=st))
    intake = [dict(t=_t(x.get('t'), '資料進來的方式', 30), how=_choice(x.get('how'), '資料怎麼進來（folder、connector、said、photo）', INTAKE_HOW),
                   st=_choice(x.get('st'), '這條資料開著了嗎（on、todo）', ('on', 'todo'), 'todo'))
              for x in (_dict(y, '資料進來的方式') for y in _list(d.get('intake', []), '資料進來的方式', 6))]
    return dict(headline=_headline(d, '節奏'), cadence=_choice(d.get('cadence'), '節奏（daily 每天、weekly 每週、manual 他叫了才做）', CADENCE),
                runs=runs, intake=intake)


def offer(d):
    """你的招牌：你賣什麼、你特別在哪。「特別」要指得出客人真的說過或做過的事（評論、回購、轉介），不是老闆自己覺得。"""
    d = _dict(d, '你的招牌')
    items = [dict(t=_t(x.get('t'), '主力的商品或服務', 16), price=_t(x.get('price'), '價格', 16, False),
                  key=_key(x.get('key'), '主力的價格', bool(DIGIT.search(x.get('price') or ''))))
             for x in (_dict(y, '主力的商品或服務') for y in _list(d.get('items', []), '主力的商品或服務', 3))]
    special = []
    for x in _list(d.get('special', []), '你特別在哪', 3):
        x = _dict(x, '你特別在哪')
        special.append(dict(t=_t(x.get('t'), '你特別在哪', 24), proof=_t(x.get('proof'), '客人怎麼說或怎麼做過', 40),
                            src=_src(x.get('src'), '你特別在哪'), key=_key(x.get('key'), '你特別在哪', bool(DIGIT.search(x.get('proof') or '')))))
    out = dict(line=_t(d.get('line'), '一句話講你賣什麼', 40), items=items, special=special,
               me=_t(d.get('me'), '老闆本人的特色', 40, False), quote=_t(d.get('quote'), '本人原話', 300, False))
    return out


def assets(d):
    """存下來的：名單、官網與商家頁、被搜得到、不用人工的流程。發文是入口，這四樣才會越積越多。"""
    d = _dict(d, '存下來的')
    items, seen = [], set()
    for x in _list(d.get('items'), '存下來的東西', 4, 1):
        x = _dict(x, '存下來的東西')
        kind = _choice(x.get('kind'), '存下來的種類（list 名單、site 官網與商家頁、search 被搜得到、flow 不用人工的流程）', ASSET_KINDS)
        if kind in seen:
            raise ValueError('存下來的每一種只能寫一次：' + kind)
        seen.add(kind)
        item = dict(kind=kind, t=_t(x.get('t'), '存下來的東西', 16), note=_t(x.get('note'), '補一句', 30, False),
                    src=_src(x.get('src'), '存下來的東西'))
        if x.get('now') is not None:
            item['now'] = _int(x['now'], '現在有多少', 0, 10_000_000)
            item['unit'] = _t(x.get('unit'), '單位', 6)
            if x.get('base') is not None:
                item['base'] = _int(x['base'], '訪談那天有多少', 0, 10_000_000)
            item['key'] = _key(x.get('key'), '存下來的東西', True)
        items.append(item)
    return dict(headline=_headline(d, '存下來的'), items=items)


def asks(d):
    """想問你：排程跑的時候他不在，要問他的事寫在這裡（最多三則），畫面放在今天下面；他回到對話再答，答完就拿掉。"""
    d = _dict(d, '想問你')
    seen, items = set(), []
    for x in _list(d.get('items', []), '想問你的事', 3):
        x = _dict(x, '想問你的事')
        iid = x.get('id')
        if not isinstance(iid, str) or not SLUG.match(iid) or iid in seen:
            raise ValueError('想問你的每一則要有不重複的英數小寫編號（例如 ask-rhythm）。')
        seen.add(iid)
        items.append(dict(id=iid, q=_t(x.get('q'), '想問你的事', 60), why=_t(x.get('why'), '為什麼問', 40, False), date=_date(x.get('date'), '問的日期')))
    return dict(items=items)


def _mod(x, seen):
    x = _dict(x, '模組')
    mid = x.get('id')
    if not isinstance(mid, str) or not SLUG.match(mid):
        raise ValueError('每個模組要有一個英數小寫的編號（例如 directory、my-lunch-call），24 字內。')
    if mid in seen:
        raise ValueError('模組的編號不能重複：' + mid)
    seen.add(mid)
    origin = _choice(x.get('from'), '模組從哪來（library 內建、mine 他自己的）', MOD_FROM, 'mine' if mid.startswith('my-') else 'library')
    kind = _choice(x.get('kind'), '模組的種類（way 獲客做法、tool 日常工具）', MOD_KINDS, 'way')
    if origin == 'library':
        if mid not in LIBRARY:
            raise ValueError(f'內建模組裡沒有「{mid}」；內建的 14 個照地圖格式.md 的表寫。'
                             '表上沒有的做法，寫成他自己的模組：from 寫 mine、編號用 my- 開頭。')
        base = LIBRARY[mid]
        if kind == 'tool':
            raise ValueError(f'「{base["name"]}」是內建的獲客做法，kind 只能是 way；日常工具寫成他自己的模組：'
                             'from 寫 mine、編號用 my- 開頭、kind 寫 tool。')
        lane = _choice(x.get('lane'), '模組屬於哪一邊（new、return、paid、other）', LANE_KEYS, base['lane'])
        node = _choice(x.get('node'), '模組在哪一格', NODES, base['node'])
        if (lane, node) != (base['lane'], base['node']):
            raise ValueError(f'「{base["name"]}」是內建模組，固定屬於{LANE_WORDS[base["lane"]]}、{base["node"]}這一格；lane 和 node 照表寫，或不寫。'
                             '要拿來做別的事，寫成他自己的模組（my- 開頭）。')
        # 名字可以照他的說法改（例如「一次講完的團訂菜單」），不寫就用表上的
        name = _mtext(x.get('name'), '模組的名字', 10, False) or base['name']
    else:
        if not MINE.match(mid):
            raise ValueError('他自己的模組，編號要用 my- 開頭（例如 my-lunch-call），跟內建的分開。')
        name = _mtext(x.get('name'), '模組的名字', 10)
        if kind == 'way':
            lane = _choice(x.get('lane'), '模組屬於哪一邊（new、return、paid、other）', LANE_KEYS)
            node = _choice(x.get('node'), '模組在哪一格', NODES)
        else:
            # 日常工具不掛六格：寫了 lane、node 就擋下，免得畫面把它當成獲客做法
            if x.get('lane') not in (None, '') or x.get('node') not in (None, ''):
                raise ValueError(f'「{name}」是日常工具（tool），不掛六格：lane、node 不用寫。')
            lane = node = None
    st = _choice(x.get('st'), '模組的狀態（try 試做中、on 開著、paused 暫停、done 收工）', MOD_STATES)
    # 沒寫的日期存成空字串；從 daily 拿整塊原樣交回時，空字串也當沒寫
    start = _date(x['start'], '模組的開始日') if x.get('start') not in (None, '') else ''
    review = _date(x['review'], '模組的判斷日') if x.get('review') not in (None, '') else ''
    if st == 'try' and not (start and review):
        raise ValueError(f'「{name}」在試做中：要寫開始日（start）和判斷日（review），判斷日通常是開始後兩週。')
    if start and review and review <= start:
        raise ValueError(f'「{name}」的判斷日（{review}）要在開始日（{start}）之後。')
    why = x.get('why')
    if not isinstance(why, str) or not why.strip():
        raise ValueError(f'「{name}」要寫為什麼開（why）：指回他說過的話或他的資料，例如「張小姐那種是附近公司」。')
    why = _mtext(why, '為什麼開這個模組', 60)
    # why 裡有數字（例如「走路 10 分鐘內有 80 幾家公司」）跟其他數字同一條規矩：要寫 key，出處放進 sources
    why_key = _key(x.get('key'), f'{name}的為什麼', bool(DIGIT.search(why)))
    metrics = []
    for m in _list(x.get('metrics', []), '模組的數字', 3):
        m = _dict(m, '模組的數字')
        item = dict(t=_mtext(m.get('t'), '模組的數字叫什麼', 20))
        for k, word in (('now', '現在'), ('base', '起點'), ('target', '目標')):
            if m.get(k) is not None:
                item[k] = _num(m[k], f'模組的數字（{word}）', -1_000_000_000, 1_000_000_000)
        item['unit'] = _mtext(m.get('unit'), '模組數字的單位', 6, False)
        k = _key(m.get('key'), f'{name}的數字', any(w in item for w in ('now', 'base', 'target')))
        if k:
            item['key'] = k
        metrics.append(item)
    out = dict(id=mid, **{'from': origin}, kind=kind, name=name, why=why, lane=lane, node=node, st=st, start=start, review=review,
               metrics=metrics, next=_mtext(x.get('next'), '模組的下一步', 40, False), result=_mtext(x.get('result'), '模組判斷的結果', 60, False))
    if kind == 'tool':
        del out['lane'], out['node']
        # 日常工具一定要說省下的時間拿去做哪件獲客的事，守住「每天的時間回到獲客」
        if not isinstance(x.get('for'), str) or not x['for'].strip():
            raise ValueError(f'「{name}」是日常工具：要寫 for，省下的時間拿去做哪件獲客的事（例如「省下的時間拿去打給三家團訂公司」）。')
        out['for'] = _word(x['for'], f'{name}省下的時間拿去做什麼（for）', 40)
    elif x.get('for') not in (None, ''):
        raise ValueError(f'「{name}」是獲客做法（way），不用寫 for；for 是日常工具寫「省下的時間拿去做哪件獲客的事」。')
    if why_key:
        out['key'] = why_key
    if x.get('frees') is not None:
        out['frees'] = _frees(x['frees'], name)
    if x.get('on') is not None:
        out['on'] = _on(x['on'], name)
    if x.get('view') is not None:
        out['view'] = _view(x['view'], name)
    # 程式管的：rev（每存一次加一）、by（最後是誰改的）、pressed（他在畫面上按的）。交進來先驗，合併時照程式的規矩
    if x.get('rev') is not None:
        out['rev'] = _rev(x['rev'], f'「{name}」的 rev ')
    if x.get('by') is not None:
        out['by'] = _choice(x['by'], f'「{name}」最後是誰改的（by：xiaoer 小二交的、owner 他在畫面上按的）', MOD_BY)
    if x.get('pressed') is not None:
        out['pressed'] = _pressed(x['pressed'], name)
    return out


def _frees(d, name):
    """日常工具每週省下幾小時：{hours, est}；估的寫 est true（沒寫就當估的），實際量到的寫 false 並附 key。"""
    d = _dict(d, f'{name}省下的時間（frees）')
    extra = set(d) - {'hours', 'est', 'key'}
    if extra:
        raise ValueError(f'「{name}」的 frees 只收 hours、est、key：' + '、'.join(sorted(extra)) + ' 不認得。')
    out = dict(hours=_num(d.get('hours'), f'{name}每週省下幾小時（frees.hours）', 0, 168),
               est=_bool(d.get('est'), f'{name}省下的時數是不是估的（frees.est）', True))
    k = _key(d.get('key'), f'{name}省下的時數', not out['est'])
    if k:
        out['key'] = k
    return out


def _on(v, name):
    """掛在哪些例行上：open 開門、close 打烊、week 盤點、day 換天；只有這四個。"""
    v = _list(v, f'{name}掛在哪些例行（on）', len(MOD_ON))
    if not all(isinstance(x, str) and x in MOD_ON for x in v) or len(set(v)) != len(v):
        raise ValueError(f'「{name}」的 on 只能從 open（開門）、close（打烊）、week（盤點）、day（換天）挑，不重複。')
    return [x for x in MOD_ON if x in v]


def _keys_only(d, allowed, ignored, label):
    """積木只收認得的欄位：程式算的（ignored）交了也拿掉，其他不認得的擋下（不讓 html、style、url 這類欄位混進來）。"""
    d = _dict(d, label)
    extra = set(d) - set(allowed) - set(ignored)
    if extra:
        raise ValueError(f'{label}只收 ' + '、'.join(allowed) + '：' + '、'.join(sorted(map(str, extra))) + ' 不認得。')
    return d


def _row(r, i):
    r = _keys_only(r, ('name', 'have', 'safe', 'perday', 'unit', 'src', 'key'), ROW_CALC, f'名單列的第 {i + 1} 列')
    name = _word(r.get('name'), '名單列的名字（name）', 10)
    out = dict(name=name, have=_num(r.get('have'), f'「{name}」現在剩多少（have）', 0, 1_000_000_000),
               safe=_num(r.get('safe'), f'「{name}」的安全量（safe）', 0, 1_000_000_000))
    if r.get('perday') is not None:
        out['perday'] = _num(r['perday'], f'「{name}」一天大約用多少（perday）', 0, 1_000_000_000)
        if 0 < out['perday'] < PERDAY_MIN:
            raise ValueError(f'「{name}」一天大約用多少（perday）太小了：寫 {PERDAY_MIN} 以上；不是每天用、或不知道，就寫 0 或不寫。')
    out['unit'] = _word(r.get('unit'), f'「{name}」的單位', 6, False)
    out['src'] = _src(r.get('src'), f'「{name}」的數字')
    if r.get('key') is not None:
        out['key'] = _key(r['key'], f'「{name}」的數字')
    return out


def _block(b, name, i):
    """一塊積木。小二只交輸入的數；算出來的（delta、state、days、lhs、rhs、diff、ok）由程式算，交了也忽略。"""
    b = _dict(b, f'{name}的第 {i + 1} 塊積木')
    t = b.get('type')
    if t not in VIEW_TYPES:
        raise ValueError(f'積木只有三種：bignum 大數字、listrow 名單列、verify 驗算；「{t}」不認得。')
    if t == 'bignum':
        b = _keys_only(b, ('type', 'label', 'now', 'base'), VIEW_CALC[t], '大數字（bignum）')
        now_ = _keys_only(b.get('now'), ('v', 'unit', 'src', 'key'), (), '大數字的現在值（now）')
        out = dict(type=t, label=_word(b.get('label'), '大數字的名字（label）', 16),
                   now=dict(v=_num(now_.get('v'), '大數字的值（now.v）', -1_000_000_000_000, 1_000_000_000_000),
                            unit=_word(now_.get('unit'), '大數字的單位（now.unit）', 6, False),
                            src=_src(now_.get('src'), '大數字'), key=_key(now_.get('key'), '大數字', True)))
        if b.get('base') is not None:
            base = _keys_only(b['base'], ('v', 'label', 'key'), (), '大數字比較的對象（base）')
            out['base'] = dict(v=_num(base.get('v'), '比較的值（base.v）', -1_000_000_000_000, 1_000_000_000_000),
                               label=_word(base.get('label'), '比較的對象（base.label，例如「上週」）', 10))
            k = _key(base.get('key'), '比較的值')
            if k:
                out['base']['key'] = k
        return out
    if t == 'listrow':
        b = _keys_only(b, ('type', 'title', 'rows'), VIEW_CALC[t], '名單列（listrow）')
        rows = [_row(r, k) for k, r in enumerate(_list(b.get('rows'), '名單列的列', MOST_ROWS, 1))]
        if len({r['name'] for r in rows}) != len(rows):
            raise ValueError('名單列裡的名字不能重複。')
        return dict(type=t, title=_word(b.get('title'), '名單列的標題（title）', 12), rows=rows)
    b = _keys_only(b, ('type', 'title', 'prev', 'in', 'used', 'now', 'tol', 'unit', 'src', 'key'), VIEW_CALC[t], '驗算（verify）')
    out = dict(type=t, title=_word(b.get('title'), '驗算的標題（title）', 12))
    for k, w in (('prev', '上次盤點'), ('in', '這次進貨'), ('used', '這次用掉'), ('now', '這次實點')):
        out[k] = _num(b.get(k), f'驗算的「{w}」（{k}）', 0, 1_000_000_000)
    out['tol'] = _num(b.get('tol', 0), '驗算的容許誤差（tol）', 0, 1_000_000_000)
    if b.get('unit') is not None:
        out['unit'] = _word(b['unit'], '驗算的單位', 6)
    if b.get('src') is not None:
        out['src'] = _src(b['src'], '驗算')
    if b.get('key') is not None:
        out['key'] = _key(b['key'], '驗算')
    return out


def _view(v, name):
    """只放資料的畫面：blocks 三種積木（最多 6 塊）；acts 這個模組有哪些按鈕；pick 是「選一個」的選項。"""
    v = _keys_only(v, ('blocks', 'acts', 'pick'), (), f'「{name}」的畫面（view）')
    out = dict(blocks=[_block(b, name, i) for i, b in enumerate(_list(v.get('blocks', []), f'{name}的積木', MOST_BLOCKS))])
    if v.get('acts') is not None:
        acts = _list(v['acts'], f'{name}的按鈕（acts）', len(MOD_ACTS), 1)
        if not all(isinstance(a, str) and a in MOD_ACTS for a in acts) or len(set(acts)) != len(acts):
            raise ValueError('按鈕只有 done（做了）、skip（先不做）、pick（選一個），不重複。')
        out['acts'] = [a for a in MOD_ACTS if a in acts]
    if 'pick' in out.get('acts', []):
        picks = [_word(p, f'{name}的選項', 10) for p in _list(v.get('pick'), f'{name}的選項（pick）', MOST_PICKS, 2)]
        if len(set(picks)) != len(picks):
            raise ValueError(f'「{name}」的選項不能重複。')
        out['pick'] = picks
    elif v.get('pick') is not None:
        raise ValueError(f'「{name}」有 pick 這個按鈕（acts 裡寫 pick）才寫選項。')
    if not out['blocks'] and not out.get('acts'):
        raise ValueError(f'「{name}」的 view 至少要有一塊積木（blocks）或一個按鈕（acts）。')
    return out


def _pressed(d, name):
    """他在畫面上按的模組按鈕（程式寫的）：{act, value, date, at}。讀檔時照樣驗，合併時以存著的為準。"""
    d = _keys_only(d, ('act', 'value', 'date', 'at'), (), f'「{name}」按過的按鈕（pressed）')
    return dict(act=_choice(d.get('act'), '按過的按鈕', MOD_ACTS),
                value=None if d.get('value') is None else _word(d['value'], '選的那一個', 10),
                date=_date(d.get('date'), '按下的日期'), at=_t(d.get('at'), '按下的時間', 40))


def _running(items):
    """在跑的獲客做法（試做中＋開著）；日常工具不算。"""
    return [x['name'] for x in items if x['st'] in RUNNING and x.get('kind', 'way') == 'way']


def _limits(items, kept=()):
    running = _running(items)
    if len(running) > MOST_RUNNING:
        hint = ''.join(f'「{n}」畫面上剛動過、先照畫面上的，還算在跑。' for n in kept if n in running)
        raise ValueError(f'一次最多 {MOST_RUNNING} 個模組在跑，這次有 {len(running)} 個（{"、".join(running)}）。'
                         '先把一個改成暫停（paused）或收工（done），再開新的。' + hint)


def mods(d):
    """模組（樂高）：小二照他的真實情況挑的做法，內建的照表（LIBRARY_MODS），他自己長的用 my- 開頭。
    減法還是規矩：一次最多三個獲客做法在跑（試做中＋開著；日常工具不算）、全部最多八個；新的先試兩週；每個都要寫為什麼（指回他說過的話或資料）。"""
    d = _dict(d, '模組')
    raw = d.get('items')
    if not isinstance(raw, list):
        raise ValueError('地圖的「模組」格式不符：items 要是一串模組。')
    if len(raw) > MOST_MODS:
        raise ValueError(f'模組全部最多 {MOST_MODS} 個（獲客做法和日常工具、在跑的、暫停的、收工的加起來）；收工很久的可以拿掉。')
    seen = set()
    items = [_mod(x, seen) for x in raw]
    _limits(items)
    return dict(headline=_mtext(d.get('headline'), '模組的重點句', 30), items=items)


def _plain(value, label, limit, required=False):
    """小二的字：畫面會直接顯示，不收角括號（不收標籤）。"""
    out = _t(value, label, limit, required)
    if '<' in out or '>' in out:
        raise ValueError(f'小二的「{label}」只收文字，不收 < > 這種符號。')
    return out


def _gone(c):
    """舊格式留下的配件欄位拿掉；回傳拿掉了沒有。"""
    hit = any(k in c for k in COMPANION_GONE)
    for k in COMPANION_GONE:
        c.pop(k, None)
    return hit


def companion(d):
    """你的小二：名字、怎麼叫他、語氣、說話的樣子、臉型、動態、開門第一句、誰設計的。
    骨架固定、表情自由：只收這幾個欄位；顏色和眼睛寫在 persona（hue、eyes）。rev 由程式管。
    舊格式帶來的配件（acc、art）拿掉、不擋，結果裡標 _gone，由合併的人回一句白話。"""
    d = dict(_dict(d, '你的小二'))
    gone = _gone(d)
    extra = set(d) - set(COMPANION_ALL)
    if extra:
        hint = '顏色和眼睛寫在本命（persona 的 hue、eyes）。' if extra & {'hue', 'eyes', 'color', 'colour'} else ''
        raise ValueError('小二只收這幾個欄位：' + '、'.join(COMPANION_ALL) + '；不收 ' + '、'.join(sorted(extra)) + '。' + hint)
    g = lambda k: COMPANION_DEFAULT[k] if d.get(k) is None else d[k]
    rev = d.get('rev')
    if rev is not None and (isinstance(rev, bool) or not isinstance(rev, int) or rev < 0):
        raise ValueError('小二的 rev 要是 0 以上的整數，照 daily 裡的那個數字寫。')
    out = dict(name=_plain(g('name'), '名字', 6, True), call=_plain(g('call'), '怎麼叫他', 8, True),
               tone=_choice(g('tone'), '小二的語氣（warm 溫暖、brisk 俐落、playful 逗趣、steady 沉穩）', TONES),
               voice=_plain(g('voice'), '說話的樣子', 40),
               face=_choice(g('face'), '小二的臉型（round 圓、bean 豆子、soft 方圓）', FACES),
               follow=_bool(d.get('follow'), '滑鼠靠近時轉頭看（follow）', True),
               blink=_choice(g('blink'), '小二眨眼的節奏（slow、normal、lively）', BLINKS),
               hello=_plain(g('hello'), '開門第一句', 30), by=_choice(g('by'), '誰設計的（xiaoer 小二提的、owner 他改的、agent 他請小二改的）', BYS),
               rev=rev)
    # v14：換成照片。只在交了才出現（沒寫就是畫的小二，舊的小二存檔一個字都不用改）
    if d.get('skin') is not None:
        out['skin'] = _choice(d['skin'], '小二那一格畫什麼（skin：drawn 畫的小二、photo 照片）', SKINS)
    if d.get('photo') is not None:
        out['photo'] = _photo(d['photo'])
    if gone:
        out['_gone'] = True
    return out


def _photo(d):
    """小二的照片：{file, x, y, r}。file 只能是「作品/」底下的相對路徑；x、y 是臉中心（以照片寬、高為 1），
    r 是臉的半徑（以照片較短的一邊為 1）。檔案本身（看檔頭、路徑展開、大小）由伺服器在交進來時另外驗（shape.check_photo）。"""
    d = _keys_only(d, ('file', 'x', 'y', 'r'), (), '小二的照片（photo）')
    f = d.get('file')
    if not safe_rel(f) or not f.startswith(PHOTO_DIR) or f == PHOTO_DIR:
        raise ValueError('小二的照片要放在「我的經營室/作品/」底下，file 寫成「作品/豆豆.jpg」這樣（不能用 / 開頭、不能有 ..）。')
    x, y = (_num(d.get(k), f'照片裡臉的位置（{k}，0 到 1）', 0, 1) for k in ('x', 'y'))
    r = _num(d.get('r'), '照片裡臉的大小（r，0 到 1）', 0, 1)
    if r == 0:
        raise ValueError('照片裡臉的大小（r）要大於 0：寫臉的半徑佔照片較短那一邊的比例，例如 0.3。')
    return dict(file=f, x=x, y=y, r=r)


def _check_skin(c):
    """換成照片（skin: photo）要先有照片：合併完才對（只寫 skin 的時候，照片可能早就交過了）。"""
    if c and c.get('skin') == 'photo' and not c.get('photo'):
        raise ValueError('小二換成照片（skin: photo）要先交照片：photo 寫 file、x、y、r，照片放在「我的經營室/作品/」。')


def companion_stored(c):
    """存著的小二（可能是舊格式）：拿掉配件，只留現在的欄位。不是一份資料（直接改檔改壞）就當作沒有。"""
    return {k: copy.deepcopy(v) for k, v in (c if isinstance(c, dict) else {}).items() if k not in COMPANION_GONE}


def companion_view(m):
    """給畫面與助手看的小二：沒交過就用預設（小二、掌櫃的…），顏色和眼睛從本命讀。
    v14：一定帶 skin（沒寫就是 drawn）和 photo（沒交過就是 null），畫面照這兩個決定畫哪一種。"""
    m = m if isinstance(m, dict) else {}
    c = {**COMPANION_DEFAULT, **companion_stored(m.get('companion'))}
    persona_ = _sec(m, 'persona') or {}
    c['hue'], c['eyes'] = persona_.get('hue', 'orange'), persona_.get('eyes', 'capsule')
    c.setdefault('skin', 'drawn')
    c.setdefault('photo', None)
    if not c['hello']:
        c['hello'] = f'早，{c["call"]}。'
    return c


def layout(d):
    """版面（v14）：第一屏以下的分組、收合、順序。{rev, groups:[{id, name, blocks, open}]}。
    blocks 只認 ORDER_DAY 裡第一屏以外的塊（GROUP_BLOCKS）和他自己的模組編號（my- 開頭，要在 mods 裡，合併時對）；
    第一屏的東西搬不出來，也搬不進去；每一塊只能在一組；每組至少一塊。rev 規則照小二。"""
    d = _keys_only(d, ('rev', 'groups'), (), '版面（layout）')
    seen_g, seen_b, groups = set(), set(), []
    for g in _list(d.get('groups'), '版面的分組', MOST_GROUPS, 1):
        g = _keys_only(g, ('id', 'name', 'blocks', 'open'), (), '版面的一組')
        gid = g.get('id')
        if not isinstance(gid, str) or not SLUG.match(gid):
            raise ValueError('版面的每一組要有英數小寫的編號（例如 running、yours），24 字內。')
        if gid in seen_g:
            raise ValueError('版面的分組編號不能重複：' + gid)
        seen_g.add(gid)
        name = _word(g.get('name'), '分組的名字', 10)
        blocks = _list(g.get('blocks'), f'「{name}」放哪幾塊（blocks）', len(GROUP_BLOCKS) + MOST_MODS, 1)
        for b in blocks:
            if not isinstance(b, str):
                raise ValueError(f'「{name}」的 blocks 要寫塊的名字或模組編號。')
            if b in FIRST_SCREEN:
                raise ValueError(f'「{b}」在第一屏，搬不出來，也不能放進分組；第一屏是今天、小二、外圈、一天的時間軸、三件事、想問你、一行提醒。')
            if b not in GROUP_BLOCKS and not (SLUG.match(b) and MINE.match(b)):
                raise ValueError(f'版面不認得「{b}」：只認 ' + '、'.join(GROUP_BLOCKS) + '，和他自己的模組編號（my- 開頭）。')
            if b in seen_b:
                raise ValueError(f'「{b}」只能放在一組。')
            seen_b.add(b)
        groups.append(dict(id=gid, name=name, blocks=list(blocks), open=_bool(g.get('open'), f'「{name}」打開嗎（open）', False)))
    rev = d.get('rev')
    return dict(rev=None if rev is None else _rev(rev, '版面的 rev '), groups=groups)


CHECK = dict(store=store, scale=scale, who=who, key=key, flow=flow, success=success, time=time, opps=opps, map=map_, data=data, next=next_, persona=persona,
             stage=stage, purpose=purpose, people=people, goals=goals, today=today, log=log, rhythm=rhythm, offer=offer, assets=assets, asks=asks,
             mods=mods, companion=companion, layout=layout)


def _validate(payload):
    payload = _dict(payload, '地圖')
    unknown = set(payload) - set(SECTIONS) - {'sources'}
    if unknown:
        raise ValueError('地圖沒有這幾塊：' + '、'.join(sorted(unknown)) + '。塊的名字照地圖格式.md 的表寫。')
    out = {k: CHECK[k](payload[k]) for k in SECTIONS if k in payload}
    if 'sources' in payload:
        out['sources'] = sources(payload['sources'])
    if not out:
        raise ValueError('這次沒有交任何一塊。')
    return out


def validate(payload):
    """檢查這次交進來的那幾塊；沒交的塊不檢查、不動。（附近只交幾家時，表頭在合併時沿用地圖上的。）"""
    out = _validate(payload)
    if 'companion' in out:
        out['companion'].pop('_gone', None)
    if 'map' in out:
        out['map'] = {k: v for k, v in out['map'].items() if k != '_given'}
        out['map']['pins'] = [x for x in out['map']['pins'] if x['st'] != 'drop']
    return out


def _keys(section):
    """這一塊用到的出處編號。"""
    found = set()
    def walk(v):
        if isinstance(v, dict):
            for k, x in v.items():
                if k in ('key', 'now_key') and isinstance(x, str) and x:
                    found.add(x)
                else:
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(section)
    return found


def _merge_log(old, new, reviewed=None):
    """紀錄只往上加、不整塊換掉：同一則交兩次只算一次；開門、打烊、盤點同一天各只收一則（補跑不會重複記）。
    打烊記在它檢視的那一天：地圖上的「今天」還是前一天、那天還沒打烊，早上補做的打烊就算寫成今天的日期，
    也記到那一天，當晚真正的打烊照收。"""
    have = {(x['date'], x['kind'], x['t']) for x in old}
    fresh = []
    for x in new:
        if (x['kind'] == 'close' and reviewed and reviewed < x['date']
                and not any(y['date'] == reviewed and y['kind'] == 'close' for y in old + fresh)):
            x = dict(x, date=reviewed)
        if (x['date'], x['kind'], x['t']) in have:
            continue
        if x['kind'] != 'note' and any(y['date'] == x['date'] and y['kind'] == x['kind'] for y in old + fresh):
            word = {'open': '開門', 'close': '打烊', 'week': '盤點'}[x['kind']]
            raise ValueError(f'{x["date"]} 已經{word}過了；同一天的{word}只記一則。要補充就寫一則 note。')
        fresh.append(x)
    return dict(items=(fresh + old)[:40])


def _merge_pins(old, new):
    """附近的對象用名稱對：只交改了的那幾家就好，沒交的保留；不再追的那家寫 drop，從圖上拿掉。
    表頭（headline、center、mode、cond、cond_src、px_per_m）這次沒交就沿用地圖上的。"""
    pins = [dict(x) for x in old.get('pins', [])]
    for x in new['pins']:
        index = {y['n']: i for i, y in enumerate(pins)}
        if x['st'] == 'drop':
            if x['n'] in index:
                pins.pop(index[x['n']])
        elif x['n'] in index:
            pins[index[x['n']]] = x
        else:
            pins.append(x)
    if len(pins) > MOST_PINS:
        raise ValueError(f'附近的對象最多 {MOST_PINS} 家，這次加起來 {len(pins)} 家。不再追的那幾家交一次、狀態寫 drop，就會從圖上拿掉'
                         '（past 是「訂過」，會留在圖上）；打錯的店名也一樣寫 drop。')
    out = {k: v for k, v in new.items() if k in MAP_HEADER}                       # 這次寫的（沒寫的是預設值）
    out.update({k: v for k, v in old.items() if k in MAP_HEADER and k not in new['_given']})   # 沒寫的沿用地圖上的
    out['pins'] = pins
    return out


def _day_note(t):
    """換天時，把前一天按過的結果記成一則（盤點算一週合計就讀這幾則，不用猜）。"""
    items = t.get('items', [])
    done = [x for x in items if x.get('status') == 'done']
    skip = sum(1 for x in items if x.get('status') == 'skip')
    if not done and not skip:
        return None
    words = dict(replied='回了', booked='約了', won='成交', none='沒回', later='晚點再說')
    counts = [f'{words[k]} {n}' for k in RESULTS if (n := sum(1 for x in done if x.get('result') == k))]
    t_ = f'這天排了 {len(items)} 件：做了 {len(done)}' + (f'（{"、".join(counts)}）' if counts else '') + (f'，先不做 {skip}' if skip else '') + '。'
    return dict(date=t['date'], kind='note', t=t_, src='data')


def _merge_companion(old, new, notes, given=None):
    """rev 規則跟調整器一樣：交進來的 rev 要等於存著的那個數字，才存下來、rev 加一；
    比存著的舊、比存著的新、或沒帶，都沿用存著的那份，回同一句白話（沒帶的再提醒要帶）。
    只寫要改的那幾項也可以：given＝這次真的寫了的欄位，沒寫的沿用存著的，不回到預設。
    還沒存過小二（第一次交）就照交來的收，沒寫的用預設。
    v14 的 skin、photo 一樣：沒寫的沿用存著的；合併完是照片卻沒有照片就擋下。"""
    if old is None:
        out = dict(new, rev=1)
        _check_skin(out)
        return out
    old = companion_stored(old)
    have = old.get('rev', 0)
    rev = new.get('rev')
    if rev is None or rev != have:
        if notes is not None:
            notes.append(STALE_COMPANION + ('' if rev is not None else f'下次交小二要帶 rev（現在是 {have}）。'))
        return old
    wrote = set(COMPANION_ALL) if given is None else set(given)
    out = {k: new[k] if k in wrote or k not in old else old[k] for k in COMPANION_KEYS if k != 'rev'}
    for k in COMPANION_MORE:
        if k in wrote and k in new:
            out[k] = new[k]
        elif k in old:
            out[k] = old[k]
    out['rev'] = have + 1
    _check_skin(out)
    return out


def _companion_given(raw):
    """交進來的 companion 真的寫了哪幾個欄位（null 當沒寫；rev 另外對；舊格式的配件不算）。"""
    raw = raw if isinstance(raw, dict) else {}
    return {k for k, v in raw.items() if v is not None and k in COMPANION_ALL and k != 'rev'}


def mod_content(x):
    """比對模組有沒有變：拿掉程式管的欄位（rev、by、pressed），沒寫的種類當 way。"""
    c = {k: v for k, v in (x or {}).items() if k not in ('rev', 'by', 'pressed')}
    c.setdefault('kind', 'way')
    return c


def _merge_mods(old, new, notes):
    """每個模組各自一個 rev（v14）。規矩照小二：
    - 交進來的 rev 等於存著的：收下；內容真的變了才加一（沒變就不加，舊版也不多存一份）。
    - rev 對不上（比較舊或比較新）：這個模組沿用存著的，回一句白話；同一包的其他模組照收。
    - 沒帶 rev：存著的那一份是他在畫面上動過的（by: owner），就當舊的、沿用存著的並提醒要帶；
      不然照收（v13 的小二沒有 rev，照樣交得進來）。
    - 新的模組：照收，rev 從 1 開始。沒交的模組：拿掉（跟以前一樣），舊版留在「模組/.舊版/」。
    他在畫面上按的（pressed）以存著的為準，小二交了也不會蓋掉。"""
    olds = {x['id']: x for x in (old or {}).get('items', [])}
    items, kept = [], []
    for x in new['items']:
        x = dict(x)
        rev = x.pop('rev', None)
        x.pop('by', None)
        x.pop('pressed', None)
        o = olds.get(x['id'])
        if o is None:
            items.append(dict(x, rev=1, by='xiaoer'))
            continue
        have = o.get('rev', 0)
        if (rev is not None and rev != have) or (rev is None and o.get('by') == 'owner'):
            if notes is not None:
                notes.append(f'畫面上剛動過「{o.get("name") or o["id"]}」，先照畫面上的。'
                             + ('' if rev is not None else f'下次交模組要帶 rev（「{o.get("name") or o["id"]}」現在是 {have}）。'))
            kept.append(o.get('name') or o['id'])
            items.append(copy.deepcopy(o))
            continue
        if 'pressed' in o:
            x['pressed'] = copy.deepcopy(o['pressed'])
        if mod_content(x) == mod_content(o):
            items.append(dict(x, rev=have or 1, by=o.get('by', 'xiaoer')))
        else:
            items.append(dict(x, rev=have + 1, by='xiaoer'))
    _limits(items, kept)
    return dict(new, items=items)


def _layout_content(lay):
    return [(g['id'], g['name'], list(g['blocks']), g.get('open', False)) for g in (lay or {}).get('groups', [])]


def _merge_layout(old, new, notes):
    """版面的 rev 規矩照小二：對不上（或沒帶）就沿用存著的、回一句白話。回 (版面, 這次收了沒有)。"""
    if old is None:
        return dict(new, rev=1), True
    have = old.get('rev', 0)
    rev = new.get('rev')
    if rev is None or rev != have:
        if notes is not None:
            notes.append(STALE_LAYOUT + ('' if rev is not None else f'下次交版面要帶 rev（現在是 {have}）。'))
        return old, False
    if _layout_content(new) == _layout_content(old):
        return old, True
    return dict(new, rev=have + 1), True


def hidden_day(m):
    """日常畫面本來就不畫的塊（跟 contextmap.js 的 plan 同一套）：成功公式（第一屏左欄就是它）、資料（節奏那一塊寫了）、
    這一週（有節奏就不畫；v13 起由節奏取代）、有獲客做法時的三個機會（併進模組那一塊）。算組數時不算它們。"""
    out = {'success', 'data'}
    if not m.get('next') or m.get('rhythm'):
        out.add('next')
    if any(x.get('kind', 'way') != 'tool' for x in (_sec(m, 'mods') or {}).get('items', [])):
        out.add('opps')
    return out


def group_total(m, lay):
    """畫面上最多會有幾組（幾行組標題）：版面寫的組（裡面至少一塊日常會畫的），加上「沒放進任何一組、日常會畫的塊」
    會回到的預設組（版面沒寫那一組的話）。預設組跟畫面（contextmap.js 的 GROUP_DEF）同一張表（shape.DEFAULT_GROUPS）；
    日常工具沒放進分組的回到「你加的」。日常不畫的塊（hidden_day）不算。"""
    from shape import DEFAULT_GROUPS
    hide = hidden_day(m)
    groups = (lay or {}).get('groups', [])
    ids = {g['id'] for g in groups}
    placed = {b for g in groups for b in g['blocks']}
    tools = [x['id'] for x in (_sec(m, 'mods') or {}).get('items', []) if x.get('kind') == 'tool']
    extra = 0
    for gid, _name, blocks in DEFAULT_GROUPS:
        if gid not in ids and any(b not in placed and b not in hide for b in (tools if gid == 'yours' else blocks)):
            extra += 1
    return sum(1 for g in groups if any(b not in hide for b in g['blocks'])) + extra


def _layout_refs(m, strict):
    """版面裡的模組編號要在地圖的 mods 裡（他自己的、my- 開頭）。strict：這次交的版面，對不到就擋；
    不然（模組被拿掉了）把對不到的編號從版面拿掉，空掉的組一起拿掉，版面 rev 加一。
    最多 8 組：沒放進任何一組的塊會回到預設的組，也算在內（畫面上不會出現第 9 行組標題）。"""
    lay = _sec(m, 'layout')
    if not lay:
        return   # 沒有版面，或存著的版面形狀不對（畫面照預設分組畫）：不對照
    mine = {x['id'] for x in (_sec(m, 'mods') or {}).get('items', []) if x.get('from') == 'mine'}
    bad = [b for g in lay.get('groups', []) for b in g['blocks'] if b not in GROUP_BLOCKS and b not in mine]
    if bad and strict:
        raise ValueError('版面放了地圖上沒有的模組：' + '、'.join(bad) + '。先在模組（mods）開它，或從版面拿掉。')
    if bad:
        groups = [dict(g, blocks=[b for b in g['blocks'] if b not in bad]) for g in lay['groups']]
        groups = [g for g in groups if g['blocks']]
        if groups:
            m['layout'] = dict(lay, groups=groups, rev=lay.get('rev', 0) + 1)
        else:
            m.pop('layout')
        m.setdefault('updated', {})['layout'] = now()
    # 最多 8 組只擋「這次交的版面」（strict）：只交 mods（例如打烊時）不因為存著的版面組數擋下——
    # 存著的超過 8 組（預覽版存的、新長的日常工具補回「你加的」），畫面把第 8 組起併成「其他」，他點一下收合就存回 8 組內
    total = group_total(m, m.get('layout'))
    if strict and total > MOST_GROUPS:
        raise ValueError(f'版面最多 {MOST_GROUPS} 組，這樣會有 {total} 組：沒放進任何一組、日常會畫的塊會回到預設的那一組'
                         '（你的生意、找客人、你加的…），也算一組。交 layout 時把每一塊都放進現有的組，或少分幾組。')


def _resolve(m, path):
    cur = m
    for part in path.split('.'):
        if isinstance(cur, list):
            if not part.isdigit() or int(part) >= len(cur):
                return None
            cur = cur[int(part)]
        elif isinstance(cur, dict):
            if part not in cur:
                return None
            cur = cur[part]
        else:
            return None
    return cur


def _check_stars(m):
    """本命星座的每一顆星都要指到地圖上真的有的一件事。"""
    sign = (_sec(m, 'persona') or {}).get('sign')
    if not sign:
        return
    missing = [x for x in sign['stars'] if _resolve(m, x) in (None, '', [], {})]
    if missing:
        raise ValueError('本命星座的這幾顆星指不到地圖上的事：' + '、'.join(missing) + '。換成地圖上真的有的事。')


def _check_today_mods(m):
    """今天的事帶的模組（mod），要是地圖上在跑的那幾個（試做中或開著）。
    只在交「今天」時對：盤點時暫停一個模組，早上排好、他可能已經按過的事不用跟著重交；明天開門就只從在跑的排。"""
    mods_ = _sec(m, 'mods')
    have = {x['id']: x for x in (mods_ or {}).get('items', [])}
    for x in (_sec(m, 'today') or {}).get('items', []):
        if x.get('mod') and mods_ is None and m.get('mods') is not None:
            raise ValueError('地圖上的模組（mods）格式不對：先把 mods 整塊重交，再交今天的事。')
        mid = x.get('mod')
        if not mid:
            continue
        mod = have.get(mid)
        if mod is None:
            raise ValueError(f'今天的「{x["t"]}」掛在模組 {mid}，可是地圖上沒有這個模組。先在模組（mods）開它，或拿掉這件的 mod。')
        if mod.get('kind') == 'tool':
            raise ValueError(f'今天的「{x["t"]}」掛在「{mod["name"]}」，這是日常工具，不放進今天的三件事（今天的事只從獲客做法來）；拿掉這件的 mod。')
        if mod['st'] not in RUNNING:
            word = {'paused': '暫停', 'done': '收工'}[mod['st']]
            raise ValueError(f'今天的「{x["t"]}」掛在「{mod["name"]}」，這個模組已經{word}了；今天的事只從在跑的模組排（試做中或開著）。'
                             '拿掉這件的 mod，或換成在跑的模組。')


def merge(state, payload, notes=None, root=None):
    """把這次交進來的塊換上去；每個出處編號都要找得到，找不到就整筆不收。
    notes（可省）：要跟助手說的白話（例如小二剛在畫面上改過），由呼叫的人帶回去。
    root（可省）：經營資料夾。給了就連照片檔一起驗（看檔頭、路徑展開後要在作品/底下、大小）。"""
    p = _validate(payload)
    if 'companion' in p and p['companion'].pop('_gone', None) and notes is not None:
        notes.append(GONE_COMPANION)
    s = copy.deepcopy(state)
    if not isinstance(s.get('map'), dict):
        s['map'] = dict(revision=0, updated={}, sources={})
    m = s['map']
    _counters(s, m)
    for name in [n for n in p if n != 'sources'] + ['sources']:
        if name in m and m[name] is not None and not _shaped(name, m[name]):
            m.pop(name)   # 存著的那一塊形狀不對（直接改檔改壞）：當作沒有，整塊換成這次交的
    merged_sources = {**m.get('sources', {}), **p.get('sources', {})}
    for name in SECTIONS:
        if name in p:
            missing = _keys(p[name]) - set(merged_sources)
            if missing:
                raise ValueError('這些數字還沒寫出處：' + '、'.join(sorted(missing)) + '。先把出處放進 sources 再交。')
    old_today = m.get('today')
    if 'today' in p and old_today and old_today.get('date') == p['today']['date']:
        # 他按過的（做了／先不做／結果）以他為準；助手要改，得在那一件寫 fix（理由）
        pressed = {x['id']: x for x in old_today.get('items', []) if x.get('status') != 'todo'}
        for x in p['today']['items']:
            if x['id'] in pressed and not x.get('fix'):
                x.pop('result', None)
                for k in ('status', 'result', 'at'):
                    if k in pressed[x['id']]:
                        x[k] = pressed[x['id']][k]
    day_note = None
    if 'today' in p and old_today and old_today.get('date') < p['today']['date']:
        day_note = _day_note(old_today)
    if 'log' in p or day_note:
        items = (p['log']['items'] if 'log' in p else [])
        reviewed = old_today.get('date') if old_today and not ('today' in p and p['today']['date'] != old_today.get('date')) else None
        old_log = (_sec(m, 'log') or {}).get('items', [])
        if day_note and not any((x['date'], x['kind'], x['t']) == (day_note['date'], 'note', day_note['t']) for x in old_log):
            old_log = [day_note] + old_log
        p['log'] = _merge_log(old_log, items, reviewed)
    if 'map' in p:
        p['map'] = _map_done(_merge_pins(m['map'], p['map']) if m.get('map') else p['map'])
    photo_to_check = None
    if 'companion' in p:
        old_c = m.get('companion')
        given = _companion_given(payload.get('companion'))
        p['companion'] = _merge_companion(old_c, p['companion'], notes, given)
        # 這次真的收了（rev 加了一；不是沿用存著的），而且動到照片或樣子：連照片檔一起驗
        taken = old_c is None or p['companion'].get('rev') != old_c.get('rev', 0)
        if taken and given & set(COMPANION_MORE) and (p['companion'].get('photo') or {}).get('file'):
            photo_to_check = p['companion']['photo']['file']
    if 'mods' in p:
        p['mods'] = _merge_mods(m.get('mods'), p['mods'], notes)
    layout_taken = False
    if 'layout' in p:
        p['layout'], layout_taken = _merge_layout(m.get('layout'), p['layout'], notes)
    if 'people' in p and (m.get('people') or {}).get('rule') and p['people'].get('rule'):
        old_r, new_r = m['people']['rule'], p['people']['rule']
        # 盤點重算時沒帶起點：他之前選的反方向與理由留著，不被程式算的蓋掉
        if old_r.get('override') and not new_r.get('set'):
            new_r.update(start=old_r['start'], override=True, why=old_r.get('why', ''))
    at = now()
    for name in SECTIONS:
        if name in p:
            m[name] = p[name]
            m['updated'][name] = at
    m['sources'] = merged_sources
    if 'layout' in p or 'mods' in p:
        # 這次交的版面：放了地圖上沒有的模組就擋；只是模組被拿掉了：從版面拿掉那個編號
        _layout_refs(m, strict=layout_taken and p['layout'] is m.get('layout'))
    if root is not None and photo_to_check:
        from shape import check_photo
        check_photo(root, photo_to_check)
    flow_ = _sec(m, 'flow') or {}
    for n, item in (flow_.get('nodes') or {}).items():
        if DIGIT.search(str(item.get('value') or '') + str(item.get('s') or '')) and not item.get('key'):
            k = ((flow_.get('eq') or {}).get('key')) or (_sec(m, 'key') or {}).get('key')
            if not k:
                raise ValueError(f'「{n}」的數字（{item["value"]}）要寫出處編號（key），或先交那條算式。')
            item['key'] = k
    _check_stars(m)
    if 'today' in p:
        _check_today_mods(m)
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s


def _local_today():
    import datetime
    return datetime.date.today().isoformat()


def _month_day(iso):
    """2026-10-17 → 「10 月 17 日」：給他看的日期寫成白話，不寫成 2026-10-17。"""
    _, mo, d = iso.split('-')
    return f'{int(mo)} 月 {int(d)} 日'


def act(state, data):
    """畫面上的按鈕：今天某一件事「做了／先不做」，做了可以再點結果。只改今天那幾件，其他都要跟助手說。"""
    data = _dict(data, '按鈕')
    s = copy.deepcopy(state)
    m = s.get('map') or {}
    t = _sec(m, 'today')
    if not t:
        raise ValueError('今天還沒有排好的事。')
    item = next((x for x in t['items'] if x['id'] == data.get('id')), None)
    if item is None:
        raise ValueError('找不到這件事，可能已經換了一天；請重新整理。')
    if t['date'] > _local_today():
        raise ValueError(f'這是 {_month_day(t["date"])}的事，到那天再按。')
    status = _choice(data.get('status'), '狀態', DONE)
    item['status'] = status
    if status == 'done' and data.get('result') is not None:
        item['result'] = _choice(data['result'], '結果', RESULTS)
    elif status != 'done':
        item.pop('result', None)
    item['at'] = now()
    m['updated']['today'] = item['at']
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s


class StaleCompanion(ValueError):
    """畫面送來的 rev 跟存著的不一樣：別處（小二交地圖、另一個分頁）剛改過，畫面要重讀。"""


def set_companion(state, data, notes=None, root=None):
    """經營室的調整器存檔（POST /api/companion）：{companion, hue?, eyes?}。
    companion 只寫要改的欄位也可以（沒寫的沿用存著的），rev 要等於存著的那個數字，不對就丟 StaleCompanion。
    顏色和眼睛寫回 persona（同一件事只存一處）；存好紀錄留一則「小二換了樣子」。
    舊畫面送來的配件（acc、art）拿掉照收，notes（可省）帶回一句白話。
    v14：調整器可以換 skin（畫的小二／照片），不能換照片本身（照片在對話裡交給小二）；
    換成照片時，root（經營資料夾）給了就連照片檔一起驗。"""
    data = _dict(data, '調整器')
    extra = set(data) - {'companion', 'hue', 'eyes'}
    if extra:
        raise ValueError('調整器只收 companion、hue、eyes。')
    s = copy.deepcopy(state)
    if not isinstance(s.get('map'), dict):
        s['map'] = dict(revision=0, updated={}, sources={})
    m = s['map']
    _counters(s, m)
    old = _sec(m, 'companion')   # 存著的小二形狀不對（直接改檔改壞）：當作還沒存過
    have = (old or {}).get('rev', 0)
    raw = _dict(data.get('companion'), '你的小二')
    if raw.get('rev') != have or isinstance(raw.get('rev'), bool):
        raise StaleCompanion(STALE_COMPANION + '重新讀一次再改。')
    if raw.get('photo') is not None and raw['photo'] != (old or {}).get('photo'):
        raise ValueError('照片要在對話裡交給小二；調整器只換名字、顏色、樣子（skin：drawn 畫的小二、photo 照片）。')
    base = {k: v for k, v in companion_stored(old or COMPANION_DEFAULT).items() if k != 'rev'}
    raw = {**base, **raw, 'by': raw.get('by', 'owner')}
    new = companion(raw)
    if new.pop('_gone', None) and notes is not None:
        notes.append(GONE_COMPANION)
    _check_skin(new)
    if root is not None and new.get('skin') == 'photo' and (old or {}).get('skin') != 'photo':
        from shape import check_photo
        check_photo(root, new['photo']['file'])
    new['rev'] = have + 1
    persona_ = dict(_sec(m, 'persona') or {})
    for k, options, word in (('hue', HUES, '本命色'), ('eyes', EYES, '眼睛')):
        if data.get(k) is not None:
            if data[k] not in options:
                raise ValueError(f'{word}只能從這幾個挑：' + '、'.join(options) + '。')
            persona_[k] = data[k]
    at = now()
    if persona_ != (_sec(m, 'persona') or {}):
        persona_.setdefault('hue', 'orange')
        persona_.setdefault('eyes', 'capsule')
        m['persona'] = persona_
        m['updated']['persona'] = at
    m['companion'] = new
    m['updated']['companion'] = at
    t = '小二換了樣子：' + '、'.join(x for x in (new['name'], '叫你' + new['call']) if x)
    m['log'] = _merge_log((_sec(m, 'log') or {}).get('items', []), [dict(date=_local_today(), kind='note', t=t[:80], src='screen')])   # 他在調整器點的，不是說的
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s


class StaleLayout(ValueError):
    """畫面送來的版面 rev 跟存著的不一樣：畫面要重讀。"""


class StaleModule(ValueError):
    """畫面送來的模組 rev 跟存著的不一樣：畫面要重讀（module 帶著存著的那一份）。"""
    def __init__(self, message, module=None):
        super().__init__(message)
        self.module = module


def _rows(v, key, need=()):
    x = v.get(key, [])
    return isinstance(x, list) and all(isinstance(i, dict) and all(isinstance(i.get(k), str) for k in need) for i in x)


def _shaped(name, v):
    """存著的那一塊，合併、互相對照時會讀到的形狀對不對。只看型別，不看內容規矩（舊規矩寫進來的照樣算對）。
    直接改檔改壞、又沒有舊版可以比的時候（例如 mods.items 被寫成物件），合併把它當作沒有，整塊換成這次交的。"""
    if name == 'sources':
        return isinstance(v, dict)
    if name == 'key' and v is None:
        return True
    if not isinstance(v, dict):
        return False
    if name == 'today':
        return isinstance(v.get('date', ''), str) and _rows(v, 'items', ('id',))
    if name == 'log':
        return _rows(v, 'items', ('date', 'kind', 't'))
    if name == 'mods':
        return _rows(v, 'items', ('id',))
    if name == 'layout':
        return _rows(v, 'groups', ('id', 'name')) and all(isinstance(g.get('blocks'), list) for g in v.get('groups', []))
    if name == 'map':
        return _rows(v, 'pins', ('n',))
    if name == 'people':
        r = v.get('rule')
        return isinstance(v.get('types', []), list) and (r is None or isinstance(r, dict) and (not r.get('override') or 'start' in r))
    if name == 'flow':
        n = v.get('nodes', {})
        return isinstance(n, dict) and all(isinstance(x, dict) for x in n.values()) and isinstance(v.get('eq') or {}, dict)
    if name == 'persona':
        sg = v.get('sign')
        return sg is None or isinstance(sg, dict) and isinstance(sg.get('stars', []), list) and all(isinstance(t, str) for t in sg.get('stars', []))
    return True


def _sec(m, name):
    """存著的那一塊；形狀不對就當作沒有（None），不讓別的塊因為它交不進去。"""
    v = m.get(name) if isinstance(m, dict) else None
    return v if v is not None and _shaped(name, v) else None


def _counters(s, m):
    """版本號、更新時間是程式管的：被直接改壞（字串、清單）時從 0 接著算，不讓這一次寫入失敗。"""
    if isinstance(s.get('revision'), bool) or not isinstance(s.get('revision'), int):
        s['revision'] = 0
    if isinstance(m.get('revision', 0), bool) or not isinstance(m.get('revision', 0), int):
        m['revision'] = 0
    if not isinstance(m.get('updated'), dict):
        m['updated'] = {}


def _need_map(state):
    s = copy.deepcopy(state)
    m = s.get('map')
    if not m:
        raise ValueError('經營室還沒長出來；訪談完再來。')
    if not isinstance(m, dict):
        raise ValueError('經營室的地圖格式不對；請小二用 agent.py map 重交地圖。')
    _counters(s, m)
    return s, m


def set_layout(state, data):
    """畫面存版面（POST /api/layout）：{layout: {rev, groups}}；點標題收合也走這條。
    rev 要等於存著的（還沒存過是 0），不對就丟 StaleLayout；檢查跟小二交的一樣（第一屏搬不出來、每組至少一塊、
    模組編號要在 mods 裡）。內容沒變就不加 rev。"""
    data = _keys_only(data, ('layout',), (), '版面')
    s, m = _need_map(state)
    raw = _dict(data.get('layout'), '版面（layout）')
    old = _sec(m, 'layout')
    have = (old or {}).get('rev', 0)
    if isinstance(raw.get('rev'), bool) or raw.get('rev') != have:
        raise StaleLayout(STALE_LAYOUT + '重新讀一次再改。')
    new = layout(raw)
    if old and _layout_content(new) == _layout_content(old):
        return s
    m['layout'] = dict(new, rev=have + 1)
    _layout_refs(m, strict=True)
    m['updated']['layout'] = now()
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s


def _find_mod(m, data):
    mid = data.get('id')
    items = (_sec(m, 'mods') or {}).get('items', [])
    x = next((y for y in items if y['id'] == mid), None) if isinstance(mid, str) else None
    if x is None:
        raise ValueError('找不到這個模組，可能剛被換掉了；請重新整理。')
    rev = data.get('rev')
    if rev is not None and (isinstance(rev, bool) or rev != x.get('rev', 0)):
        raise StaleModule(f'「{x["name"]}」剛被改過，先照最新的；重新讀一次再按。', copy.deepcopy(x))
    return x


def module_pause(state, data):
    """「先收起來」（POST /api/module/pause）：{id, rev?}。改成暫停、不刪；rev 加一、by 記 owner，紀錄留一則。
    已經暫停的不動（changed false）；收工的不用再收。回 (state, 模組, changed)。"""
    data = _keys_only(data, ('id', 'rev'), (), '先收起來')
    s, m = _need_map(state)
    x = _find_mod(m, data)
    if x['st'] == 'paused':
        return s, copy.deepcopy(x), False
    if x['st'] == 'done':
        raise ValueError(f'「{x["name"]}」已經收工了，不用再收起來。')
    at = now()
    x.update(st='paused', rev=x.get('rev', 0) + 1, by='owner')
    m['updated']['mods'] = at
    m['log'] = _merge_log((_sec(m, 'log') or {}).get('items', []), [dict(date=_local_today(), kind='note', t=f'先收起來：{x["name"]}'[:80], src='screen')])
    m['updated']['log'] = at
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s, copy.deepcopy(x), True


def module_act(state, data):
    """模組的按鈕（POST /api/module/act）：{id, act, value, rev?}。act 只收這個模組 view.acts 宣告過的
    （done 做了、skip 先不做、pick 選一個；pick 的 value 要是 view.pick 裡的一個）。
    只改這個模組自己那一塊（pressed），不碰今天三件事、別的模組和名單；不加 rev（按鈕不是內容）。回 (state, 模組)。"""
    data = _keys_only(data, ('id', 'act', 'value', 'rev'), (), '模組的按鈕')
    s, m = _need_map(state)
    x = _find_mod(m, data)
    act_ = _choice(data.get('act'), '按鈕（done 做了、skip 先不做、pick 選一個）', MOD_ACTS)
    view_ = x.get('view') or {}
    if act_ not in view_.get('acts', []):
        raise ValueError(f'「{x["name"]}」沒有這個按鈕。')
    if x['st'] not in RUNNING:
        raise ValueError(f'「{x["name"]}」已經{"暫停" if x["st"] == "paused" else "收工"}了，先打開再按。')
    value = data.get('value')
    if act_ == 'pick':
        if not isinstance(value, str) or value not in view_.get('pick', []):
            raise ValueError('選的要是這個模組列出來的其中一個。')
    elif value is not None:
        raise ValueError('做了、先不做不用帶 value。')
    at = now()
    x['pressed'] = dict(act=act_, value=value, date=_local_today(), at=at)
    m['updated']['mods'] = at
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s, copy.deepcopy(x)


def module_revert(state, data, old_item):
    """「回到上一版」（POST /api/module/revert）：{id, rev?}；old_item 是「模組/.舊版/<編號>/」最新的那一份（伺服器讀檔）。
    放回去之後整個模組塊照樣要過同一套檢查（三個在跑、八個、字、出處找得到）；rev 往前加一、by 記 owner。
    模組已經被拿掉了也救得回來（加回去）。按過的按鈕（pressed）照現在的。回 (state, 模組)。"""
    data = _keys_only(data, ('id', 'rev'), (), '回到上一版')
    s, m = _need_map(state)
    mid = data.get('id')
    items = (_sec(m, 'mods') or {}).get('items', [])
    cur = next((y for y in items if y['id'] == mid), None) if isinstance(mid, str) else None
    if cur is not None:
        _find_mod(m, data)
    if not isinstance(old_item, dict) or old_item.get('id') != mid:
        raise ValueError('找不到這個模組的上一版。')
    back = {k: copy.deepcopy(v) for k, v in old_item.items() if k not in ('rev', 'by', 'pressed') and k not in MOD_CALC}
    if cur is not None and cur.get('pressed'):
        back['pressed'] = copy.deepcopy(cur['pressed'])
    old_rev = old_item.get('rev') if isinstance(old_item.get('rev'), int) and not isinstance(old_item.get('rev'), bool) else 0
    back.update(rev=max((cur or {}).get('rev', 0), old_rev) + 1, by='owner')
    new_items = [back if y['id'] == mid else y for y in items] if cur is not None else items + [back]
    block = mods(dict(_sec(m, 'mods') or {'headline': '小二正在幫你跑的'}, items=new_items))
    missing = _keys(block) - set(_sec(m, 'sources') or {})
    if missing:
        raise ValueError('上一版用到的出處已經不在了：' + '、'.join(sorted(missing)) + '；請小二重交這個模組。')
    at = now()
    m['mods'] = block
    m['updated']['mods'] = at
    item = next(y for y in block['items'] if y['id'] == mid)
    m['log'] = _merge_log((_sec(m, 'log') or {}).get('items', []), [dict(date=_local_today(), kind='note', t=f'回到上一版：{item["name"]}'[:80], src='screen')])
    m['updated']['log'] = at
    m['revision'] = m.get('revision', 0) + 1
    s['revision'] += 1
    return s, copy.deepcopy(item)


def check_map(m):
    """伺服器讀檔時的檢查：跟進門一樣的那一套（每一塊的格式、字、數字型別、出處編號找得到、本命的星指得到、
    照片樣子有照片、版面的模組在 mods 裡）。回 [(塊, 白話原因)]，空的就是合格。不碰檔案、不丟例外。"""
    if m is None:
        return []
    if not isinstance(m, dict):
        return [(WHOLE_MAP, '地圖不是一份資料。')]
    problems = []
    for k in sorted(set(m) - set(SECTIONS) - {'sources', 'revision', 'updated'}, key=str):
        problems.append((k, f'地圖沒有「{k}」這一塊。'))
    if isinstance(m.get('revision', 0), bool) or not isinstance(m.get('revision', 0), int):
        problems.append(('revision', '地圖的版本號不是整數。'))
    if not isinstance(m.get('updated', {}), dict):
        problems.append(('updated', '地圖的更新時間格式不符。'))
    known = set()
    if 'sources' in m:
        try:
            known = set(sources(m['sources']))
        except Exception as e:   # noqa: BLE001 讀檔時壞成什麼樣都要接住，不能讓經營室開不起來
            problems.append(('sources', str(e)[:200]))
    for name in SECTIONS:
        if name not in m or (name == 'key' and m[name] is None):
            continue
        try:
            out = CHECK[name](copy.deepcopy(m[name]))
        except Exception as e:   # noqa: BLE001
            problems.append((name, str(e)[:200] or '格式不符。'))
            continue
        missing = _keys(out) - known
        if missing:
            problems.append((name, '這些數字找不到出處：' + '、'.join(sorted(missing)) + '。'))
    if not problems:
        for name, fn in (('persona', _check_stars), ('companion', lambda x: _check_skin(x.get('companion'))),
                         ('layout', lambda x: _layout_refs(copy.deepcopy(x), strict=True))):
            try:
                fn(m)
            except Exception as e:   # noqa: BLE001
                problems.append((name, str(e)[:200]))
    return problems


def model(state):
    """給畫面用：地圖有的就畫；還沒問到的塊，畫面會顯示「還在問」。"""
    m = copy.deepcopy(state.get('map') or {})
    if not m:
        return None
    m.pop('revision', None)
    if m.get('companion'):
        m['companion'] = companion_stored(m['companion'])
    return m
