"""Private round registration and daily scoring. No model execution or trading."""
import csv
import io
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import requests

from .cloud import Storage
from .protocol import digest, instant, predictions, score


class Repository:
    def __init__(self, storage=None):
        self.storage = storage or Storage()

    def request(self, method, path, **kwargs):
        response = self.storage.request(method, '/rest/v1/' + path, timeout=60, **kwargs)
        if response.status_code not in (200, 201, 204):
            raise RuntimeError(f'Stock database request rejected: HTTP {response.status_code}')
        return response.json() if response.content else None

    def rows(self, table, **filters):
        params = {'select': '*', **{key: 'eq.' + str(value).lower() if isinstance(value, bool)
                  else 'eq.' + str(value) for key, value in filters.items()}}
        result = []
        for offset in range(0, 100000, 500):
            page = self.request('GET', table, params={**params, 'offset': offset, 'limit': 500, 'order': 'id.asc'})
            result.extend(page)
            if len(page) < 500:
                return result
        raise RuntimeError('Stock query exceeds safe pagination limit')

    def update(self, table, identity, data):
        return self.request('PATCH', table, params={'id': 'eq.' + identity}, json=data)


def register_latest(repo, now=None):
    now = now or datetime.now(timezone.utc)
    data = repo.storage.get('daily/latest.json', optional=True)
    if data is None:
        return False
    pointer = json.loads(data)
    payload = repo.storage.get(pointer['manifest'])
    if digest(payload) != pointer['manifest_sha256']:
        raise ValueError('Published manifest checksum differs')
    manifest = json.loads(payload)
    identity = 'stocks-oc-' + manifest['target_date']
    existing = repo.rows('stock_return_rounds', id=identity)
    if existing:
        if existing[0]['manifest_hash'] != digest(payload):
            raise ValueError('A stock round cannot change after registration')
        return False
    if manifest['mode'] != 'live' or now >= instant(manifest['submission_deadline']):
        raise ValueError('Cannot register a replay or a closed round')
    prefix = pointer['manifest'].rsplit('/', 1)[0]
    live = repo.storage.get(prefix + '/live.csv')
    if digest(live) != manifest['files']['live.csv']['sha256']:
        raise ValueError('Live dataset checksum differs')
    rows = list(csv.DictReader(io.StringIO(live.decode('utf-8'))))
    assets = [{'id': r['id'], 'ticker': r['ticker']} for r in rows]
    if not 40 <= len(assets) <= 50 or len(assets) != manifest['rows'] or len({a['id'] for a in assets}) != len(assets):
        raise ValueError('Invalid stock round coverage')
    if any(r['date'] != manifest['observation_date'] or r['target_date'] != manifest['target_date'] for r in rows):
        raise ValueError('Live dates differ from round')
    record = {'id': identity, 'target_date': manifest['target_date'],
              'observation_date': manifest['observation_date'], 'deadline': manifest['submission_deadline'],
              'target_open': manifest['target_open'], 'target_close': manifest['target_close'],
              'manifest_path': pointer['manifest'], 'manifest_hash': digest(payload),
              'manifest': manifest, 'assets': assets}
    repo.request('POST', 'stock_return_rounds', json=record)
    return True


def fetch_actual(row, now):
    """Use the same vendor's raw eligible daily prices as historical labels."""
    headers = {name.replace('_', '-'): os.environ[name] for name in ['APCA_API_KEY_ID', 'APCA_API_SECRET_KEY']}
    target = row['target_date']
    params = {'symbols': ','.join(a['ticker'] for a in row['assets']), 'timeframe': '1Day',
              'start': target + 'T00:00:00Z', 'end': (datetime.fromisoformat(target) + timedelta(days=1)).isoformat() + 'Z',
              'feed': 'sip', 'adjustment': 'raw', 'asof': target, 'limit': 10000, 'sort': 'asc', 'currency': 'USD'}
    try:
        response = requests.get('https://data.alpaca.markets/v2/stocks/bars', headers=headers, params=params, timeout=60)
    except requests.RequestException:
        raise RuntimeError('Stock settlement market-data connection failed') from None
    if response.status_code != 200:
        raise RuntimeError(f'Stock settlement market data rejected: HTTP {response.status_code}')
    payload = response.json()
    evidence = evidence_from_bars(row, payload)
    return {'round_id': row['id'], 'target_date': target, 'verified_at': now.isoformat(),
            'source': 'Alpaca SIP raw daily eligible OHLC', 'request_id': response.headers.get('X-Request-ID'),
            'source_response': payload, 'assets': evidence}


def evidence_from_bars(row, payload):
    import math
    from zoneinfo import ZoneInfo
    if payload.get('next_page_token'):
        raise ValueError('Incomplete stock settlement pagination')
    result = []
    for asset in row['assets']:
        bars = (payload.get('bars') or {}).get(asset['ticker'], [])
        if len(bars) != 1 or instant(bars[0]['t']).astimezone(ZoneInfo('America/New_York')).date().isoformat() != row['target_date']:
            raise ValueError('Missing final stock candle; no assets may be dropped')
        bar = bars[0]
        values = [float(bar[k]) for k in ('o', 'h', 'l', 'c', 'v')]
        o, h, l, c, v = values
        if not all(math.isfinite(x) for x in values) or min(o, h, l, c) <= 0 or v <= 0 or h < max(o, l, c) or l > min(o, h, c):
            raise ValueError('Invalid stock settlement candle')
        result.append({**asset, 'open': o, 'close': c, 'return': c / o - 1})
    return result


def settle_round(repo, row, now=None):
    now = now or datetime.now(timezone.utc)
    if row['status'] != 'open' or now < instant(row['target_close']) + timedelta(minutes=30):
        return False
    # Freeze one source snapshot BEFORE any score updates, so retries cannot mix vintages.
    path = 'settlements/' + row['id'] + '/evidence.json'
    raw = repo.storage.get(path, optional=True)
    if raw is None:
        raw = json.dumps(fetch_actual(row, now), sort_keys=True, allow_nan=False).encode()
        repo.storage.put(path, raw, content_type='application/json')
        if repo.storage.get(path) != raw:
            raise ValueError('Settlement upload checksum differs')
    evidence = json.loads(raw)
    if evidence['round_id'] != row['id']:
        raise ValueError('Settlement round differs')
    actual = {a['id']: a['return'] for a in evidence['assets']}
    if len(actual) != len(row['assets']) or set(actual) != {a['id'] for a in row['assets']}:
        raise ValueError('Incomplete stock settlement coverage')
    for sub in repo.rows('stock_return_submissions', round_id=row['id'], is_selected=True):
        content = repo.storage.get(sub['file_path'])
        if digest(content) != sub['file_sha256'] or sub['manifest_hash'] != row['manifest_hash']:
            raise ValueError('Submission integrity differs')
        result = score(predictions(content, list(actual)), actual)
        repo.update('stock_return_submissions', sub['id'], {'status': 'scored', **result})
    repo.update('stock_return_rounds', row['id'], {'status': 'settled', 'settled_at': now.isoformat(),
                'result_path': path, 'result_hash': digest(raw)})
    return True


def settle_due(repo):
    settled = 0
    for row in repo.rows('stock_return_rounds', status='open'):
        settled += int(settle_round(repo, row))
    return settled


def run():
    repo = Repository()
    run_id = str(uuid.uuid4())
    repo.request('POST', 'operation_runs', json={'job': 'stock_return_referee', 'run_id': run_id,
                 'commit_sha': os.environ.get('GITHUB_SHA'), 'started_at': datetime.now(timezone.utc).isoformat(), 'status': 'running'})
    try:
        counts = {'settled_rounds': settle_due(repo)}
    except Exception:
        repo.request('PATCH', 'operation_runs', params={'run_id': 'eq.' + run_id, 'job': 'eq.stock_return_referee'},
                     json={'status': 'failed', 'error_code': 'STOCK_REFEREE_FAILED', 'finished_at': datetime.now(timezone.utc).isoformat()})
        raise
    repo.request('PATCH', 'operation_runs', params={'run_id': 'eq.' + run_id, 'job': 'eq.stock_return_referee'},
                 json={'status': 'success', 'counts': counts, 'finished_at': datetime.now(timezone.utc).isoformat()})
    print(json.dumps(counts))


if __name__ == '__main__':
    run()
