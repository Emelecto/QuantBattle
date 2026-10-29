"""Real production launch check. Uses a clearly labelled technical account, no emails.

It never manufactures future prices, advances deadlines, or publishes scores.
Secrets/session stay in an ignored local file; the report contains only safe evidence.
"""
from __future__ import annotations

import base64
from datetime import date, datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import secrets
import sys

import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'worker'))
import weekly_protocol as p
import weekly_engine as engine
import ml_storage as storage


def main():
    load_dotenv(ROOT / 'worker/.env')
    load_dotenv(ROOT / 'web/.env.local')
    if os.environ.get('TESTING') or os.environ.get('ALLOW_TEST_AUTH'):
        raise RuntimeError('Production verification requires actual authentication')
    from supabase import create_client
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error
    public_key = os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    url = os.environ['SUPABASE_URL']
    worker = os.environ['NEXT_PUBLIC_WORKER_URL'].rstrip('/')
    sb = create_client(url, os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    weeks = requests.get(worker + '/ml/return-tournaments', timeout=90)
    weeks.raise_for_status()
    week = next(w for w in weeks.json()['tournaments'] if any(r['status'] == 'open' for r in w['rounds']))
    row = next(r for r in week['rounds'] if r['status'] == 'open')
    checks = {}
    checks['four_round_schedule'] = len(week['rounds']) == 4
    checks['symbols_and_private_paths_absent'] = not any(value in json.dumps(week) for value in ('universe.enc', 'source.enc', 'weekly_key_b64', 'BTCUSDT'))
    parts = {}
    for kind, meta in row['dataset']['files'].items():
        response = requests.get(meta['url'], timeout=90)
        response.raise_for_status()
        parts[kind] = pd.read_parquet(io.BytesIO(response.content))
        checks[f'{kind}_hash'] = storage.sha256_df(parts[kind]) == meta['hash']
    checks['live_target_absent'] = 'target' not in parts['live']
    features = [c for c in parts['train'] if c.startswith('feature_')]
    candidates = []
    for leaves in (7, 15):
        model = HistGradientBoostingRegressor(loss='absolute_error', max_iter=100, max_leaf_nodes=leaves,
            learning_rate=.05, random_state=20261026)
        model.fit(parts['train'][features], parts['train'].target)
        error = mean_absolute_error(parts['validation'].target, model.predict(parts['validation'][features]))
        candidates.append((float(error), leaves, model))
    best_error, leaves, model = min(candidates, key=lambda x: x[0])
    zero_error = float(np.abs(parts['validation'].target).mean())
    use_zero = zero_error <= best_error
    prediction = np.zeros(len(parts['live'])) if use_zero else model.predict(parts['live'][features])
    csv = pd.DataFrame({'id': parts['live'].id, 'prediction': np.clip(prediction, -1, 10)}).to_csv(index=False).encode()
    email, password = 'returns-technical@quantbattle.example', secrets.token_urlsafe(32)
    user = next((u for u in sb.auth.admin.list_users(page=1, per_page=1000) if u.email == email), None)
    if user is None:
        user = sb.auth.admin.create_user({'email': email, 'password': password, 'email_confirm': True,
            'user_metadata': {'username': 'ql_return_technical', 'display_name': 'Cuenta técnica · torneos de retornos', 'is_technical': True}}).user
    else:
        sb.auth.admin.update_user_by_id(user.id, {'password': password})
    session = create_client(url, public_key).auth.sign_in_with_password({'email': email, 'password': password}).session
    metadata = {'model_name': 'Referencia técnica cero' if use_zero else 'HistGradientBoosting técnico',
        'parameters': {} if use_zero else {'loss': 'absolute_error', 'max_iter': 100, 'max_leaf_nodes': leaves, 'learning_rate': .05},
        'seed': 20261026, 'note': 'Cuenta técnica de verificación. Selección con validation; no representa adopción externa ni score futuro.'}
    headers = {'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'text/csv',
               'X-QuantBattle-Experiment': base64.b64encode(p.canonical(metadata)).decode()}
    endpoint = f'{worker}/ml/return-rounds/{row["id"]}'
    response = requests.post(endpoint + '/predictions', headers=headers, data=csv, timeout=90)
    response.raise_for_status()
    receipt = response.json()['submission']
    checks['valid_submission'] = receipt['is_selected'] and receipt['file_sha256'] == p.digest(csv)
    bad = csv.replace(parts['live'].id.iloc[0].encode(), b'unknown-row')
    invalid = requests.post(endpoint + '/predictions', headers=headers, data=bad, timeout=90)
    checks['invalid_csv_rejected'] = invalid.status_code == 422
    mine = requests.get(endpoint + '/mine', headers=headers, timeout=90)
    mine.raise_for_status()
    checks['invalid_did_not_replace'] = next(s['id'] for s in mine.json()['attempts'] if s['is_selected']) == receipt['id']
    replacement = requests.post(endpoint + '/predictions', headers=headers, data=csv, timeout=90)
    replacement.raise_for_status()
    selected = replacement.json()['submission']
    checks['replacement_selected'] = selected['id'] != receipt['id'] and selected['is_selected']
    final_mine = requests.get(endpoint + '/mine', headers=headers, timeout=90)
    final_mine.raise_for_status()
    checks['scores_absent_from_receipt'] = all('score' not in s and 'mae' not in s for s in final_mine.json()['attempts'])
    checks['results_embargo'] = requests.get(f'{worker}/ml/return-tournaments/{week["id"]}/results', timeout=90).status_code == 409
    checks['anonymous_submission_denied'] = requests.post(endpoint + '/predictions', data=csv, headers={'Content-Type': 'text/csv'}, timeout=90).status_code == 401
    for table in ('ml_return_weeks', 'ml_return_rounds', 'ml_return_submissions'):
        result = requests.get(f'{url}/rest/v1/{table}?select=*', headers={'apikey': public_key, 'Authorization': 'Bearer ' + session.access_token}, timeout=60)
        checks[f'{table}_direct_read_denied'] = result.status_code in (401, 403)
    private = sb.table('ml_return_rounds').select('*').eq('id', row['id']).execute().data[0]
    cipher_url = f'{url}/storage/v1/object/public/{storage.TARGETS_BUCKET}/{private["source_path"]}'
    checks['raw_source_not_public'] = requests.get(cipher_url, timeout=60).status_code in (400, 401, 403, 404)
    # Operator-only audit; never enters model selection or the public dataset.
    source = engine.document(private['source_path'], private['source_hash'], p.week_key(week['id']))
    bars = {s: pd.DataFrame(rows).set_index('day') for s, rows in source['bars'].items()}
    current = parts['live'].set_index('id')
    prior, prior_info = p.public_parts(bars, date.fromisoformat(source['observation_day']), b'prior-key-attack-probe-only'.ljust(32, b'!'))
    old = prior['live'].set_index('id')
    prior_by_symbol = {x['symbol']: x['id'] for x in prior_info['live_map']}
    live_by_id = {x['id']: x['symbol'] for x in source['live_map']}
    old_vectors = old[features].to_numpy()
    old_ids = list(old.index)
    guessed = []
    for identity, vector in current[features].iterrows():
        index = int(np.square(old_vectors - vector.to_numpy()).sum(axis=1).argmin())
        guessed.append(old_ids[index] == prior_by_symbol[live_by_id[identity]])
    # Verify one daily observation against independently requested 24 hourly bars.
    symbol = source['live_map'][0]['symbol']
    observation = date.fromisoformat(source['observation_day'])
    start = int(p.local_midnight(observation).timestamp() * 1000)
    end = start + 86400000
    hourly = requests.get(engine.SOURCE, params={'symbol': symbol, 'interval': '1h', 'startTime': start, 'endTime': end - 1, 'limit': 24}, timeout=60)
    hourly.raise_for_status()
    hours = hourly.json()
    daily = bars[symbol].loc[str(observation)]
    checks['daily_matches_24_hourly_bars'] = len(hours) == 24 and all(np.isclose(a, b, rtol=1e-7) for a, b in (
        (float(hours[0][1]), daily.open), (float(hours[-1][4]), daily.close),
        (max(float(x[2]) for x in hours), daily.high), (min(float(x[3]) for x in hours), daily.low),
        (sum(float(x[5]) for x in hours), daily.volume)))
    report = {'verified_at': datetime.now(timezone.utc).isoformat(), 'week_id': week['id'], 'round_id': row['id'],
        'observation_day': row['observation_day'], 'target_day': row['target_day'], 'version': row['version'],
        'row_counts': {k: len(v) for k, v in parts.items()}, 'checks': checks,
        'reference_model': {'selected': metadata['model_name'], 'validation_mae_model': best_error,
                            'validation_mae_zero': zero_error, 'seed': 20261026, 'future_score': None},
        'privacy_probe': {'attack': 'nearest vectors using a different known transform on the same candidate universe',
                          'top1_accuracy': float(np.mean(guessed)), 'chance': 1 / len(guessed),
                          'limitation': 'Limited attack, not proof of anonymity; price sources and round dates are public.'},
        'technical_account': True, 'external_participants_in_this_check': 0, 'emails_sent': 0,
        'receipt_id': selected['id'], 'file_sha256': selected['file_sha256']}
    out = ROOT / 'artifacts/weekly-return-launch'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'production-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'predictions.csv').write_bytes(csv)
    # Ignored and never printed; only used for the final browser check.
    (ROOT / 'worker/.return-pilot-session.json').write_text(json.dumps(session.model_dump(), default=str), encoding='utf-8')
    if not all(checks.values()):
        raise RuntimeError('A production launch check failed; inspect the safe report')
    print(json.dumps({'checks_passed': len(checks), 'week_id': week['id'], 'version': row['version'], 'future_score': None}))


if __name__ == '__main__':
    main()
