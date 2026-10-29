"""Forward-time tests: private sources, actual return scoring and delayed reveal."""
import copy
import base64
import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import weekly_protocol as p
import weekly_engine as engine
import weekly_api as api
import ml_storage as storage
from test_ml_tournaments import FakeSupabase

MONDAY = date(2027, 1, 4)
USER = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-000000000002'


def test_calendar_is_local_fixed_and_forward_only():
    week, rounds = p.schedule(date(2026, 10, 26))
    assert week['release_at'] == '2026-10-31T00:30:00-05:00'
    for i, row in enumerate(rounds):
        assert row['ordinal'] == i + 1
        assert row['opens_at'].endswith('T00:30:00-05:00')
        assert row['closes_at'] == row['target_start']
        assert date.fromisoformat(row['target_day']) - date.fromisoformat(row['observation_day']) == timedelta(days=2)
        assert engine.parse_time(row['target_end']) - engine.parse_time(row['target_start']) == timedelta(days=1)
    with pytest.raises(ValueError):
        p.schedule(date(2026, 10, 27))


def test_return_csv_accepts_zero_negative_and_checks_exact_coverage():
    ids = ['a', 'b']
    checked = p.validate_csv(b'\xef\xbb\xbfid,prediction\r\nb,-0.025\r\na,0\r\n', ids)
    assert checked.prediction.tolist() == [-0.025, 0]
    assert p.score(checked, {'a': 0, 'b': -0.025})['mae'] == 0
    assert p.score(p.validate_csv(b'id,prediction\na,0\nb,0\n', ids), {'a': 0.02, 'b': -0.03})['score'] == 0
    for bad in (b'id,prediction\na,NaN\nb,0', b'id,prediction\na,0\na,0',
                b'id,prediction\na,0', b'id,prediction\na,-1.1\nb,0',
                b'id,prediction\na,1_0\nb,0', b'id,prediction\na,0\nb,0\n\n',
                b'id,prediction,extra\na,0,1\nb,0,1'):
        with pytest.raises(ValueError):
            p.validate_csv(bad, ids)


def test_cipher_is_authenticated_and_week_keys_rotate(monkeypatch):
    monkeypatch.setenv('DATASET_SALT', 'test-only-master-secret-of-sufficient-length')
    key = p.week_key('first')
    assert key != p.week_key('next')
    payload = p.seal({'symbol': 'SECRET'}, key, 'context')
    assert b'SECRET' not in payload
    assert p.unseal(payload, key, 'context')['symbol'] == 'SECRET'
    for data, secret, context in ((payload[:-1] + bytes([payload[-1] ^ 1]), key, 'context'),
                                   (payload, p.week_key('next'), 'context'), (payload, key, 'wrong-context')):
        with pytest.raises(Exception):
            p.unseal(data, secret, context)


@pytest.fixture
def market():
    days = pd.date_range(MONDAY - timedelta(days=500), MONDAY + timedelta(days=6), freq='D')
    result = {}
    for i in range(32):
        rng = np.random.default_rng(100 + i)
        closes = 100 * np.exp(np.cumsum(rng.normal(0.0001, 0.02, len(days))))
        opens = np.r_[closes[0] * 0.99, closes[:-1]]
        result[f'COIN{i:02d}USDT'] = pd.DataFrame({
            'open': opens, 'high': np.maximum(opens, closes) * 1.01,
            'low': np.minimum(opens, closes) * .99, 'close': closes,
            'volume': rng.uniform(10000, 20000, len(days)),
            'open_time': [int(p.local_midnight(d.date()).timestamp() * 1000) for d in days],
            'close_time': [int((p.local_midnight(d.date()) + timedelta(days=1)).timestamp() * 1000) - 1 for d in days],
        }, index=days.strftime('%Y-%m-%d'))
    return result


def test_public_matrix_has_no_prices_dates_or_symbols_and_rotates(market):
    day = MONDAY - timedelta(days=1)
    bars = {s: f.loc[f.index <= str(day)] for s, f in market.items()}
    parts, info = p.public_parts(bars, day, b'a' * 32)
    second, _ = p.public_parts(bars, day, b'b' * 32)
    assert set(parts['live'].id).isdisjoint(second['live'].id)
    assert 'target' not in parts['live']
    for kind, frame in parts.items():
        assert not any(x in frame.columns for x in ('symbol', 'close', 'volume', 'day'))
        assert not any('COIN' in value for value in frame.id)
        assert frame.id.is_unique
        for column in frame.columns:
            if column.startswith('feature_'):
                assert set(frame[column]).issubset({0, .25, .5, .75, 1})
        if kind != 'live':
            assert np.allclose(frame.target / p.LABEL_STEP, np.round(frame.target / p.LABEL_STEP))
    assert len(info['live_map']) == 32


@pytest.fixture
def backend(monkeypatch, market):
    import main
    monkeypatch.setenv('DATASET_SALT', 'test-only-master-secret-of-sufficient-length')
    db, files = FakeSupabase(), {}
    clock = {'now': p.local_midnight(MONDAY) + timedelta(hours=1), 'user': USER}
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock['now'].astimezone(tz) if tz else clock['now'].replace(tzinfo=None)
    monkeypatch.setattr(api, 'datetime', Frozen)
    monkeypatch.setattr(api, 'database', lambda: db)
    monkeypatch.setattr(api, 'require_user', lambda _request: clock['user'])
    monkeypatch.setattr(engine.data_feed, 'filter_binance_vision_spot_universe', lambda _universe: [('crypto', x) for x in market])
    def fetch(symbol, start, end, now):
        f = market[symbol]
        # Never returns the current or a future local candle.
        return f.loc[(f.index >= str(start)) & (f.index < str(end)) & (f.index < str(now.astimezone(p.TZ).date()))].copy()
    monkeypatch.setattr(engine, 'fetch_bars', fetch)
    def put_bytes(data, path, *, private=True, **_kw):
        files[(private, path)] = data
        return path
    def get_bytes(path, *, private=True, expected_sha256=None):
        data = files[(private, path)]
        return storage.verify_bytes(data, expected_sha256)
    monkeypatch.setattr(storage, 'upload_bytes', put_bytes)
    monkeypatch.setattr(storage, 'download_bytes', get_bytes)
    monkeypatch.setattr(storage, 'upload_parquet', lambda frame, path: files.update({('frame', path): frame.copy()}))
    monkeypatch.setattr(storage, 'download_parquet', lambda path: files[('frame', path)].copy())
    monkeypatch.setattr(storage, 'upload_csv', lambda data, path: files.update({('csv', path): data}))
    monkeypatch.setattr(storage, 'download_csv', lambda path, expected_sha256=None: storage.verify_bytes(files[('csv', path)], expected_sha256))
    monkeypatch.setattr(storage, 'public_url', lambda path: 'https://public.example/' + path)
    def rpc(name, payload):
        def execute():
            assert name == 'activate_return_submission'
            sub = next(x for x in db.rows['ml_return_submissions'] if x['id'] == payload['p_submission'])
            row = next(x for x in db.rows['ml_return_rounds'] if x['id'] == sub['round_id'])
            assert row['status'] == 'ready' and engine.parse_time(row['opens_at']) <= clock['now'] < engine.parse_time(row['closes_at'])
            assert row['version'] == sub['dataset_version']
            for x in db.rows['ml_return_submissions']:
                if x['round_id'] == row['id'] and x['user_id'] == sub['user_id']:
                    x['is_selected'] = x['id'] == sub['id']
            return SimpleNamespace(data=True)
        return SimpleNamespace(execute=execute)
    db.rpc = rpc
    metadata = base64.b64encode(json.dumps({'model_name': 'Technical zero baseline', 'parameters': {}, 'seed': 42, 'note': 'Controlled test'}).encode()).decode()
    return db, files, clock, TestClient(main.app, headers={'X-QuantBattle-Experiment': metadata})


def test_full_week_replacements_deadlines_embargo_and_four_round_ranking(backend):
    db, files, clock, client = backend
    first = engine.run_tick(db, clock['now'])
    assert first['created_rounds'] == 1
    week = db.rows['ml_return_weeks'][0]
    assert len(db.rows['ml_return_rounds']) == 4
    for offset in range(4):
        clock['now'] = p.local_midnight(MONDAY + timedelta(days=offset)) + timedelta(hours=1)
        engine.run_tick(db, clock['now'])
        row = next(r for r in db.rows['ml_return_rounds'] if r['ordinal'] == offset + 1)
        endpoint = f'/ml/return-rounds/{row["id"]}'
        public = client.get(f'/ml/return-tournaments/{week["id"]}')
        assert public.status_code == 200
        assert not any(word in public.text for word in ('COIN', 'universe.enc', 'source.enc', 'weekly_key', 'settlement_hash'))
        ids = client.get(endpoint + '/rows').json()['ids']
        content = ('id,prediction\n' + ''.join(f'{x},0\n' for x in ids)).encode()
        response = client.post(endpoint + '/predictions', content=content)
        assert response.status_code == 200, response.text
        assert response.json()['submission']['file_sha256'] == p.digest(content)
        bad = client.post(endpoint + '/predictions', content=content.replace(ids[0].encode(), b'unknown'))
        assert bad.status_code == 422
        correction = client.post(endpoint + '/predictions', content=content)
        assert correction.status_code == 200
        if offset < 3:
            clock['user'] = OTHER
            assert client.post(endpoint + '/predictions', content=content).status_code == 200
            clock['user'] = USER
        selected = [s for s in db.rows['ml_return_submissions'] if s['round_id'] == row['id'] and s['user_id'] == USER and s['is_selected']]
        assert len(selected) == 1 and selected[0]['id'] == correction.json()['submission']['id']
        receipt = client.get(endpoint + '/mine').json()
        assert 'score' not in str(receipt) and 'mae' not in str(receipt)
        assert client.get(f'/ml/return-tournaments/{week["id"]}/results').status_code == 409
        assert not any(private is False for private, _path in files if isinstance(private, bool))
        clock['now'] = engine.parse_time(row['closes_at'])
        assert client.post(endpoint + '/predictions', content=content).status_code == 409
    clock['now'] = p.local_midnight(MONDAY + timedelta(days=4)) + timedelta(hours=23, minutes=59)
    engine.run_tick(db, clock['now'])
    assert client.get(f'/ml/return-tournaments/{week["id"]}/results').status_code == 409
    # Even already scored daily receipts must not leak their scores before Saturday.
    receipt = client.get(f'/ml/return-rounds/{db.rows["ml_return_rounds"][0]["id"]}/mine')
    assert '"score"' not in receipt.text
    clock['now'] = engine.parse_time(week['release_at'])
    assert engine.run_tick(db, clock['now'])['published_weeks'] == 1
    result = client.get(f'/ml/return-tournaments/{week["id"]}/results')
    assert result.status_code == 200, result.text
    data = result.json()
    assert len(data['evidence']['rounds']) == 4
    assert data['evidence']['rounds'][0]['assets'][0]['symbol'].startswith('COIN')
    first_evidence = data['evidence']['rounds'][0]
    source = engine.document(db.rows['ml_return_rounds'][0]['source_path'], db.rows['ml_return_rounds'][0]['source_hash'], p.week_key(week['id']))
    reconstructed = {s: pd.DataFrame(rows).set_index('day') for s, rows in source['bars'].items()}
    replayed, _ = p.public_parts(reconstructed, date.fromisoformat(source['observation_day']),
        p.round_key(p.week_key(week['id']), source['round_id']), source['feature_projection'])
    for kind, frame in replayed.items():
        assert storage.sha256_df(frame) == first_evidence['dataset']['files'][kind]['hash']
    eligible = [x for x in data['leaderboard'] if x['eligible']]
    assert len(eligible) == 1 and eligible[0]['user_id'] == USER and eligible[0]['score'] == 0
    assert next(x for x in data['leaderboard'] if x['user_id'] == OTHER)['eligible'] is False
    assert engine.run_tick(db, clock['now']) == {'created_rounds': 0, 'settled_rounds': 0, 'published_weeks': 0}


def test_failed_market_settlement_does_not_publish_or_drop_an_asset(backend, monkeypatch):
    db, files, clock, client = backend
    engine.run_tick(db, clock['now'])
    week = db.rows['ml_return_weeks'][0]
    row = db.rows['ml_return_rounds'][0]
    original = engine.fetch_bars
    monkeypatch.setattr(engine, 'fetch_bars', lambda symbol, *args: original(symbol, *args).iloc[:0])
    clock['now'] = engine.parse_time(row['target_end']) + timedelta(minutes=30)
    with pytest.raises(ValueError):
        engine.settle_round(db, week, row, clock['now'])
    assert row['status'] == 'ready' and week['status'] == 'open'
    # A forged state alone cannot bypass the endpoint's time/round guards.
    week['status'] = 'published'
    assert client.get(f'/ml/return-tournaments/{week["id"]}/results').status_code == 409


def test_binance_candle_timezone_gaps_and_partial_candles(monkeypatch):
    start = date(2026, 10, 24)
    opened = int(p.local_midnight(start).timestamp() * 1000)
    candle = [opened, '100', '103', '99', '102', '1000', opened + 86400000 - 1]
    captured = []
    def response(_url, params, op):
        captured.append(params)
        return SimpleNamespace(status_code=200, json=lambda: [candle])
    monkeypatch.setattr(engine.data_feed, '_http_get', response)
    now = p.local_midnight(start + timedelta(days=1)) + timedelta(minutes=30)
    bars = engine.fetch_bars('EXAMPLEUSDT', start, start + timedelta(days=1), now)
    assert len(bars) == 1 and captured[0]['timeZone'] == '-5:00'
    assert bars.iloc[0]['close'] == 102
    with pytest.raises(ValueError):
        engine.fetch_bars('EXAMPLEUSDT', start, start + timedelta(days=1), now - timedelta(hours=1))
