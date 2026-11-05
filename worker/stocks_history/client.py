"""Read-only Alpaca data client. Credentials are never written to cache/logs."""
import gzip
import hashlib
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests

from .config import ASOF, CREDENTIALS, OUTPUT, RAW_START, SYMBOLS

LOCK = threading.Lock()
LAST_REQUEST = 0.0
BASE = 'https://data.alpaca.markets'


def credentials(path=CREDENTIALS):
    names = ['APCA_API_KEY_ID', 'APCA_API_SECRET_KEY']
    if any(os.environ.get(name) for name in names):
        if not all(os.environ.get(name) for name in names):
            raise RuntimeError('Both Alpaca environment credentials are required')
        return {name.replace('_', '-'): os.environ[name] for name in names}
    values = {}
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('\"').strip("'")
    return {name.replace('_', '-'): values[name]
            for name in names}


def now():
    return datetime.now(timezone.utc).isoformat()


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


class Client:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(credentials())

    def get(self, route, params):
        global LAST_REQUEST
        if route not in ['/v2/stocks/bars', '/v2/stocks/auctions', '/v1/corporate-actions']:
            raise ValueError('Only historical market-data routes are allowed')
        for attempt in range(6):
            with LOCK:
                time.sleep(max(0, 0.33 - (time.monotonic() - LAST_REQUEST)))
                LAST_REQUEST = time.monotonic()
            try:
                response = self.session.get(BASE + route, params=params, timeout=60)
            except requests.RequestException:
                if attempt == 5:
                    raise RuntimeError('Market-data connection failed after retries') from None
                time.sleep(min(2 ** attempt, 16))
                continue
            if response.status_code == 429 or response.status_code >= 500:
                time.sleep(min(2 ** (attempt + 1), 30))
                continue
            if response.status_code != 200:
                # Do not include request objects/headers or provider response in errors.
                raise RuntimeError(f'Market-data request rejected: HTTP {response.status_code}')
            return response.json(), response.headers.get('X-Request-ID')
        raise RuntimeError('Market-data retry limit reached')


def fetch_bars(symbol, adjustment, timeframe='30Min'):
    cache_kind = adjustment if timeframe == '30Min' else f'daily_{adjustment}'
    destination = OUTPUT / '_internal' / 'responses' / symbol / cache_kind
    destination.mkdir(parents=True, exist_ok=True)
    params = {'symbols': symbol, 'timeframe': timeframe,
              'start': RAW_START + 'T00:00:00Z', 'end': '2026-10-31T00:00:00Z',
              'feed': 'sip', 'adjustment': adjustment, 'asof': ASOF,
              'limit': 10000, 'sort': 'asc', 'currency': 'USD'}
    client = Client()
    page, total = 0, 0
    while True:
        response_path = destination / f'{page:04d}.json.gz'
        receipt_path = destination / f'{page:04d}.receipt.json'
        if response_path.exists() and receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            if receipt['params'] != params or receipt['sha256'] != sha256(response_path):
                raise RuntimeError(f'Cache verification failed: {symbol}/{adjustment}/{page}')
            with gzip.open(response_path, 'rt', encoding='utf-8') as stream:
                payload = json.load(stream)
        else:
            payload, request_id = client.get('/v2/stocks/bars', params)
            temporary = response_path.with_suffix('.tmp')
            with gzip.open(temporary, 'wt', encoding='utf-8') as stream:
                json.dump(payload, stream, separators=(',', ':'))
            temporary.replace(response_path)
            receipt = {'route': BASE + '/v2/stocks/bars', 'params': params.copy(),
                       'received_at': now(), 'request_id': request_id,
                       'sha256': sha256(response_path)}
            receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
        total += sum(len(rows) for rows in (payload.get('bars') or {}).values())
        token = payload.get('next_page_token')
        if not token:
            break
        if params.get('page_token') == token:
            raise RuntimeError('Pagination token repeated')
        params['page_token'] = token
        page += 1
    print(f'downloaded {symbol:5s} {cache_kind:11s} bars={total} pages={page + 1}', flush=True)
    return total


def fetch_actions():
    path = OUTPUT / '_internal' / 'corporate_actions.json'
    if path.exists():
        return json.loads(path.read_text())
    client = Client()
    pages = []
    params = {'symbols': ','.join(SYMBOLS), 'start': RAW_START, 'end': ASOF,
              'types': 'forward_split,reverse_split,spin_off,cash_merger,stock_merger,stock_and_cash_merger,name_change,reorganization',
              'limit': 1000, 'sort': 'asc'}
    while True:
        try:
            payload, request_id = client.get('/v1/corporate-actions', params)
        except RuntimeError as exc:
            result = {'available': False, 'error': str(exc), 'pages': pages}
            break
        pages.append({'params': params.copy(), 'received_at': now(),
                      'request_id': request_id, 'payload': payload})
        token = payload.get('next_page_token')
        if not token:
            result = {'available': True, 'pages': pages}
            break
        params['page_token'] = token
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def fetch_spin_adjustments():
    """Bulk daily spin-off adjustments identify older events absent in actions API."""
    destination = OUTPUT / '_internal' / 'spin_adjustment_pages'
    destination.mkdir(parents=True, exist_ok=True)
    params = {'symbols': ','.join(SYMBOLS + ['SPY']), 'timeframe': '1Day',
              'start': RAW_START + 'T00:00:00Z', 'end': '2026-10-31T00:00:00Z',
              'feed': 'sip', 'adjustment': 'spin-off', 'asof': ASOF,
              'limit': 10000, 'sort': 'asc', 'currency': 'USD'}
    client, page = Client(), 0
    while True:
        path = destination / f'{page:04d}.json'
        if path.exists():
            record = json.loads(path.read_text())
            if record['params'] != params:
                raise ValueError('Spin adjustment cache parameters differ')
        else:
            payload, request_id = client.get('/v2/stocks/bars', params)
            record = {'params': params.copy(), 'received_at': now(),
                      'request_id': request_id, 'payload': payload}
            path.write_text(json.dumps(record, separators=(',', ':')), encoding='utf-8')
        token = record['payload'].get('next_page_token')
        if not token:
            break
        params['page_token'] = token
        page += 1
    print(f'spin_adjustment_pages={page+1}', flush=True)


def fetch_auctions():
    destination = OUTPUT / '_internal' / 'auction_pages'
    destination.mkdir(parents=True, exist_ok=True)
    client, page = Client(), 0
    params = {'symbols': ','.join(SYMBOLS + ['SPY']), 'start': RAW_START,
              'end': '2026-10-31', 'asof': ASOF, 'feed': 'sip',
              'limit': 10000, 'sort': 'asc', 'currency': 'USD'}
    while True:
        path = destination / f'{page:04d}.json.gz'
        receipt_path = destination / f'{page:04d}.receipt.json'
        if path.exists() and receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            if receipt['params'] != params or receipt['sha256'] != sha256(path):
                raise ValueError('Auction cache verification failed')
            with gzip.open(path, 'rt', encoding='utf-8') as stream:
                payload = json.load(stream)
        else:
            payload, request_id = client.get('/v2/stocks/auctions', params)
            with gzip.open(path, 'wt', encoding='utf-8') as stream:
                json.dump(payload, stream, separators=(',', ':'))
            receipt = {'params':params.copy(),'received_at':now(),'request_id':request_id,'sha256':sha256(path)}
            receipt_path.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
        token = payload.get('next_page_token')
        if not token:
            break
        params['page_token'] = token
        page += 1
    print(f'auction_pages={page+1}',flush=True)


def download():
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_bars, symbol, adjustment, '1Day')
                   for symbol in SYMBOLS + ['SPY'] for adjustment in ['raw', 'split']]
        for future in as_completed(futures):
            future.result()
        futures = [pool.submit(fetch_bars, symbol, 'raw') for symbol in SYMBOLS + ['SPY']]
        for future in as_completed(futures):
            future.result()
    result = fetch_actions()
    print(f'corporate_actions_available={result["available"]}', flush=True)


if __name__ == '__main__':
    download()
