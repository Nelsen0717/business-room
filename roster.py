"""客人名單：從「我的經營室/客人名單.csv」算週期、三圈、333 起點與叫回的梯子。純計算，不呼叫模型。

欄位（第一列是欄名，順序不拘）：稱呼、種類、上次來、平常幾天來一次、來過幾次、生日月、狀態、備註
- 一列一位。只寫稱呼（王小姐、合眾物流 陳小姐），不寫電話、私人信箱。
- 「上次來」寫日期：2026-09-20、2026/9/20、2026.9.20 都收；只寫 9/20 算今年（比今天晚就算去年）。
- 「來過幾次」「平常幾天來一次」寫數字，「36次」「約 28」「28 天」也收。
- 「名單」只算來過的人（來過幾次至少 1，買過、做過、訂過都算）；預約了還沒來的（來過幾次 0）不算進名單，另外報幾位；
  加了 LINE 沒買過的也不算，那是養客的事。
- 名單少於 20 位：先從新客開始（333 的比例在小名單會跳）。
- 「平常幾天來一次」不知道就空著，改用全店的週期：來過兩次以上的人的中位數；還算不出來就用地圖上的 people.cycle.days。
- 狀態寫「已移出」（搬家、不再往來）的不算進名單。
"""
import csv, datetime, json, pathlib, re, statistics

COLS = ('稱呼', '種類', '上次來', '平常幾天來一次', '來過幾次', '生日月', '狀態', '備註')
SMALL = 20  # 名單少於這個數，先從新客開始（10/2 定案；跟 contextmap.SMALL_LIST 同一個數）


def load(path):
    path = pathlib.Path(path)
    if not path.exists():
        raise ValueError(f'找不到客人名單：{path.name}。先在「我的經營室」建一份，欄名照：' + '、'.join(COLS) + '。')
    with path.open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    if rows and not {'稱呼', '上次來', '來過幾次'} <= set(rows[0]):
        raise ValueError('客人名單至少要有「稱呼」「上次來」「來過幾次」三欄。')
    return rows


def _int(v):
    """「36」「36次」「約 28」「28 天」都收：取第一串數字。"""
    m = re.search(r'\d+', (v or '').translate(str.maketrans('０１２３４５６７８９', '0123456789')))
    return int(m.group(0)) if m else None


def _date(v, today):
    """2026-09-20、2026/9/20、2026.9.20、9/20（當年；比今天晚就算去年）都收。"""
    v = (v or '').strip().translate(str.maketrans('０１２３４５６７８９／', '0123456789/'))
    m = re.fullmatch(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', v)
    try:
        if m:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        m = re.fullmatch(r'(\d{1,2})[-/.](\d{1,2})', v)
        if m:
            d = datetime.date(today.year, int(m.group(1)), int(m.group(2)))
            return d if d <= today else datetime.date(today.year - 1, d.month, d.day)
    except ValueError:
        return None
    return None


def analyze(rows, today=None, store_cycle=None):
    """回傳：週期、名單人數、三圈、很久沒來、333 起點、叫回的梯子（要問候的、要叫回的），每個人過了幾個週期。"""
    today = today or datetime.date.today()
    people, skipped, booked = [], [], 0
    for i, r in enumerate(rows, 2):
        name = (r.get('稱呼') or '').strip()
        visits, last = _int(r.get('來過幾次')), _date(r.get('上次來'), today)
        if (r.get('狀態') or '').strip() == '已移出':
            continue
        if name and visits == 0:
            booked += 1          # 預約了還沒來：不算進名單（照地圖格式.md 的定義），另外報
            continue
        why = ('沒寫稱呼' if not name else
               '上次來看不懂：' + ((r.get('上次來') or '').strip() or '空白') if not last else
               '來過幾次看不懂：' + ((r.get('來過幾次') or '').strip() or '空白') if not visits else '')
        if why:
            skipped.append(dict(row=i, name=name or '（沒寫稱呼）', why=why))
            continue
        people.append(dict(name=name, kind=(r.get('種類') or '').strip(), last=last, visits=visits,
                           every=_int(r.get('平常幾天來一次')), birth=_int(r.get('生日月'))))
    known = [p['every'] for p in people if p['visits'] >= 2 and p['every']]
    cycle = round(statistics.median(known)) if known else store_cycle
    if not people:
        raise ValueError('名單裡沒有算得進去的人：' + '；'.join(f"第 {x['row']} 列 {x['name']} {x['why']}" for x in skipped[:5]) + '。改好再算。')
    if not cycle:
        raise ValueError('還算不出平常多久來一次：在名單填幾位熟客的「平常幾天來一次」，或先交 people.cycle.days。')
    bands = {'in': 0, 'slip': 0, 'out': 0}
    greet, winback, by_kind = [], [], {}
    for p in people:
        every = p['every'] or cycle
        c = round((today - p['last']).days / every, 1)
        band = 'in' if c < 1 else ('slip' if c <= 3 else 'out')
        bands[band] += 1
        by_kind.setdefault(p['kind'] or '（沒分種類）', {'in': 0, 'slip': 0, 'out': 0})[band] += 1
        row = dict(name=p['name'], cycles=c, visits=p['visits'], last=p['last'].isoformat(),
                   fresh=bool(p['birth'] and p['birth'] == today.month))
        if 2 <= c <= 3:
            greet.append(row)
        elif c > 3:
            winback.append(row)
    # 叫回：以前來得多、離開還不算太久的先排；生日月的人往前
    winback.sort(key=lambda x: (not x['fresh'], -x['visits'], x['cycles']))
    greet.sort(key=lambda x: (not x['fresh'], -x['visits'], x['cycles']))
    total, dormant = len(people), bands['out']
    start = 'return' if total >= SMALL and dormant * 3 > total else 'new'
    return dict(today=today.isoformat(), cycle_days=cycle, cycle_from='名單裡熟客的中位數' if known else '地圖上的 people.cycle.days',
                total=total, bands=bands, dormant=dormant, share=round(dormant / total, 3) if total else 0.0, start=start,
                small=total < SMALL, by_kind=by_kind, greet=greet, winback=winback, skipped=skipped, booked=booked)


def summary(result):
    """一句白話：給助手唸給他聽、也寫進出處的 body。"""
    r = result
    side = '回頭客' if r['start'] == 'return' else '新客'
    s = f"名單 {r['total']} 位（來過的），平常約 {r['cycle_days']} 天來一次；超過 3 個週期沒來的 {r['dormant']} 位，占 {round(r['share'] * 100)}%。"
    if r['small']:
        s += f'名單少於 {SMALL} 位，先從新客開始。'
    else:
        s += f'所以先從{side}開始。'
    if r.get('booked'):
        s += f"另有 {r['booked']} 位預約了還沒來，不算進名單。"
    if r['skipped']:
        s += f"另有 {len(r['skipped'])} 列沒算進去：" + '；'.join(f"第 {x['row']} 列 {x['name']} {x['why']}" for x in r['skipped'][:3]) + '。'
    return s


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='算客人名單的週期、三圈與 333')
    ap.add_argument('csv')
    ap.add_argument('--cycle', type=int)
    ap.add_argument('--today')
    a = ap.parse_args()
    out = analyze(load(a.csv), datetime.date.fromisoformat(a.today) if a.today else None, a.cycle)
    out['summary'] = summary(out)
    print(json.dumps(out, ensure_ascii=False, indent=2))
