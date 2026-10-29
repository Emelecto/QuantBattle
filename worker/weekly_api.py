"""Public contract for daily-return tournaments, with week-wide result embargo."""
from __future__ import annotations

import hashlib
import copy
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from auth import require_user
import ml_research
import ml_storage as storage
import weekly_protocol as p
from weekly_engine import all_rows, parse_time

router = APIRouter(prefix='/ml', tags=['weekly-return-tournaments'])
log = logging.getLogger(__name__)


def database():
    from tournaments import get_supabase
    return get_supabase()


def lookup(table: str, identity: str):
    try:
        uuid.UUID(identity)
    except ValueError as exc:
        raise HTTPException(404, 'No encontrado') from exc
    result = database().table(table).select('*').eq('id', identity).execute().data
    if not result:
        raise HTTPException(404, 'No encontrado')
    return result[0]


def is_released(week: dict, rounds: list[dict], now: datetime) -> bool:
    return (week['status'] in ('published', 'incomplete') and now >= parse_time(week['release_at'])
            and len(rounds) == 4 and all(r['status'] in ('settled', 'missed')
                and now >= parse_time(r['target_end']) for r in rounds))


def public_round(row: dict, released: bool, now: datetime) -> dict:
    result = {name: row.get(name) for name in ('id', 'ordinal', 'observation_day', 'submission_day',
        'target_day', 'opens_at', 'closes_at', 'target_start', 'target_end', 'published_at', 'version')}
    if row['status'] == 'missed' or (not row.get('version') and now >= parse_time(row['closes_at'])):
        state = 'missed'
    elif row.get('version') and row['status'] in ('ready', 'settled'):
        state = 'open' if parse_time(row['opens_at']) <= now < parse_time(row['closes_at']) else 'closed'
        if released:
            state = 'published'
    else:
        state = 'preparing' if now >= parse_time(row['opens_at']) else 'scheduled'
    result['status'] = state
    # Only the public matrix is downloadable. Internal paths/keys never leave here.
    result['dataset'] = copy.deepcopy(row.get('manifest')) if row.get('version') else None
    if result['dataset']:
        for file in result['dataset']['files'].values():
            file['url'] = storage.public_url(file['path'])
    return result


def public_week(week: dict, rounds: list[dict], now: datetime) -> dict:
    released = is_released(week, rounds, now)
    result = {name: week[name] for name in ('id', 'name', 'week_start', 'timezone', 'protocol', 'asset_count', 'release_at')}
    result.update(status=week['status'] if released else 'open', results_released=released,
                  rounds=[public_round(r, released, now) for r in sorted(rounds, key=lambda x: x['ordinal'])])
    result['rules'] = {'required_rounds': 4, 'timezone': str(p.TZ), 'opening_time': '00:30',
        'submission_cutoff': '23:59:59', 'prediction_unit': 'fractional_return',
        'min_prediction': -1, 'max_prediction': 10, 'normalizer_floor': p.NORMALIZER_FLOOR,
        'training_target_step': p.LABEL_STEP, 'public_information_allowed': True,
        'formula': '(MAE_zero - MAE_model) / max(MAE_zero, 0.005)',
        'overall': 'Media de las cuatro puntuaciones; requieren cuatro envíos válidos',
        'privacy': 'Variables ofuscadas; no se garantiza anonimato criptográfico ni se verifica el uso de ML solo con el CSV.'}
    if released:
        result.update(results_url=storage.public_url(week['result_path']), results_sha256=week['result_hash'])
    return result


def safe_receipt(row: dict, released: bool) -> dict:
    result = {name: row.get(name) for name in ('id', 'round_id', 'file_sha256', 'dataset_version',
        'row_count', 'submitted_at', 'is_selected', 'experiment')}
    result['status'] = row['status'] if released else 'validated'
    if released:
        result.update({name: row.get(name) for name in ('score', 'mae', 'baseline_mae')})
    return result


@router.get('/return-tournaments')
def list_weeks():
    sb = database()
    weeks = sb.table('ml_return_weeks').select('*').order('week_start', desc=True).limit(20).execute().data or []
    now = datetime.now(timezone.utc)
    return {'tournaments': [public_week(w, all_rows(sb, 'ml_return_rounds', week_id=w['id']), now) for w in weeks]}


@router.get('/return-submissions/mine')
def recent_submissions(request: Request):
    uid = require_user(request)
    sb = database()
    rows = sb.table('ml_return_submissions').select('*').eq('user_id', uid).eq('is_selected', True).order('submitted_at', desc=True).limit(20).execute().data or []
    weeks = {}
    entries = []
    for sub in rows:
        row = lookup('ml_return_rounds', sub['round_id'])
        if row['week_id'] not in weeks:
            week = lookup('ml_return_weeks', row['week_id'])
            rounds = all_rows(sb, 'ml_return_rounds', week_id=week['id'])
            weeks[week['id']] = (week, is_released(week, rounds, datetime.now(timezone.utc)))
        week, released = weeks[row['week_id']]
        entries.append({**safe_receipt(sub, released), 'week_id': week['id'], 'week_name': week['name'],
                        'ordinal': row['ordinal'], 'target_day': row['target_day']})
    return {'entries': entries}


@router.get('/return-tournaments/{week_id}')
def week_detail(week_id: str):
    week = lookup('ml_return_weeks', week_id)
    return public_week(week, all_rows(database(), 'ml_return_rounds', week_id=week_id), datetime.now(timezone.utc))


@router.get('/return-rounds/{round_id}/rows')
def live_rows(round_id: str):
    row = lookup('ml_return_rounds', round_id)
    if not row.get('version') or row['status'] not in ('ready', 'settled'):
        raise HTTPException(404, 'Dataset aún no publicado')
    meta = row['manifest']['files']['live']
    frame = storage.download_parquet(meta['path'])
    if storage.sha256_df(frame) != meta['hash'] or 'target' in frame.columns:
        raise HTTPException(503, 'No se pudo verificar el archivo publicado')
    return {'round_id': round_id, 'version': row['version'], 'ids': frame['id'].astype(str).tolist()}


@router.get('/return-rounds/{round_id}/download/{kind}')
def download(round_id: str, kind: str):
    row = lookup('ml_return_rounds', round_id)
    if kind not in ('train', 'validation', 'live') or not row.get('version') or row['status'] not in ('ready', 'settled'):
        raise HTTPException(404, 'Archivo aún no publicado')
    return {'url': storage.public_url(row['manifest']['files'][kind]['path']), 'version': row['version']}


@router.get('/return-rounds/{round_id}/mine')
def mine(round_id: str, request: Request):
    uid = require_user(request)
    row = lookup('ml_return_rounds', round_id)
    week = lookup('ml_return_weeks', row['week_id'])
    rounds = all_rows(database(), 'ml_return_rounds', week_id=week['id'])
    subs = database().table('ml_return_submissions').select('*').eq('round_id', round_id).eq('user_id', uid).order('submitted_at', desc=True).limit(50).execute().data or []
    released = is_released(week, rounds, datetime.now(timezone.utc))
    return {'attempts': [safe_receipt(s, released) for s in subs]}


@router.post('/return-rounds/{round_id}/predictions')
async def submit(round_id: str, request: Request):
    uid = require_user(request)
    row = lookup('ml_return_rounds', round_id)
    now = datetime.now(timezone.utc)
    if row['status'] != 'ready' or not parse_time(row['opens_at']) <= now < parse_time(row['closes_at']):
        raise HTTPException(409, 'La ronda no está abierta a envíos')
    try:
        declared = int(request.headers.get('content-length', '0'))
    except ValueError:
        raise HTTPException(400, 'Tamaño de archivo inválido')
    if declared > p.MAX_BYTES:
        raise HTTPException(413, 'El CSV supera 10 MB')
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > p.MAX_BYTES:
            raise HTTPException(413, 'El CSV supera 10 MB')
    experiment = ml_research.parse_experiment_header(
        request.headers.get('x-quantbattle-experiment') or request.headers.get('x-quantlab-experiment')
    )
    if experiment is None:
        raise HTTPException(422, 'Registra la ficha del modelo en X-QuantBattle-Experiment antes de enviar')
    index = live_rows(round_id)
    try:
        checked = p.validate_csv(bytes(content), index['ids'])
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    sb = database()
    tries = sb.table('ml_return_submissions').select('id').eq('round_id', round_id).eq('user_id', uid).limit(50).execute().data or []
    if len(tries) >= 50:
        raise HTTPException(429, 'Se alcanzó el máximo de 50 intentos por ronda')
    identity = str(uuid.uuid4())
    path = f'{uid}/daily-returns/{round_id}/{identity}.csv'
    raw = bytes(content)
    storage.upload_csv(raw, path)
    payload = {'id': identity, 'round_id': round_id, 'user_id': uid, 'file_path': path,
        'file_sha256': hashlib.sha256(raw).hexdigest(), 'dataset_version': row['version'],
        'row_count': len(checked), 'experiment': experiment, 'status': 'validated', 'is_selected': False}
    sb.table('ml_return_submissions').insert(payload).execute()
    try:
        activated = sb.rpc('activate_return_submission', {'p_submission': identity}).execute()
        if activated.data is not True:
            raise ValueError('No se confirmó la selección del envío')
    except Exception as exc:
        # The DB checks the deadline again under a row lock. Do not claim success.
        if datetime.now(timezone.utc) >= parse_time(row['closes_at']):
            raise HTTPException(409, 'La ronda cerró durante la carga; el archivo no fue seleccionado') from exc
        ref = uuid.uuid4().hex[:8]
        log.exception('Could not activate daily return submission [ref=%s]', ref)
        raise HTTPException(503, f'No se confirmó el envío (ref {ref}). Consulta el comprobante antes de reintentar.') from exc
    stored = sb.table('ml_return_submissions').select('*').eq('id', identity).execute().data[0]
    return {'submission': safe_receipt(stored, False)}


@router.get('/return-tournaments/{week_id}/results')
def results(week_id: str):
    week = lookup('ml_return_weeks', week_id)
    sb = database()
    rounds = all_rows(sb, 'ml_return_rounds', week_id=week_id)
    if not is_released(week, rounds, datetime.now(timezone.utc)):
        raise HTTPException(409, 'Los resultados, activos y precios se publican al cerrar todo el torneo')
    payload = storage.download_bytes(week['result_path'], private=False, expected_sha256=week['result_hash'])
    evidence = json.loads(payload)
    by_user = {}
    for row in rounds:
        for sub in all_rows(sb, 'ml_return_submissions', round_id=row['id'], is_selected=True, status='scored'):
            entry = by_user.setdefault(sub['user_id'], {'user_id': sub['user_id'], 'rounds': []})
            entry['rounds'].append({'ordinal': row['ordinal'], 'score': sub['score'], 'mae': sub['mae'], 'baseline_mae': sub['baseline_mae']})
    for entry in by_user.values():
        entry['eligible'] = len(entry['rounds']) == 4 and week['status'] == 'published'
        entry['score'] = sum(r['score'] for r in entry['rounds']) / 4 if entry['eligible'] else None
        entry['mean_mae'] = sum(r['mae'] for r in entry['rounds']) / 4 if entry['eligible'] else None
        entry['rounds'].sort(key=lambda x: x['ordinal'])
    profiles = sb.table('profiles').select('id,username').in_('id', list(by_user)).execute().data if by_user else []
    names = {x['id']: x.get('username') for x in profiles or []}
    entries = list(by_user.values())
    entries.sort(key=lambda x: (not x['eligible'], -(x['score'] or 0), x['mean_mae'] or 0, x['user_id']))
    rank = 0
    previous = None
    for index, entry in enumerate(entries):
        if entry['eligible']:
            criteria = (entry['score'], entry['mean_mae'])
            if criteria != previous:
                rank = index + 1
            entry['rank'] = rank
            previous = criteria
        else:
            entry['rank'] = None
        entry['username'] = names.get(entry['user_id'])
    return {'evidence': evidence, 'leaderboard': entries, 'results_sha256': week['result_hash']}
