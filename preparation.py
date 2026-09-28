"""新交易的確定性整理；呼叫模型、佇列和重試仍由 Companion 單一持有。"""
import copy
import datetime
import hashlib
import json
from domain import import_csv, now, uid, record


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def input_snapshot(s, extra_source=None):
    sources = s['sources'][-20:]
    if extra_source and not any(x['id'] == extra_source for x in sources):
        sources = sources + [x for x in s['sources'] if x['id'] == extra_source]
    return {
        'purpose': digest({'business': s['business'], 'interview': s.get('interview', {})}),
        'sources': [{'id': x['id'], 'version': digest(x), 'characters': len(x['content'])} for x in sources],
    }


def validate_snapshot(s, turn):
    if turn.get('followup'):
        f=turn['followup'];a=next((x for x in s['actions'] if x['id']==f['action']),None)
        if not a or a.get('status')!='done' or a.get('result_source')!=f['source'] or a.get('result')!=f['result']:
            raise ValueError('這件工作的結果已更新，請使用最新結果接續。')
    snapshot = turn.get('input_snapshot')
    if not snapshot:  # 舊版提案仍沿用原稿衝突檢查。
        return
    if snapshot['purpose'] != input_snapshot(s)['purpose']:
        raise ValueError('目標或訪談已更新；這份內容先保留，請帶著新脈絡再討論。')
    current = {x['id']: digest(x) for x in s['sources']}
    if any(current.get(x['id']) != x['version'] for x in snapshot['sources']):
        raise ValueError('這次使用的材料已更新；舊提案無法直接採用，請重新整理。')


def transaction_summary(s, sid):
    rows = [x for x in s['transactions'] if x['source'] == sid]
    if not rows:
        return None
    days = sorted({x['date'] for x in rows})
    timed = [x for x in rows if x.get('time')]
    afternoon = [x for x in timed if datetime.date.fromisoformat(x['date']).weekday() < 5 and '14:00' <= x['time'] < '17:00']
    # 只描述這份檔案，沒有完整期間聲明時不計成長率，交易筆數不當客人人數。
    return {
        'source': sid, 'count': len(rows), 'amount': round(sum(x['amount'] for x in rows), 2),
        'from': days[0], 'to': days[-1], 'rows': [x['row'] for x in rows],
        'fields': ['date', 'amount'], 'timed_count': len(timed),
        'weekday_afternoon': {'count': len(afternoon), 'amount': round(sum(x['amount'] for x in afternoon), 2)} if len(timed) == len(rows) else None,
        'afternoon_definition': '週一至週五 14:00–16:59；只限這份檔案已記錄的交易',
        'period_complete': False, 'customer_count': None, 'growth': None,
        'limits': '交易筆數不等於客人人數；未核對整段資料完整性，不推算來客、轉換率或前期增減。',
    }


def import_and_prepare(s, name, content, prepare=None):
    s = import_csv(s, name, content)
    c = s.setdefault('companion', {'mode': 'native', 'turns': []})
    if prepare is None:
        prepare = c.get('prepare_imports', False)
    if prepare is not True:
        return s
    sid = s['sources'][-1]['id']
    summary = transaction_summary(s, sid)
    if not summary:
        return s
    snapshot = input_snapshot(s, sid)
    # 新交易只帶店主訪談與這份交易；不整包送出客戶名單和歷史營收。
    selected = [x for x in s['sources'] if x['id'] == sid or x['kind'] == 'interview']
    snapshot['sources'] = [{'id': x['id'], 'version': digest(x), 'characters': len(x['content'])} for x in selected]
    event = digest({'kind': 'transactions', 'source': s['sources'][-1].get('rows_digest'), 'purpose': snapshot['purpose']})
    if event in c.setdefault('events_seen', []):
        return s
    rid = uid()
    text = '依這次新交易與我的目標，先準備一個值得做的下一步。資料不足時，幫我設計最小的補充紀錄；不要編數字。'
    context = {'kind': 'source', 'page': 'overview', 'item': copy.deepcopy(s['sources'][-1])}
    c['turns'].append({'id': rid, 'text': text, 'context': context, 'preferences': copy.deepcopy(s['preferences']),
                       'at': now(), 'status': 'queued', 'reply': None, 'automatic': True, 'event': event,
                       'summary': summary, 'input_snapshot': snapshot})
    c['events_seen'].append(event)
    s['requests'].append({'id': rid, 'text': text, 'view': {'page': 'overview', 'selected': sid}, 'status': 'queued', 'at': now()})
    record(s, '新交易已整理，接著準備與目標有關的下一步', source=sid, request=rid)
    s['revision'] += 1
    return s
