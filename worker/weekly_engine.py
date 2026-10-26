"""Generation and referee for four daily prospective rounds; runs in Actions."""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

import data_feed
import ml_storage as storage
import weekly_protocol as p
from generate_dataset_github import DEFAULT_BINANCE_UNIVERSE

log = logging.getLogger(__name__)
SOURCE = 'https://data-api.binance.vision/api/v3/klines'
HISTORY_DAYS = 900


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def fetch_bars(symbol: str, start: date, end: date, now: datetime) -> pd.DataFrame:
    """Binance daily candles aligned to UTC-5; end exclusive, closed candles only.

    Binance's timeZone parameter avoids aggregating a 900-day hourly archive.
    startTime/endTime remain UTC milliseconds, as required by the API.
    """
    cursor = int(p.local_midnight(start).timestamp() * 1000)
    until = int(p.local_midnight(end).timestamp() * 1000)
    complete_before = int(now.timestamp() * 1000)
    rows = []
    while cursor < until:
        try:
            response = data_feed._http_get(SOURCE, params={
                'symbol': symbol, 'interval': '1d', 'timeZone': '-5:00',
                'startTime': cursor, 'endTime': until - 1, 'limit': 1000,
            }, op='Binance Vision daily tournament')
        except requests.RequestException:
            # Public Actions logs must not reveal the URL's symbol query parameter.
            raise ValueError('La fuente de mercado no está disponible; se reintentará') from None
        if response.status_code != 200:
            raise ValueError(f'Binance Vision no entregó la historia requerida (HTTP {response.status_code})')
        page = response.json()
        if not isinstance(page, list) or not page:
            break
        for item in page:
            opened, closed = int(item[0]), int(item[6])
            if opened >= until or closed >= complete_before:
                continue
            local = datetime.fromtimestamp(opened / 1000, timezone.utc).astimezone(p.TZ)
            if local.hour != 0 or local.minute != 0 or closed - opened != 86400000 - 1:
                raise ValueError('Binance devolvió velas fuera del día de Colombia')
            rows.append({'day': str(local.date()), 'open': float(item[1]), 'high': float(item[2]),
                         'low': float(item[3]), 'close': float(item[4]), 'volume': float(item[5]),
                         'open_time': opened, 'close_time': closed})
        next_cursor = int(page[-1][0]) + 1
        if next_cursor <= cursor:
            raise ValueError('La paginación de Binance no avanzó')
        cursor = next_cursor
        if len(page) < 1000:
            break
    if not rows:
        raise ValueError('No hay velas cerradas en el período pedido')
    frame = pd.DataFrame(rows).set_index('day').sort_index()
    if frame.index.duplicated().any() or not np.isfinite(frame.to_numpy()).all():
        raise ValueError('Historia duplicada o no finita')
    expected = pd.date_range(frame.index.min(), frame.index.max(), freq='D').strftime('%Y-%m-%d').tolist()
    if list(frame.index) != expected:
        raise ValueError('La fuente contiene días ausentes; no se rellenan precios')
    if (frame[['open', 'high', 'low', 'close']] <= 0).any().any() or (frame.volume < 0).any():
        raise ValueError('Precios o volúmenes inválidos')
    if (frame.high < frame[['open', 'close', 'low']].max(axis=1)).any() or (frame.low > frame[['open', 'close', 'high']].min(axis=1)).any():
        raise ValueError('Velas OHLC inconsistentes')
    return frame


def all_rows(sb, table: str, **filters) -> list[dict]:
    result, offset = [], 0
    while True:
        query = sb.table(table).select('*')
        for name, value in filters.items():
            query = query.eq(name, value)
        page = query.order('id').range(offset, offset + 499).execute().data or []
        result.extend(page)
        if len(page) < 500:
            return result
        offset += len(page)


def document(path: str, expected: str, key: bytes) -> dict:
    return p.unseal(storage.download_bytes(path, expected_sha256=expected), key, path)


def ensure_week(sb, monday: date, now: datetime) -> dict:
    week, rounds = p.schedule(monday)
    existing = sb.table('ml_return_weeks').select('*').eq('id', week['id']).execute().data
    if existing:
        # Repair a crash between inserting the week and its four schedules.
        known = {r['id'] for r in all_rows(sb, 'ml_return_rounds', week_id=week['id'])}
        for row in rounds:
            if row['id'] not in known:
                sb.table('ml_return_rounds').insert(row).execute()
        return existing[0]
    key = p.week_key(week['id'])
    universe = [tuple(x.split(':', 1)) for x in DEFAULT_BINANCE_UNIVERSE]
    active = data_feed.filter_binance_vision_spot_universe(universe)
    symbols = sorted(symbol for _, symbol in active)
    # Validate coverage before locking this week's universe. No mid-week removal.
    qualified = []
    observation = monday - timedelta(days=1)
    for symbol in symbols:
        try:
            bars = fetch_bars(symbol, observation - timedelta(days=HISTORY_DAYS), monday, now)
            if str(observation) in bars.index and len(bars) >= 250:
                qualified.append(symbol)
        except Exception as exc:
            log.warning('Excluded candidate due to incomplete source (%s)', type(exc).__name__)
    if len(qualified) < 30:
        raise ValueError(f'Universo insuficiente: {len(qualified)} activos con datos completos')
    path = f'returns/{week["id"]}/universe-{uuid.uuid4().hex}.enc'
    payload = p.seal({'symbols': qualified, 'selected_at': now.isoformat(),
                      'source': SOURCE, 'timeZone': '-5:00'}, key, path)
    storage.upload_bytes(payload, path)
    week.update(asset_count=len(qualified), universe_path=path, universe_hash=p.digest(payload))
    sb.table('ml_return_weeks').insert(week).execute()
    for row in rounds:
        sb.table('ml_return_rounds').insert(row).execute()
    log.info('Weekly return tournament created: %s (%d anonymous assets)', week['id'], len(qualified))
    return week


def build_round(sb, week: dict, row: dict, now: datetime) -> bool:
    if row['status'] in ('ready', 'settled', 'missed'):
        return False
    if now < parse_time(row['opens_at']):
        return False
    if now >= parse_time(row['closes_at']):
        sb.table('ml_return_rounds').update({'status': 'missed'}).eq('id', row['id']).execute()
        return False
    if row['status'] == 'building' and row.get('build_started_at') and parse_time(row['build_started_at']) > now - timedelta(minutes=30):
        return False
    claim = sb.table('ml_return_rounds').update({'status': 'building', 'build_started_at': now.isoformat()}).eq('id', row['id']).eq('status', row['status'])
    if row['status'] == 'building':
        claim = claim.eq('build_started_at', row['build_started_at'])
    if not claim.execute().data:
        return False
    try:
        key = p.week_key(week['id'])
        universe = document(week['universe_path'], week['universe_hash'], key)['symbols']
        observation = date.fromisoformat(row['observation_day'])
        bars = {symbol: fetch_bars(symbol, observation - timedelta(days=HISTORY_DAYS),
                                   observation + timedelta(days=1), now) for symbol in universe}
        if any(str(observation) not in f.index for f in bars.values()):
            raise ValueError('La última vela del universo fijo está incompleta')
        rkey = p.round_key(key, row['id'])
        parts, private = p.public_parts(bars, observation, rkey)
        private['bars'] = {symbol: f.rename_axis('day').reset_index().to_dict('records') for symbol, f in bars.items()}
        private['round_id'] = row['id']
        private['source'] = SOURCE
        private['timeZone'] = '-5:00'
        build_tag = uuid.uuid4().hex
        source_path = f'returns/{week["id"]}/{row["ordinal"]}/source-{build_tag}.enc'
        encrypted = p.seal(private, key, source_path)
        storage.upload_bytes(encrypted, source_path)
        if storage.download_bytes(source_path, expected_sha256=p.digest(encrypted)) != encrypted:
            raise ValueError('La fuente cifrada almacenada difiere')
        files = {}
        for kind, frame in parts.items():
            path = f'returns/{week["id"]}/{row["ordinal"]}/{build_tag}/{kind}.parquet'
            storage.upload_parquet(frame, path)
            files[kind] = {'path': path, 'rows': len(frame), 'hash': storage.sha256_df(frame),
                           'columns': list(frame.columns)}
        manifest = {'files': files, 'protocol': p.PROTOCOL, 'prediction_unit': 'fractional_return',
                    'training_target_step': p.LABEL_STEP, 'privacy': private['privacy'],
                    'source_commitment': p.digest(encrypted), 'asset_count': len(universe),
                    'observation_day': row['observation_day'], 'target_day': row['target_day'],
                    'data_source': 'Binance Vision', 'license': 'CC BY-NC-SA 4.0',
                    'terms_url': 'https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md'}
        version = 'dr1-' + p.digest(p.canonical(manifest))[:20]
        # Never publish a round that took so long to build that its window ended.
        finished = max(now, datetime.now(timezone.utc))
        if finished >= parse_time(row['closes_at']):
            raise ValueError('El plazo terminó durante la generación')
        published = sb.table('ml_return_rounds').update({'status': 'ready', 'published_at': finished.isoformat(),
            'version': version, 'manifest': manifest, 'source_path': source_path,
            'source_hash': p.digest(encrypted)}).eq('id', row['id']).eq('status', 'building').eq('build_started_at', now.isoformat()).execute()
        if not published.data:
            return False  # A stale lease may not overwrite the newer generation.
        log.info('Published return round %s with %d live rows', row['id'], len(universe))
        return True
    except Exception:
        # Allow a subsequent scheduled tick to retry without waiting for the lease.
        sb.table('ml_return_rounds').update({'status': 'pending', 'build_started_at': None}).eq('id', row['id']).eq('status', 'building').eq('build_started_at', now.isoformat()).execute()
        raise


def settle_round(sb, week: dict, row: dict, now: datetime) -> bool:
    if row['status'] != 'ready' or now < parse_time(row['target_end']) + timedelta(minutes=10):
        return False
    key = p.week_key(week['id'])
    source = document(row['source_path'], row['source_hash'], key)
    target_day = date.fromisoformat(row['target_day'])
    evidence, actual = [], {}
    for item in source['live_map']:
        bars = fetch_bars(item['symbol'], target_day, target_day + timedelta(days=1), now)
        if len(bars) != 1 or str(target_day) not in bars.index:
            raise ValueError('Falta una vela final del universo; no se sustituye ni elimina el activo')
        candle = bars.loc[str(target_day)]
        value = float(candle['close'] / candle['open'] - 1)
        actual[item['id']] = value
        evidence.append({'id': item['id'], 'symbol': item['symbol'], 'target_day': str(target_day),
                         'return': value, **{name: float(candle[name]) for name in ('open', 'high', 'low', 'close', 'volume')},
                         'open_time': int(candle.open_time), 'close_time': int(candle.close_time)})
    selected = all_rows(sb, 'ml_return_submissions', round_id=row['id'], is_selected=True)
    for submission in selected:
        content = storage.download_csv(submission['file_path'], expected_sha256=submission['file_sha256'])
        predictions = p.validate_csv(content, list(actual))
        result = p.score(predictions, actual)
        sb.table('ml_return_submissions').update({'status': 'scored', **result}).eq('id', submission['id']).execute()
    path = f'returns/{week["id"]}/{row["ordinal"]}/settlement-{uuid.uuid4().hex}.enc'
    payload = p.seal({'round_id': row['id'], 'assets': evidence, 'source': SOURCE, 'verified_at': now.isoformat()}, key, path)
    storage.upload_bytes(payload, path)
    sb.table('ml_return_rounds').update({'status': 'settled', 'settled_at': now.isoformat(),
        'settlement_path': path, 'settlement_hash': p.digest(payload)}).eq('id', row['id']).eq('status', 'ready').execute()
    log.info('Settled return round %s; results remain private until weekly publication', row['id'])
    return True


def publish_week(sb, week: dict, rounds: list[dict], now: datetime) -> bool:
    if week['status'] != 'open' or now < parse_time(week['release_at']):
        return False
    if len(rounds) != 4 or any(r['status'] not in ('settled', 'missed') for r in rounds):
        return False
    key = p.week_key(week['id'])
    results = {'protocol': p.PROTOCOL, 'week_id': week['id'], 'week_start': week['week_start'],
               'timezone': str(p.TZ), 'source': SOURCE, 'source_timeZone': '-5:00',
               'published_at': now.isoformat(), 'normalizer_floor': p.NORMALIZER_FLOOR,
               'scoring': '(MAE_zero - MAE_model) / max(MAE_zero, 0.005); mean of four rounds',
               'rounds': [], 'reproduction': {'weekly_key_b64': base64.b64encode(key).decode(),
                   'format': 'QLR1 + 12-byte nonce + AES-256-GCM ciphertext; AAD = original_source_path'}}
    for row in sorted(rounds, key=lambda r: r['ordinal']):
        entry = {name: row[name] for name in ('id', 'ordinal', 'observation_day', 'submission_day', 'target_day', 'status')}
        if row['status'] == 'settled':
            settlement = document(row['settlement_path'], row['settlement_hash'], key)
            entry['assets'] = settlement['assets']
            # The entire tournament is over. Publish originals for independent replay.
            cipher = storage.download_bytes(row['source_path'], expected_sha256=row['source_hash'])
            public_path = f'returns/{week["id"]}/evidence/round-{row["ordinal"]}.enc'
            storage.upload_bytes(cipher, public_path, private=False)
            entry['evidence'] = {'url': storage.public_url(public_path), 'sha256': row['source_hash'],
                                 'original_source_path': row['source_path'], 'version': row['version']}
            entry['dataset'] = row['manifest']
        results['rounds'].append(entry)
    path = f'returns/{week["id"]}/results.json'
    payload = p.canonical(results)
    storage.upload_bytes(payload, path, private=False, content_type='application/json')
    state = 'published' if all(r['status'] == 'settled' for r in rounds) else 'incomplete'
    sb.table('ml_return_weeks').update({'status': state, 'published_at': now.isoformat(),
        'result_path': path, 'result_hash': p.digest(payload)}).eq('id', week['id']).eq('status', 'open').execute()
    log.info('Published weekly tournament %s (%s)', week['id'], state)
    return True


def run_tick(sb, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(p.TZ)
    monday = local.date() - timedelta(days=local.weekday())
    # Never backfill forecasts whose target day already started.
    if local.weekday() < 4 and local >= p.local_midnight(local.date()) + timedelta(minutes=30):
        ensure_week(sb, monday, now)
    counts = {'created_rounds': 0, 'settled_rounds': 0, 'published_weeks': 0}
    failures = []
    for week in all_rows(sb, 'ml_return_weeks', status='open'):
        for row in all_rows(sb, 'ml_return_rounds', week_id=week['id']):
            try:
                counts['created_rounds'] += int(build_round(sb, week, row, now))
                # Refresh after a possible build, so the next tick can settle safely.
                fresh = sb.table('ml_return_rounds').select('*').eq('id', row['id']).execute().data[0]
                counts['settled_rounds'] += int(settle_round(sb, week, fresh, now))
            except Exception:
                log.exception('Return tournament round failed (id=%s)', row['id'])
                failures.append(row['id'])
        rounds = all_rows(sb, 'ml_return_rounds', week_id=week['id'])
        counts['published_weeks'] += int(publish_week(sb, week, rounds, now))
    if failures:
        raise RuntimeError(f'Rondas pendientes de reintento: {", ".join(failures)}')
    return counts
