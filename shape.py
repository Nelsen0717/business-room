"""做成你的形狀（v14）：經營室長成他的樣子，也要改不壞。

這一份放四件事，都不呼叫模型：
1. 作品的讀檔（/api/asset、小二的照片）：看檔頭、不看副檔名；路徑展開成實際位置後要在「作品/」底下；有大小上限。
2. 算出來的東西：模組畫面的積木（pack.views）與一行提醒（pack.alerts）。小二只交輸入的數，加總、差額、還能用幾天、
   夠不夠都由這裡算；數字對不上就停（halted），那個模組不發警示。
3. 退路：經營資料的地圖每變一次都留一份在「.舊版/」（最近十份）；讀檔時跟最新那一份比，被直接改出問題就換回它（pack.fallback）。
   每個模組的舊版留在「模組/.舊版/<編號>/」（最近十份），「回到上一版」從這裡拿。
4. 程式檔的指紋（pack.integrity）：安裝時記在「.安裝回執.json」，原版另存一份在「.business-room/.原版/」；
   啟動時（之後每次讀狀態也順手）比對，被改過就能還原成原版。
"""
import copy, datetime, hashlib, json, math, os, pathlib, re, shutil, stat

# ── 檔案與資料夾的名字（都在「我的經營室」裡）──
PROGRAM_DIR = '.business-room'
RECEIPT = '.安裝回執.json'
ORIGINAL = '.原版'
SNAP_DIR = '.舊版'                     # 經營資料的舊版
MOD_DIR = '模組'                       # 他自己的模組說明（my-*.md）；舊版在 模組/.舊版/<編號>/
UNDONE = '還原前'                      # 按「回到上一版」之前的那一份，另外留著（不會被自動拿去還原）
BACKUP = '.備份'
KEEP, KEEP_BAD = 10, 5
STATE_FILE = '經營資料.json'
SNAP_NAME = re.compile(r'^經營資料-(\d{8})-(\d{6})-\d{6}\.json$')

# ── 作品的讀檔 ──
WORKS = '作品'
IMAGE_KINDS = ('png', 'jpeg', 'webp')
ASSET_KINDS = IMAGE_KINDS + ('mp4',)
MIME = dict(png='image/png', jpeg='image/jpeg', webp='image/webp', mp4='video/mp4')
MB = 1024 * 1024
ASSET_MAX = dict(png=8 * MB, jpeg=8 * MB, webp=8 * MB, mp4=64 * MB)
MP4_BRANDS = {b'isom', b'iso2', b'iso3', b'iso4', b'iso5', b'iso6', b'mp41', b'mp42', b'avc1', b'M4V ', b'dash', b'mp71'}
ASSET_CSP = "sandbox; default-src 'none'"

# ── 程式檔的指紋：不比對的（課程包換的、模組說明、快取、原版本身）──
SKIP_TOP = {'模組', 'pack', 'pack.prev', '__pycache__', ORIGINAL}
CODE_SUFFIXES = {'.py', '.pyc', '.pyo', '.pth', '.so', '.pyd', '.dylib'}


def _stamp():
    return datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')


def _write(path, raw, mode=0o600):
    """先寫到旁邊的暫存檔再換上，寫到一半斷掉也不會留下半份。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def _write_json(path, data):
    _write(path, json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))


def _prune(files, keep):
    for p in files[:-keep] if keep else files:
        try:
            p.unlink()
        except OSError:
            pass


# ═══════════════ 1. 作品的讀檔 ═══════════════

class AssetError(Exception):
    def __init__(self, status, message, why=None):
        super().__init__(message)
        self.status, self.message, self.why = status, message, why


def sniff(head):
    """看檔頭認檔案：png、jpeg、webp、mp4，其他（svg、html、gif、pdf…）一律 None。"""
    if head.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if head.startswith(b'\xff\xd8\xff'):
        return 'jpeg'
    if len(head) >= 12 and head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'webp'
    if len(head) >= 12 and head[4:8] == b'ftyp' and head[8:12] in MP4_BRANDS:
        return 'mp4'
    return None


def asset_path(root, rel):
    """把「作品/豆豆.jpg」展開成實際位置：要在經營資料夾自己的「作品/」底下（擋 ..、絕對路徑、捷徑逃出去）。"""
    from contextmap import safe_rel
    if not isinstance(rel, str) or not rel:
        raise AssetError(400, '要指定檔案：f=作品/檔名。')
    if not safe_rel(rel) or not rel.startswith(WORKS + '/'):
        raise AssetError(403, '只能讀「作品/」底下的檔案（不能用 / 開頭、不能有 ..）。')
    root = pathlib.Path(root).resolve()
    base = root / WORKS
    if base.is_symlink():
        raise AssetError(403, '「作品」要是經營資料夾裡真的資料夾，不能是捷徑。')
    if not base.is_dir():
        raise AssetError(404, '找不到「作品」資料夾。')
    real_base = base.resolve()
    if real_base.parent != root:
        raise AssetError(403, '「作品」要是經營資料夾裡真的資料夾。')
    try:
        p = (root / rel).resolve(strict=True)
    except (OSError, RuntimeError):
        raise AssetError(404, '找不到這個檔案。') from None
    if not p.is_relative_to(real_base) or p == real_base:
        raise AssetError(403, '只能讀「作品/」底下的檔案；捷徑指到外面的不送。')
    return p


def open_asset(root, rel, kinds=ASSET_KINDS):
    """打開一個作品檔：回 (檔案, 種類, 大小)。種類照檔頭認；不在 kinds 裡、太大、不是一般檔案都擋。
    資料夾、具名管道這類不是一般檔的，打開之前就擋（具名管道一打開會一直等）；打開時也不等（O_NONBLOCK），
    打開後再確認一次是一般檔；中途擋下一律先關掉，不漏檔案描述子。"""
    p = asset_path(root, rel)
    try:
        st = os.stat(p)
    except OSError:
        raise AssetError(404, '找不到這個檔案。') from None
    if stat.S_ISDIR(st.st_mode):
        raise AssetError(404, '這是資料夾，不是檔案。', 'dir')
    if not stat.S_ISREG(st.st_mode):
        raise AssetError(404, '找不到這個檔案。', 'special')
    try:
        fd = os.open(p, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
    except OSError:
        raise AssetError(404, '找不到這個檔案。') from None
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise AssetError(404, '找不到這個檔案。', 'special')
        fh = os.fdopen(fd, 'rb')
    except BaseException:
        os.close(fd)
        raise
    try:
        kind = sniff(fh.read(32))
        if kind not in kinds:
            words = '、'.join('jpg' if k == 'jpeg' else k for k in kinds)
            raise AssetError(415, f'只送 {words}（看檔頭，不看副檔名）；svg、html 這類不送。')
        if st.st_size > ASSET_MAX[kind]:
            raise AssetError(413, f'檔案太大：{"jpg" if kind == "jpeg" else kind} 最多 {ASSET_MAX[kind] // MB} MB。')
        fh.seek(0)
        return fh, kind, st.st_size
    except BaseException:
        fh.close()
        raise


def check_photo(root, rel):
    """小二的照片交進來時：跟讀檔路由同一套（只收 png、jpg、webp，看檔頭；路徑展開後在作品/底下；8 MB 內）。"""
    try:
        fh, _kind, _size = open_asset(root, rel, IMAGE_KINDS)
    except AssetError as e:
        why = {404: f'找不到「{rel}」：先把照片放進「我的經營室/作品/」再交',
               403: f'「{rel}」不在「我的經營室/作品/」底下（捷徑指到外面的也不收）',
               415: f'「{rel}」不是 png、jpg、webp 的照片（看檔頭，不看副檔名）',
               413: f'「{rel}」太大，照片最多 8 MB'}.get(e.status, e.message)
        if e.why == 'dir':
            why = f'的 file 寫成了資料夾「{rel}」：要寫到照片檔本身，例如「作品/豆豆.jpg」'
        elif e.why == 'special':
            why = f'「{rel}」不是一般的檔案：把照片本身存進「我的經營室/作品/」再交'
        raise ValueError('小二的照片' + why + '。') from None
    fh.close()


# ═══════════════ 2. 算出來的東西 ═══════════════

# 前端的預設分組（介面約定第 3 節）；這裡只用來決定提醒點了要打開哪一組
DEFAULT_GROUPS = (('running', '在跑的做法', ('mods',)),
                  ('biz', '你的生意', ('who', 'offer', 'people', 'aim', 'assets')),
                  ('find', '找客人', ('flow', 'success', 'opps', 'map')),
                  ('rhythm', '節奏與資料', ('rhythm', 'data', 'next')),
                  ('yours', '你加的', ()))


def _tidy(x):
    """浮點數的尾巴（0.1 + 0.2）拿掉；整數照舊。"""
    return round(x, 6) if isinstance(x, float) else x


DAYS_MAX = 9999   # 還能用幾天超過這個數（約 27 年）就不算天數：一天用得極少時，算出來的是幾百位數的天，不是有用的提醒


def _days(have, per):
    """還能用幾天：取到一位小數。perday 是 0、沒寫、算出來不是有限的數（無限大、NaN）或大得沒有意義，都回 None。"""
    if not per:
        return None
    try:
        d = have / per
    except (OverflowError, ZeroDivisionError):
        return None
    return round(d, 1) if isinstance(d, (int, float)) and math.isfinite(d) and abs(d) <= DAYS_MAX else None


def _calc(b):
    b = copy.deepcopy(b)
    t = b.get('type')
    if t == 'bignum':
        base = b.get('base')
        b['delta'] = _tidy(b['now']['v'] - base['v']) if base else None
    elif t == 'listrow':
        for r in b['rows']:
            have, safe, per = r['have'], r['safe'], r.get('perday')
            r['state'] = 'out' if have <= 0 else 'low' if have < safe else 'ok'
            r['days'] = _days(have, per)
    elif t == 'verify':
        lhs, rhs = _tidy(b['prev'] + b['in']), _tidy(b['used'] + b['now'])
        diff = _tidy(lhs - rhs)
        b.update(lhs=lhs, rhs=rhs, diff=diff, ok=abs(diff) <= b.get('tol', 0) + 1e-9)
    return b


NUM_MAX = 1e15   # 積木裡任何一個數（交進來的、算出來的）超過這個、或不是有限的數：那個模組當成壞了


def _sane(v):
    """積木裡的數都是有限、合理大小的數（字、是非照收）。直接改檔寫進 Infinity、NaN、幾百位數的整數，都不是。"""
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return True
    if isinstance(v, (int, float)):
        try:
            return math.isfinite(v) and abs(v) <= NUM_MAX
        except OverflowError:   # 幾百位數的整數換不成浮點數
            return False
    if isinstance(v, dict):
        return all(_sane(x) for x in v.values())
    if isinstance(v, list):
        return all(_sane(x) for x in v)
    return False


def _items(m):
    """地圖上的模組：壞成什麼樣（地圖不是一份資料、mods 不是、items 不是一串）都回一串，不丟例外。"""
    mods = m.get('mods') if isinstance(m, dict) else None
    items = mods.get('items') if isinstance(mods, dict) else None
    return items if isinstance(items, list) else []


def _view(x):
    raw = x['view'].get('blocks', [])
    if not isinstance(raw, list):
        raise TypeError('blocks 不是一串')
    blocks = [_calc(b) for b in raw]
    if not _sane(blocks):
        raise ValueError('積木裡有不是有限的數')
    halted = any(b.get('type') == 'verify' and not b.get('ok') for b in blocks)
    if halted:
        for b in blocks:
            for r in b.get('rows', []) if b.get('type') == 'listrow' else []:
                r['state'] = 'check'
    item = dict(blocks=blocks, halted=halted)
    for k in ('acts', 'pick'):
        if x['view'].get(k):
            item[k] = list(x['view'][k])
    if x.get('pressed'):
        item['pressed'] = dict(x['pressed'])
    return item


def views(m):
    """pack.views：{模組編號: {blocks:[積木＋算好的欄位], halted, acts?, pick?, pressed?}}。只有帶 view 的模組才有。
    對不上就停：同一個模組只要有一個驗算不 ok，halted 就是 true，它所有名單列的 state 一律 check。
    一塊壞只壞一塊：讀檔時已經驗過，萬一還是壞的（直接改檔、還沒有舊版可以比），那個模組回 {blocks: [], halted: false, bad: true}，
    畫面講一句「這一塊的資料格式不對」；其他模組照算。算出來的數一律是有限的數（不會出現無限大、NaN）。"""
    out = {}
    for x in _items(m):
        if not isinstance(x, dict) or not isinstance(x.get('id'), str) or not isinstance(x.get('view'), dict):
            continue
        try:
            out[x['id']] = _view(x)
        except Exception:   # noqa: BLE001 壞成什麼樣都只壞這一塊
            out[x['id']] = dict(blocks=[], halted=False, bad=True)
    return out


def _groups(lay):
    """版面的分組：只拿形狀對的（一份資料、編號是字、blocks 是一串）；版面壞了就當沒有版面。"""
    groups = lay.get('groups') if isinstance(lay, dict) else None
    if not isinstance(groups, list):
        return []
    return [g for g in groups if isinstance(g, dict) and isinstance(g.get('id'), str) and isinstance(g.get('blocks'), list)]


def group_of(x, lay=None):
    """這個模組在畫面上的哪一組：版面有寫就照版面；沒寫的獲客做法跟著 mods 那一塊，日常工具在「你加的」。"""
    groups = _groups(lay)
    for g in groups:
        if x['id'] in g['blocks']:
            return g['id']
    if x.get('kind', 'way') == 'way':
        for g in groups:
            if 'mods' in g['blocks']:
                return g['id']
        return 'running'
    return 'yours'


def _fmt(v):
    if isinstance(v, int) or (isinstance(v, float) and v.is_integer()):
        return f'{int(v):,}'
    return f'{v:,.1f}'


def _alert_text(r):
    name, unit = r['name'], r.get('unit') or ''
    if r['state'] == 'out':
        return f'{name}沒了'
    if r.get('days') is not None:
        return f'{name}剩不到 1 天' if r['days'] < 1 else f'{name}剩 {_fmt(r["days"])} 天'
    return f'{name}剩 {_fmt(r["have"])} {unit}'.strip()


def alerts(m, vs=None):
    """pack.alerts：[{mod, text, group, state}]。只從名單列的 low（快不夠）、out（沒了）算；
    停住的（halted）、暫停或收工的模組不算。最急的排第一（沒了 → 剩的天數少 → 模組順序），前端第一屏只顯示第一則。"""
    vs = views(m) if vs is None else vs
    lay = m.get('layout') if isinstance(m, dict) else None
    found = []
    for order, x in enumerate(_items(m)):
        try:
            v = vs.get(x['id'])
            if not v or v.get('bad') or v['halted'] or x.get('st') not in ('try', 'on'):
                continue
            mine = []
            for b in v['blocks']:
                for k, r in enumerate(b.get('rows', []) if b.get('type') == 'listrow' else []):
                    if r.get('state') not in ('low', 'out'):
                        continue
                    rank = (0 if r['state'] == 'out' else 1, r['days'] if r.get('days') is not None else float('inf'), order, k)
                    mine.append((rank, dict(mod=x['id'], text=_alert_text(r), group=group_of(x, lay), state=r['state'])))
            found += mine
        except Exception:   # noqa: BLE001 一個模組算不出提醒，只少它的那幾則
            continue
    return [a for _, a in sorted(found, key=lambda y: y[0])]


# ═══════════════ 3. 退路：經營資料與模組的舊版 ═══════════════

def snapshots(root):
    """經營資料的舊版，新的在前：[(檔名, 路徑)]。"""
    d = pathlib.Path(root) / SNAP_DIR
    if not d.is_dir():
        return []
    files = sorted((p for p in d.iterdir() if SNAP_NAME.match(p.name)), key=lambda p: p.name, reverse=True)
    return [(p.name, p) for p in files]


def snapshot(root, state):
    """存一份經營資料的舊版，留最近十份。"""
    d = pathlib.Path(root) / SNAP_DIR
    _write_json(d / f'經營資料-{_stamp()}.json', state)
    _prune(sorted((p for p in d.iterdir() if SNAP_NAME.match(p.name)), key=lambda p: p.name), KEEP)


def same_as_latest(root, state):
    snaps = snapshots(root)
    if not snaps:
        return False
    try:
        return json.loads(snaps[0][1].read_text(encoding='utf-8')) == state
    except (OSError, ValueError):
        return False


def keep_bad(root, raw):
    """不合格的那一份原封不動留著（最近五份），不刪他的東西。"""
    if raw is None:
        return None
    d = pathlib.Path(root) / SNAP_DIR
    name = f'經營資料-不合格-{_stamp()}.json'
    _write(d / name, raw.encode('utf-8') if isinstance(raw, str) else raw)
    _prune(sorted(p for p in d.iterdir() if p.name.startswith('經營資料-不合格-')), KEEP_BAD)
    return name


def _when(name):
    m = SNAP_NAME.match(name)
    if not m:
        return '之前'
    d, t = m.group(1), m.group(2)
    return f'{int(d[4:6])} 月 {int(d[6:8])} 日 {t[:2]}:{t[2:4]}'


def _int(x):
    return x if isinstance(x, int) and not isinstance(x, bool) else 0


# 經營資料最外層（經營室自己的帳）：這幾格在的話，型別要跟 domain.empty() 一樣
OUTER = dict(setup=dict, business=dict, sources=list, people=list, transactions=list, actions=list, notes=list,
             events=list, requests=list, preferences=dict, connections=dict, view=dict)


def _record(c):
    """最外層的 companion 是回應紀錄：{mode, turns:[{id, status, runtime?}]}（經營室開門時會逐則讀）。"""
    if not isinstance(c, dict) or not isinstance(c.get('turns'), list) or not isinstance(c.get('mode', ''), str):
        return False
    return all(isinstance(t, dict) and isinstance(t.get('id'), str) and isinstance(t.get('status'), str)
               and isinstance(t.get('runtime') or {}, dict) for t in c['turns'])


def outer(state, schema):
    """經營資料最外層的形狀：對的回 None，不對回一句給小二看的原因。地圖（map）裡面另外由 contextmap.check_map 驗。
    最外層是經營室自己的帳（版本、回應紀錄、連接…），小二不直接寫這一層；地圖一律用 agent.py map 交。"""
    if not isinstance(state, dict):
        return '經營資料不是一份資料。'
    if state.get('schema') != schema:
        if state.get('schema') is None:
            return '最外層少了 schema，這不是經營室存的那一份；地圖用 agent.py map 交，不要直接寫成經營資料.json。'
        return '最外層的 schema 不是經營室的格式；地圖用 agent.py map 交，不要直接改經營資料.json。'
    for k, kind in OUTER.items():
        if k in state and not isinstance(state[k], kind):
            return f'最外層的 {k} 格式不符；這一層是經營室自己的帳，不要直接改。'
    if not all(isinstance(r, dict) for r in state.get('requests', [])):
        return '最外層的 requests 格式不符；這一層是經營室自己的帳，不要直接改。'
    if 'companion' in state and not _record(state['companion']):
        return ('最外層的 companion 是經營室的回應紀錄（mode、turns），不是小二的樣子；'
                '小二的名字、照片寫在地圖的 companion，用 agent.py map 交。')
    return None


def _has_map(state):
    m = state.get('map') if isinstance(state, dict) else None
    return isinstance(m, dict) and any(k not in ('revision', 'updated', 'sources') for k in m)


def baseline(root, schema):
    """經營室自己最後存的那一份（.舊版/ 最新一份讀得出來、版本對、外層形狀對的）：(檔名, 整份資料)；沒有就 (None, None)。"""
    for name, path in snapshots(root):
        try:
            snap = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if isinstance(snap, dict) and outer(snap, schema) is None:
            return name, snap
    return None, None


def recover(root, state, raw, schema):
    """伺服器讀經營資料時：跑跟進門一樣的檢查（contextmap.check_map），擋的是「不經過經營室、直接改檔」。
    比對的基準是經營室自己最後存的那一份（.舊版/ 最新一份）：
    - 地圖跟它一樣：是經營室自己寫的，照用（舊版規矩寫進來、後來規矩變嚴的資料，不因為升級就被拿掉）。
    - 不一樣（被直接改過）：跑同一套檢查；改出新的問題（它沒有的問題）→ 地圖換回它，原檔留在 .舊版/，
      回 (state, {used, from, reason, detail})；改得合格 → 照用。
    - 整份讀不出來、或最外層的形狀不對（少了 schema、外層的 companion 被換成小二的樣子…）→ 整份換回它；
      連它都沒有 → 丟 ValueError，原檔不動。
    - 檔案不見了（raw 是 None）：它有地圖就整份換回它、講一句；沒有地圖就是全新的經營室。
    - 還沒有任何舊版（第一次用這一版開）：照用這一份、從這一份開始留舊版（讀到的問題寫進日誌，不拿掉他的資料）。
    最外層的 revision 不是整數（例如被寫成字串）：照舊版往前接著算，不換回。"""
    from contextmap import check_map, SECTION_WORDS
    import sys
    name, base = baseline(root, schema)

    def whole(reason, detail, keep=True):
        if keep:
            keep_bad(root, raw)
        out = copy.deepcopy(base)
        out['revision'] = _int(base.get('revision')) + 1
        if isinstance(out.get('map'), dict):
            out['map']['revision'] = _int(out['map'].get('revision')) + 1
        return out, {'used': True, 'from': name, 'reason': reason, 'detail': detail}

    if raw is None:
        if base is not None and _has_map(base):
            return whole(f'經營資料的檔案不見了，先換回 {_when(name)} 存的那一份。', '經營資料.json 不在資料夾裡；換回的是經營室最後存的那一份。', keep=False)
        return state, None
    problem = '經營資料.json 不是完整的 JSON。' if state is None else outer(state, schema)
    if problem:
        if base is None:
            keep_bad(root, raw)
            raise ValueError('經營資料讀不出來，也找不到可以換回的舊版；原檔留著，請交由助手檢查。' if state is None else
                             '經營資料的格式不對（' + problem + '），也找不到可以換回的舊版；原檔留著，請交由助手檢查。')
        if state is None:
            return whole(f'經營資料讀不出來，先換回 {_when(name)} 存的那一份；讀不出來的那份另外收著，沒有刪。', problem)
        return whole(f'經營資料的格式不對（不是經營室存的樣子），先換回 {_when(name)} 存的那一份；有問題的那份另外收著，沒有刪。', problem)
    rev = state.get('revision')
    if isinstance(rev, bool) or not isinstance(rev, int) or rev < 0:
        state['revision'] = (_int(base.get('revision')) if base else 0) + 1
        print('讀檔：最外層的 revision 不是整數，照經營室存的往前接著算。', file=sys.stderr, flush=True)
    m = state.get('map')
    if base is None:
        problems = check_map(m)
        if isinstance(m, dict) and (isinstance(m.get('revision', 0), bool) or not isinstance(m.get('revision', 0), int)):
            m['revision'] = 0   # 地圖的版本號壞了：從 0 接著算（不然之後每次交地圖都會出錯）
        if problems:
            print('讀檔檢查（還沒有舊版，這一份照用）：' + '；'.join(f'{k}：{w}' for k, w in problems[:5]), file=sys.stderr, flush=True)
        if m is not None and not isinstance(m, dict):
            keep_bad(root, raw)
            state['map'] = None
            return state, {'used': True, 'from': None, 'reason': '經營資料裡的地圖格式不符，先拿掉；原本那份另外收著，沒有刪。', 'detail': '地圖不是一份資料。'}
        return state, None
    base_m = base.get('map')
    if m == base_m:
        return state, None
    before = check_map(base_m)
    new = [p for p in check_map(m) if p not in before]
    if not new:
        return state, None
    keep_bad(root, raw)
    detail = '；'.join(f'{SECTION_WORDS.get(k, k)}：{why}' for k, why in new[:3])[:300]
    words = '、'.join(dict.fromkeys(SECTION_WORDS.get(k, k) for k, _ in new))
    bad_mrev = _int(m.get('revision')) if isinstance(m, dict) else 0
    state['map'] = copy.deepcopy(base_m)
    # 版本號一律往前走：畫面看到變了才會重畫
    state['revision'] = max(_int(state.get('revision')), _int(base.get('revision'))) + 1
    if isinstance(state['map'], dict):
        state['map']['revision'] = max(bad_mrev, _int(state['map'].get('revision'))) + 1
    return state, {'used': True, 'from': name, 'reason': f'經營資料裡「{words}」不合格式，先換回 {_when(name)} 存的那一份；有問題的那份另外收著，沒有刪。',
                   'detail': detail}


def _mod_dir(root, mid):
    return pathlib.Path(root) / MOD_DIR / SNAP_DIR / mid


def versions(root, mid):
    """這個模組的舊版，舊的在前（最新的那一份就是「上一版」）。"""
    d = _mod_dir(root, mid)
    return sorted((p for p in d.glob('*.json')), key=lambda p: p.name) if d.is_dir() else []


MOD_ID = re.compile(r'^[a-z0-9][a-z0-9-]{0,23}$')   # 跟 contextmap.SLUG 一樣：模組編號拿來當資料夾名之前先對


def backs(root, m):
    """pack.back：每個模組真的還有幾份上一版（模組/.舊版/<編號>/ 裡的檔數）。{編號: 份數}，沒有的不列。
    「回到上一版」照這個數決定放不放（不是看 rev：rev 加過、舊版被回到上一版用掉了，就沒有上一版了）。"""
    out = {}
    for x in _items(m):
        mid = x.get('id') if isinstance(x, dict) else None
        if isinstance(mid, str) and MOD_ID.match(mid):
            n = len(versions(root, mid))
            if n:
                out[mid] = n
    return out


def _push(root, mid, item, sub=None):
    d = _mod_dir(root, mid) / sub if sub else _mod_dir(root, mid)
    rev = item.get('rev', 0) if isinstance(item.get('rev'), int) else 0
    _write_json(d / f'{_stamp()}-r{rev}.json', item)
    _prune(sorted(d.glob('*.json'), key=lambda p: p.name), KEEP)


def archive_mods(root, old_map, new_map):
    """存檔前：內容有變（或被拿掉）的模組，把存著的那一份留進「模組/.舊版/<編號>/」（最近十份）。
    按鈕（pressed）不算內容，按了不多存一份。"""
    from contextmap import mod_content
    olds = {x['id']: x for x in _items(old_map) if isinstance(x, dict) and isinstance(x.get('id'), str)}
    news = {x['id']: x for x in _items(new_map) if isinstance(x, dict) and isinstance(x.get('id'), str)}
    for mid, o in olds.items():
        n = news.get(mid)
        if n is None or mod_content(n) != mod_content(o):
            _push(root, mid, o)


def stash_undone(root, mid, item):
    """按「回到上一版」之前的那一份另外留在「還原前/」，不會再被自動拿去還原，要找回來看得到。"""
    _push(root, mid, item, UNDONE)


# ═══════════════ 4. 程式檔的指紋 ═══════════════

def _posix(rel):
    return str(rel).replace('\\', '/')


def in_scope(rel):
    """要比對的程式檔：.business-room/ 裡安裝回執記的檔，除了模組說明（模組/）、課程包（pack/）、快取與原版。"""
    parts = _posix(rel).split('/')
    return not (parts[0] in SKIP_TOP or parts[0].startswith('.staging-') or '__pycache__' in parts)


def _sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def keep_originals(target, manifest):
    """安裝時：程式檔的原版照指紋另存一份在 .business-room/.原版/（還原用）；這一版用不到的舊原版拿掉。"""
    target = pathlib.Path(target)
    store = target / ORIGINAL
    store.mkdir(exist_ok=True)
    want = set()
    for rel, sha in manifest.items():
        if not in_scope(rel):
            continue
        want.add(sha)
        blob = store / sha
        if not blob.exists():
            shutil.copy2(target / rel, blob)
    for blob in store.iterdir():
        if blob.name not in want:
            blob.unlink()
    return len(want)


class Integrity:
    """pack.integrity：{ok, changed, checked, can_restore}。啟動時比一次，之後每次讀狀態再比（沒變的檔用快取，不重算）。
    - 沒裝在經營資料夾裡（直接從課程資料夾跑）：checked false、ok true。
    - 安裝回執不見了：ok false、changed 列回執本身、不能還原。
    - 被改過、不見了、多出來（public/ 底下任何檔、.business-room/ 底下多出來的 .py 這類程式）都算 changed。"""

    def __init__(self, root):
        self.root = pathlib.Path(root)
        self.dir = self.root / PROGRAM_DIR
        self.receipt = self.root / RECEIPT
        self.cache = {}
        self.last = self.check()

    def manifest(self):
        data = json.loads(self.receipt.read_text(encoding='utf-8'))
        files = data['files']
        if not isinstance(files, dict):
            raise ValueError('安裝回執格式不符')
        return {_posix(k): v for k, v in files.items() if isinstance(k, str) and isinstance(v, str) and in_scope(k)}

    def extras(self, known):
        out = []
        try:
            for p in self.dir.iterdir():
                if p.name not in known and p.suffix in CODE_SUFFIXES and (p.is_file() or p.is_symlink()):
                    out.append(p.name)
            pub = self.dir / 'public'
            if pub.is_dir():
                for p in pub.rglob('*'):
                    rel = _posix(p.relative_to(self.dir))
                    if rel not in known and p.name != '.DS_Store' and (p.is_file() or p.is_symlink()):
                        out.append(rel)
        except OSError:
            pass
        return out

    def check(self):
        if not self.dir.is_dir():
            self.last = dict(ok=True, changed=[], checked=False, can_restore=False)
            return self.last
        try:
            files = self.manifest()
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            self.last = dict(ok=False, changed=[RECEIPT], checked=True, can_restore=False)
            return self.last
        changed = []
        for rel, sha in sorted(files.items()):
            p = self.dir / rel
            try:
                st = p.lstat()
            except OSError:
                changed.append(rel)
                continue
            if not stat.S_ISREG(st.st_mode):
                changed.append(rel)
                continue
            key = (st.st_mtime_ns, st.st_size)
            hit = self.cache.get(rel)
            if hit and hit[0] == key:
                digest = hit[1]
            else:
                try:
                    digest = _sha(p)
                except OSError:
                    changed.append(rel)
                    continue
                self.cache[rel] = (key, digest)
            if digest != sha:
                changed.append(rel)
        changed += self.extras(set(files))
        changed = sorted(set(changed))
        can = bool(changed) and all(rel not in files or self._original_ok(files[rel]) for rel in changed)
        self.last = dict(ok=not changed, changed=changed, checked=True, can_restore=can)
        return self.last

    def _original_ok(self, sha):
        """原版在、而且指紋對得上（原版也被改了就不算能還原：畫面不放一顆按了只會失敗的按鈕）。只在有檔被改過時才算。"""
        blob = self.dir / ORIGINAL / sha
        try:
            return blob.is_file() and _sha(blob) == sha
        except OSError:
            return False

    def restore(self):
        """把被改過、不見了的程式檔換回原版（原版的指紋要對得上才換）；多出來的程式檔搬到 .備份/，不刪。
        回 {integrity, restored, moved, failed, restart}；restart 是 true 表示換回了 .py，要重開經營室才會用回原版。"""
        before = self.check()
        restored, moved, failed = [], [], []
        if before['ok'] or not before['checked']:
            return dict(integrity=before, restored=restored, moved=moved, failed=failed, restart=False)
        try:
            files = self.manifest()
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            return dict(integrity=before, restored=restored, moved=moved, failed=[RECEIPT], restart=False)
        stamp = _stamp()
        for rel in before['changed']:
            p = self.dir / rel
            if rel not in files:
                dest = self.root / BACKUP / f'{stamp}-多出來的程式檔' / rel
                try:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(p), str(dest))
                    moved.append(rel)
                except OSError:
                    failed.append(rel)
                continue
            blob = self.dir / ORIGINAL / files[rel]
            try:
                raw = blob.read_bytes()
            except OSError:
                failed.append(rel)
                continue
            if hashlib.sha256(raw).hexdigest() != files[rel]:
                failed.append(rel)
                continue
            try:
                if p.is_symlink() or (p.exists() and not p.is_file()):
                    dest = self.root / BACKUP / f'{stamp}-被換掉的程式檔' / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(p), str(dest))
                _write(p, raw, stat.S_IMODE(blob.stat().st_mode) or 0o644)
                restored.append(rel)
            except OSError:
                failed.append(rel)
        self.cache.clear()
        after = self.check()
        code = [r for r in restored + moved if pathlib.PurePosixPath(r).suffix in CODE_SUFFIXES]
        return dict(integrity=after, restored=restored, moved=moved, failed=failed, restart=bool(code))
