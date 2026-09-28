"""可共用的來源問答回執；不讀憑證、資料庫、HOME 或網路。"""
import math

SCHEMA = 'source-execution.v1'
TOKEN_FIELDS = ('input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
                'output_tokens', 'reasoning_output_tokens')


def attempt_limit(*, automatic):
    return 1 if automatic is True else 2


def summarize_attempts(results, *, limit):
    if type(limit) is not int or limit not in (1, 2):
        raise ValueError('來源問答最多允許一至兩次執行。')
    if not results or len(results) > limit:
        raise ValueError('執行次數不符合上限。')
    attempts = []
    for result in results:
        raw = result.get('usage')
        usage = {key: raw[key] for key in TOKEN_FIELDS if isinstance(raw, dict)
                 and type(raw.get(key)) in (int, float) and math.isfinite(raw[key]) and raw[key] >= 0}
        error = result.get('error') or {}
        attempts.append({'run_id': result.get('run_id'), 'status': result.get('status'),
                         'usage': usage or None, 'receipt_path': result.get('receipt_path'),
                         'error_code': error.get('code') if isinstance(error, dict) else None})
    fields = set().union(*(a['usage'] or {} for a in attempts))
    totals = {key: sum(a['usage'][key] for a in attempts)
              if all(key in (a['usage'] or {}) for a in attempts) else None for key in sorted(fields)}
    complete = all(key in totals and totals[key] is not None for key in ('input_tokens', 'output_tokens'))
    return {'schema': SCHEMA, 'attempt_limit': limit, 'runner_attempts': len(attempts),
            'usage': totals or None, 'usage_complete': complete, 'attempts': attempts,
            'billing_amount': None, 'billing_note': 'Token 用量不是訂閱扣款或 API 帳單。'}
