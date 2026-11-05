"""Authenticated stock CSV delivery/submission. Generation stays off Render."""
import json
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request

from auth import require_user
from stocks_daily.protocol import MAX_BYTES, PROTOCOL, digest, instant, predictions
from stocks_daily.tournament import Repository

router = APIRouter(prefix='/ml', tags=['stock-return-tournaments'])


def lookup(repo, identity):
    if len(identity) > 40 or not identity.startswith('stocks-oc-'):
        raise HTTPException(404, 'Ronda no encontrada')
    rows = repo.rows('stock_return_rounds', id=identity)
    if not rows:
        raise HTTPException(404, 'Ronda no encontrada')
    return rows[0]


def public_round(row):
    result = {k: row.get(k) for k in ['id', 'target_date', 'observation_date', 'deadline',
              'target_open', 'target_close', 'published_at', 'settled_at', 'manifest_hash']}
    result['status'] = 'settled' if row['status'] == 'settled' else 'open' if datetime.now(timezone.utc) < instant(row['deadline']) else 'closed'
    result.update(protocol=PROTOCOL, rows=len(row['assets']), prediction_unit='fractional_open_to_close_return',
                  scoring='(MAE_zero - MAE_model) / max(MAE_zero, 0.005)',
                  files=['live.csv', 'live.parquet', 'submission_template.csv', 'manifest.json', 'README.md', 'quality_report.json'])
    return result


def receipt(row, released):
    result = {k: row.get(k) for k in ['id', 'round_id', 'file_sha256', 'manifest_hash', 'row_count', 'submitted_at', 'is_selected']}
    result['status'] = row['status'] if released else 'validated'
    if released:
        result.update({k: row.get(k) for k in ['score', 'mae', 'baseline_mae']})
    return result


@router.get('/stock-rounds')
def rounds(request: Request):
    require_user(request)
    repo = Repository()
    rows = repo.request('GET', 'stock_return_rounds', params={'select': '*', 'order': 'target_date.desc', 'limit': 30})
    return {'rounds': [public_round(row) for row in rows]}


@router.get('/stock-rounds/{round_id}/download/{filename}')
def download(round_id: str, filename: str, request: Request):
    require_user(request)
    repo = Repository()
    row = lookup(repo, round_id)
    if filename not in public_round(row)['files']:
        raise HTTPException(404, 'Archivo no encontrado')
    path = row['manifest_path'].rsplit('/', 1)[0] + '/' + filename
    response = repo.storage.request('POST', '/storage/v1/object/sign/' + quote(repo.storage.bucket, safe='') + '/' + quote(path, safe='/'),
                                    json={'expiresIn': 300}, timeout=30)
    if response.status_code != 200:
        raise HTTPException(503, 'No se pudo preparar la descarga')
    url = response.json()['signedURL']
    return {'url': repo.storage.base + '/storage/v1' + url, 'expires_in': 300,
            'sha256': row['manifest_hash'] if filename == 'manifest.json' else row['manifest']['files'][filename]['sha256']}


@router.get('/stock-rounds/{round_id}/mine')
def mine(round_id: str, request: Request):
    uid = require_user(request)
    repo = Repository()
    row = lookup(repo, round_id)
    return {'attempts': [receipt(s, row['status'] == 'settled') for s in repo.rows('stock_return_submissions', round_id=round_id, user_id=uid)]}


@router.post('/stock-rounds/{round_id}/predictions')
async def submit(round_id: str, request: Request):
    uid = require_user(request)
    repo = Repository()
    row = lookup(repo, round_id)
    if row['status'] != 'open' or datetime.now(timezone.utc) >= instant(row['deadline']):
        raise HTTPException(409, 'La ronda ya cerró')
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_BYTES:
            raise HTTPException(413, 'CSV mayor de 1 MB')
    raw = bytes(content)
    try:
        values = predictions(raw, [a['id'] for a in row['assets']])
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    identity = str(uuid.uuid4())
    path = f'submissions/{uid}/{round_id}/{identity}.csv'
    repo.storage.put(path, raw, content_type='text/csv')
    payload = {'id': identity, 'round_id': round_id, 'user_id': uid, 'file_path': path,
               'file_sha256': digest(raw), 'manifest_hash': row['manifest_hash'], 'row_count': len(values)}
    try:
        selected = repo.request('POST', 'rpc/submit_stock_prediction', json={'p_submission': payload})
    except RuntimeError as exc:
        if datetime.now(timezone.utc) >= instant(row['deadline']):
            raise HTTPException(409, 'La ronda cerró durante la carga; no se seleccionó el CSV') from exc
        raise HTTPException(503, 'No se confirmó el envío. Consulta tu comprobante antes de reintentar.') from exc
    return {'submission': receipt(selected, False)}


@router.get('/stock-rounds/{round_id}/results')
def results(round_id: str, request: Request):
    require_user(request)
    repo = Repository()
    row = lookup(repo, round_id)
    if row['status'] != 'settled':
        raise HTTPException(409, 'Resultados pendientes de cierre y verificación')
    raw = repo.storage.get(row['result_path'])
    if digest(raw) != row['result_hash']:
        raise HTTPException(503, 'No se pudo verificar el resultado')
    subs = repo.rows('stock_return_submissions', round_id=round_id, is_selected=True)
    if any(s['status'] != 'scored' for s in subs):
        raise HTTPException(503, 'Evaluación incompleta')
    subs.sort(key=lambda s: (-s['score'], s['mae'], s['user_id']))
    entries = []
    previous, rank = None, 0
    for index, sub in enumerate(subs):
        key = (sub['score'], sub['mae'])
        if key != previous:
            rank = index + 1
        entries.append({'user_id': sub['user_id'], 'rank': rank, **{k: sub[k] for k in ['score', 'mae', 'baseline_mae']}})
        previous = key
    return {'round_id': round_id, 'leaderboard': entries, 'evidence': json.loads(raw), 'sha256': row['result_hash']}
