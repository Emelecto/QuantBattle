"""Learning tasks, immutable ML projects and moderated notebook publications.

Never executes user code. Public library contains explicitly reviewed snapshots,
not private submissions or live targets. Historical trading tables are untouched.
"""
from __future__ import annotations

import hashlib
import json
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth import require_user
import ml_storage as storage

class BoundedJSONRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def bounded(request: Request):
            if request.method in ('POST', 'PATCH', 'PUT'):
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 2_200_000:
                        raise HTTPException(413, 'La solicitud supera el límite de 2.2 MB')
                request._body = bytes(body)
            return await handler(request)
        return bounded


router = APIRouter(prefix='/ml', tags=['ml-learning-projects'], route_class=BoundedJSONRoute)
Protocol = Literal['daily_return_mae_v1', 'spearman_era_v1']


def database():
    from tournaments import get_supabase
    return get_supabase()


def now():
    return datetime.now(timezone.utc).isoformat()


def rows(table, **filters):
    query = database().table(table).select('*')
    for key, value in filters.items():
        query = query.eq(key, value)
    return query


def owned(table, identity, uid, owner='user_id'):
    found = rows(table, id=str(identity), **{owner: uid}).execute().data
    if not found:
        raise HTTPException(404, 'Registro no encontrado en tu cuenta')
    return found[0]


class Body(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ProjectBody(Body):
    title: str = Field(min_length=1, max_length=120)
    hypothesis: str = Field(default='', max_length=3000)
    protocol: Protocol


class VersionBody(Body):
    model_name: str = Field(min_length=1, max_length=100)
    parameters: dict[str, Any] = Field(default_factory=dict)
    seed: int | None = Field(default=None, ge=0, le=4294967295)
    note: str = Field(default='', max_length=1000)
    dataset_version: str = Field(default='', max_length=160)
    validation_mae: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    validation_spearman: float | None = Field(default=None, ge=-1, le=1, allow_inf_nan=False)
    dependencies: str = Field(default='', max_length=5000)
    notebook: dict[str, Any] | None = None

    @field_validator('parameters')
    @classmethod
    def parameter_size(cls, value):
        try:
            if len(json.dumps(value, allow_nan=False).encode()) > 2048:
                raise ValueError()
        except (ValueError, TypeError, RecursionError):
            raise ValueError('Los parámetros deben ser JSON finito de hasta 2 KB') from None
        return value


def clean_notebook(value: dict) -> tuple[bytes, str]:
    """Remove outputs, attachments, execution metadata and non-code/markdown cells.

    Source remains untrusted and is delivered as an attachment, never HTML.
    """
    try:
        if len(json.dumps(value, allow_nan=False).encode()) > 2_000_000:
            raise ValueError('El notebook supera 2 MB')
        if value.get('nbformat') != 4 or not isinstance(value.get('cells'), list) or not 1 <= len(value['cells']) <= 300:
            raise ValueError('Usa un notebook Jupyter v4 de 1 a 300 celdas')
        cells = []
        for cell in value['cells']:
            if cell.get('cell_type') not in ('code', 'markdown', 'raw'):
                raise ValueError('Tipo de celda inválido')
            source = cell.get('source', '')
            if isinstance(source, list) and all(isinstance(s, str) for s in source):
                source = ''.join(source)
            if not isinstance(source, str):
                raise ValueError('Contenido de celda inválido')
            cleaned = {'id': f'cell-{len(cells)}', 'cell_type': cell['cell_type'], 'metadata': {}, 'source': source}
            if cell['cell_type'] == 'code':
                cleaned.update(outputs=[], execution_count=None)
            cells.append(cleaned)
        document = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {
            'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}}, 'cells': cells}
        payload = json.dumps(document, ensure_ascii=False, allow_nan=False).encode()
        return payload, hashlib.sha256(payload).hexdigest()
    except (TypeError, KeyError, AttributeError, RecursionError) as exc:
        raise ValueError('Notebook inválido') from exc


def safe_version(row):
    return {k: row.get(k) for k in ('id', 'project_id', 'snapshot', 'notebook_sha256', 'created_at')}


@router.get('/projects')
def projects(request: Request, offset: int = Query(0, ge=0, le=10000)):
    uid = require_user(request)
    found = rows('ml_research_projects', user_id=uid).order('updated_at', desc=True).range(offset, offset + 20).execute().data or []
    return {'entries': found[:20], 'has_more': len(found) > 20}


@router.post('/projects', status_code=201)
def create_project(body: ProjectBody, request: Request):
    uid = require_user(request)
    record = {'id': str(uuid.uuid4()), 'user_id': uid, **body.model_dump(), 'created_at': now(), 'updated_at': now()}
    database().table('ml_research_projects').insert(record).execute()
    return record


@router.get('/projects/{project_id}')
def project_detail(project_id: uuid.UUID, request: Request):
    uid = require_user(request)
    project = owned('ml_research_projects', project_id, uid)
    versions = rows('ml_project_versions', project_id=str(project_id), user_id=uid).order('created_at', desc=True).limit(100).execute().data or []
    links = rows('ml_project_submissions', project_id=str(project_id), user_id=uid).order('created_at', desc=True).limit(100).execute().data or []
    return {'project': project, 'versions': [safe_version(v) for v in versions], 'submissions': links}


@router.patch('/projects/{project_id}')
def update_project(project_id: uuid.UUID, body: ProjectBody, request: Request):
    uid = require_user(request)
    previous = owned('ml_research_projects', project_id, uid)
    if body.protocol != previous['protocol']:
        raise HTTPException(409, 'Crea otro proyecto para cambiar de protocolo')
    database().table('ml_research_projects').update({**body.model_dump(), 'updated_at': now()}).eq('id', str(project_id)).eq('user_id', uid).execute()
    return {'saved': True}


@router.post('/projects/{project_id}/versions', status_code=201)
def add_version(project_id: uuid.UUID, body: VersionBody, request: Request):
    uid = require_user(request)
    project = owned('ml_research_projects', project_id, uid)
    if project['protocol'] != 'daily_return_mae_v1' and body.validation_mae is not None:
        raise HTTPException(422, 'MAE solo corresponde al protocolo de retornos; no mezcles métricas')
    if project['protocol'] != 'spearman_era_v1' and body.validation_spearman is not None:
        raise HTTPException(422, 'Spearman corresponde a la práctica sintética; no mezcles métricas')
    identity = str(uuid.uuid4())
    path, digest = None, None
    if body.notebook is not None:
        try:
            payload, digest = clean_notebook(body.notebook)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        path = f'ml-projects/{uid}/{project_id}/{identity}.ipynb'
        storage.upload_bytes(payload, path, private=True, content_type='application/x-ipynb+json')
    snapshot = {**body.model_dump(exclude={'notebook'}), 'protocol': project['protocol'], 'hypothesis': project['hypothesis']}
    version = {'id': identity, 'project_id': str(project_id), 'user_id': uid, 'snapshot': snapshot,
               'notebook_path': path, 'notebook_sha256': digest, 'created_at': now()}
    database().table('ml_project_versions').insert(version).execute()
    database().table('ml_research_projects').update({'updated_at': now()}).eq('id', str(project_id)).eq('user_id', uid).execute()
    return safe_version(version)


def notebook_response(path, digest):
    payload = storage.download_bytes(path, private=True, expected_sha256=digest)
    return Response(payload, media_type='application/x-ipynb+json', headers={
        'Content-Disposition': 'attachment; filename="quantbattle-metodo.ipynb"', 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'})


@router.get('/projects/{project_id}/versions/{version_id}/notebook')
def version_notebook(project_id: uuid.UUID, version_id: uuid.UUID, request: Request):
    uid = require_user(request)
    owned('ml_research_projects', project_id, uid)
    version = owned('ml_project_versions', version_id, uid)
    if version['project_id'] != str(project_id) or not version.get('notebook_path'):
        raise HTTPException(404, 'Versión sin notebook')
    return notebook_response(version['notebook_path'], version['notebook_sha256'])


class LinkBody(Body):
    version_id: uuid.UUID
    submission_id: uuid.UUID


@router.post('/projects/{project_id}/submissions')
def link_submission(project_id: uuid.UUID, body: LinkBody, request: Request):
    uid = require_user(request)
    project = owned('ml_research_projects', project_id, uid)
    version = owned('ml_project_versions', body.version_id, uid)
    if version['project_id'] != str(project_id):
        raise HTTPException(404, 'Versión ajena al proyecto')
    table = 'ml_return_submissions' if project['protocol'] == 'daily_return_mae_v1' else 'prediction_submissions'
    submission = owned(table, body.submission_id, uid)
    if project['protocol'] == 'spearman_era_v1':
        datasets = rows('ml_datasets', id=submission['dataset_id']).execute().data or []
        if not datasets or datasets[0].get('score_version') != project['protocol']:
            raise HTTPException(409, 'El protocolo del comprobante no corresponde al proyecto')
    declared = version['snapshot'].get('dataset_version')
    if declared and declared != submission.get('dataset_version'):
        raise HTTPException(409, 'La versión del dataset no coincide con el comprobante')
    if rows('ml_project_submissions', user_id=uid, protocol=project['protocol'], submission_id=str(body.submission_id)).execute().data:
        raise HTTPException(409, 'Ese comprobante ya está vinculado a un proyecto')
    record = {'id': str(uuid.uuid4()), 'project_id': str(project_id), 'version_id': str(body.version_id),
              'user_id': uid, 'protocol': project['protocol'], 'submission_id': str(body.submission_id), 'created_at': now()}
    database().table('ml_project_submissions').insert(record).execute()
    return record


class PublishBody(Body):
    version_id: uuid.UUID
    description: str = Field(min_length=30, max_length=4000)
    limitations: str = Field(min_length=20, max_length=2000)
    license: Literal['MIT', 'BSD-3-Clause', 'Apache-2.0', 'CC0-1.0']


def public_publication(row):
    # Explicit allowlist: even reviewed artifacts never expose private paths or IDs of submissions.
    result = {k: row.get(k) for k in ('id', 'title', 'author_name', 'protocol', 'description', 'limitations', 'license',
        'snapshot', 'notebook_sha256', 'status', 'review_note', 'reviewed_at', 'created_at')}
    result['checks'] = {'notebook_format': True, 'environment_declared': bool(row['snapshot'].get('dependencies', '').strip()),
                        'content_reviewed': row['status'] == 'published', 'execution_verified': False}
    return result


@router.post('/projects/{project_id}/publish', status_code=201)
def publish(project_id: uuid.UUID, body: PublishBody, request: Request):
    uid = require_user(request)
    project = owned('ml_research_projects', project_id, uid)
    version = owned('ml_project_versions', body.version_id, uid)
    if version['project_id'] != str(project_id) or not version.get('notebook_path'):
        raise HTTPException(422, 'Adjunta un notebook a una versión de este proyecto')
    if not version['snapshot'].get('dependencies', '').strip():
        raise HTTPException(422, 'Declara el entorno y las versiones de dependencias antes de compartir')
    notebook = json.loads(storage.download_bytes(version['notebook_path'], private=True, expected_sha256=version['notebook_sha256']))
    if not any(c.get('cell_type') == 'code' and c.get('source', '').strip() for c in notebook['cells']):
        raise HTTPException(422, 'El notebook debe incluir al menos una celda de código')
    if rows('ml_research_publications', author_id=uid, version_id=str(body.version_id)).execute().data:
        raise HTTPException(409, 'Esta versión ya tiene una publicación; crea otra versión para volver a enviarla')
    # Publish only intentionally shared metadata; private notes/dataset references are excluded.
    snapshot = {k: version['snapshot'].get(k) for k in ('model_name', 'parameters', 'seed', 'dependencies', 'protocol', 'hypothesis')}
    profiles = rows('profiles', id=uid).execute().data or []
    author = (profiles[0].get('display_name') or profiles[0].get('username')) if profiles else None
    record = {'id': str(uuid.uuid4()), 'author_id': uid, 'author_name': author or 'Participante de QuantBattle', 'version_id': str(body.version_id), 'title': project['title'],
              **body.model_dump(exclude={'version_id'}), 'protocol': project['protocol'], 'snapshot': snapshot,
              'notebook_path': version['notebook_path'], 'notebook_sha256': version['notebook_sha256'],
              'status': 'pending_review', 'created_at': now()}
    database().table('ml_research_publications').insert(record).execute()
    return public_publication(record)


@router.get('/notebooks/mine')
def my_publications(request: Request):
    uid = require_user(request)
    return {'entries': [public_publication(p) for p in rows('ml_research_publications', author_id=uid).order('created_at', desc=True).limit(100).execute().data or []]}


@router.get('/notebooks')
def library(offset: int = Query(0, ge=0, le=10000)):
    found = rows('ml_research_publications', status='published').order('created_at', desc=True).range(offset, offset + 20).execute().data or []
    return {'entries': [public_publication(p) for p in found[:20]], 'has_more': len(found) > 20}


def visible_publication(identity, request):
    found = rows('ml_research_publications', id=str(identity)).execute().data or []
    if not found:
        raise HTTPException(404, 'Publicación no encontrada')
    pub = found[0]
    if pub['status'] != 'published':
        from admin import _get_admin_ids
        uid = require_user(request)
        if uid != pub['author_id'] and uid not in _get_admin_ids():
            raise HTTPException(404, 'Publicación no encontrada')
    return pub


@router.get('/notebooks/{publication_id}')
def publication_detail(publication_id: uuid.UUID, request: Request):
    pub = visible_publication(publication_id, request)
    try:
        uid = require_user(request)
    except HTTPException:
        uid = None
    from admin import _get_admin_ids
    return {**public_publication(pub), 'can_review': uid in _get_admin_ids(), 'can_withdraw': uid == pub['author_id']}


@router.delete('/notebooks/{publication_id}')
def withdraw(publication_id: uuid.UUID, request: Request):
    uid = require_user(request)
    owned('ml_research_publications', publication_id, uid, owner='author_id')
    database().table('ml_research_publications').update({'status': 'withdrawn'}).eq('id', str(publication_id)).eq('author_id', uid).execute()
    return {'status': 'withdrawn'}


@router.get('/notebooks/{publication_id}/download')
def publication_download(publication_id: uuid.UUID, request: Request):
    pub = visible_publication(publication_id, request)
    return notebook_response(pub['notebook_path'], pub['notebook_sha256'])


@router.post('/notebooks/{publication_id}/fork', status_code=201)
def fork(publication_id: uuid.UUID, request: Request):
    uid = require_user(request)
    pub = visible_publication(publication_id, request)
    if pub['status'] != 'published':
        raise HTTPException(409, 'Solo se pueden copiar publicaciones aprobadas')
    record = create_project(ProjectBody(title=('Copia · ' + pub['title'])[:120],
        hypothesis=pub['snapshot'].get('hypothesis', ''), protocol=pub['protocol']), request)
    database().table('ml_research_projects').update({'parent_publication_id': str(publication_id)}).eq('id', record['id']).eq('user_id', uid).execute()
    payload = storage.download_bytes(pub['notebook_path'], private=True, expected_sha256=pub['notebook_sha256'])
    data = {k: pub['snapshot'].get(k) for k in ('model_name', 'parameters', 'seed', 'dependencies')}
    data.update(note=f'Basado en publicación {publication_id}. Licencia {pub["license"]}.', notebook=json.loads(payload))
    add_version(uuid.UUID(record['id']), VersionBody(**data), request)
    return record


@router.get('/notebooks-review/queue')
def review_queue(request: Request):
    from admin import _require_admin
    _require_admin(request)
    return {'entries': [public_publication(p) for p in rows('ml_research_publications', status='pending_review').order('created_at').limit(100).execute().data or []]}


class ReviewBody(Body):
    status: Literal['published', 'rejected', 'withdrawn']
    note: str = Field(min_length=20, max_length=2000)


@router.post('/notebooks/{publication_id}/review')
def review(publication_id: uuid.UUID, body: ReviewBody, request: Request):
    from admin import _require_admin
    uid = _require_admin(request)
    pub = visible_publication(publication_id, request)
    # Re-check integrity before approving. "Reviewed" means manual content review, not execution.
    if body.status == 'published':
        storage.download_bytes(pub['notebook_path'], private=True, expected_sha256=pub['notebook_sha256'])
    database().table('ml_research_publications').update({'status': body.status, 'review_note': body.note,
        'reviewed_by': uid, 'reviewed_at': now()}).eq('id', str(publication_id)).execute()
    return {'status': body.status}


MISSIONS = [
    {'id': 'baseline', 'version': 1, 'title': 'Supera la referencia cero', 'kind': 'predictions',
     'prompt': 'Predice los 6 retornos sintéticos de validación. En train, target = 0.02 × feature. Decide con train; el score mide solo este ejercicio.',
     'train': [{'id': f't{i}', 'feature': x, 'target': .02*x} for i, x in enumerate([-2,-1,0,1,2])],
     'validation': [{'id': f'v{i}', 'feature': x} for i, x in enumerate([-1.5,-.5,.5,1.5,2.5,-2.5])],
     'lesson': '/app/academia/ml/3'},
    {'id': 'leakage', 'version': 1, 'title': 'Detecta la fuga de información', 'kind': 'choice',
     'prompt': 'Para predecir mañana con datos disponibles hoy, ¿qué columna introduce información futura?',
     'options': ['Volatilidad calculada hasta hoy', 'Retorno realizado de mañana', 'Media móvil de los últimos 20 días'],
     'lesson': '/app/academia/mates/7'},
    {'id': 'windows', 'version': 1, 'title': 'Compara dos ventanas temporales', 'kind': 'choice',
     'prompt': 'Debes elegir un modelo sin consultar live. A: MAE de validación 0.018 en una ventana y 0.061 en otra. B: 0.024 y 0.026. ¿Qué decisión evita seleccionar usando live y considera ambas ventanas?',
     'options': ['Elegir A por su mejor ventana aislada', 'Elegir B por menor MAE medio en las dos ventanas', 'Probar ambos en live y elegir con el resultado futuro'],
     'lesson': '/app/academia/python/7'},
]


@router.get('/learning/missions')
def missions():
    return {'missions': MISSIONS, 'synthetic': True}


@router.get('/learning/missions/{mission_id}/notebook')
def mission_notebook(mission_id: str):
    mission = next((m for m in MISSIONS if m['id'] == mission_id), None)
    if mission is None:
        raise HTTPException(404, 'Misión no encontrada')
    if mission_id == 'baseline':
        code = ('import pandas as pd\nfrom sklearn.linear_model import LinearRegression\n'
            f'train = pd.DataFrame({mission["train"]!r})\nvalidation = pd.DataFrame({mission["validation"]!r})\n'
            'model = LinearRegression().fit(train[["feature"]], train["target"])\n'
            'predictions = model.predict(validation[["feature"]])\n'
            'print(", ".join(str(round(float(x), 6)) for x in predictions))\n')
    elif mission_id == 'leakage':
        code = ('import pandas as pd\n'
            'returns = pd.Series([0.01, -0.02, 0.03, 0.0, -0.01, 0.02])\n'
            'features = pd.DataFrame({"mean_past": returns.rolling(3).mean(),\n'
            '                         "tomorrow_return": returns.shift(-1)})\n'
            'print(features)\n# ¿Qué columna no puedes conocer al enviar hoy?\n')
    else:
        code = ('import pandas as pd\n'
            'mae = pd.DataFrame({"A": [0.018, 0.061], "B": [0.024, 0.026]}, index=["window_1", "window_2"])\n'
            'print(mae)\nprint("MAE medio por modelo:", mae.mean())\n'
            '# Decide con estas ventanas; no uses live para seleccionar.\n')
    payload, _ = clean_notebook({'nbformat': 4, 'cells': [
        {'cell_type': 'markdown', 'source': f'# {mission["title"]}\n\nDatos sintéticos educativos · versión {mission["version"]}.\n\n{mission["prompt"]}\n\nEjecuta en tu entorno con Python, pandas y scikit-learn. No utiliza datos de un torneo real.'},
        {'cell_type': 'code', 'source': code}]})
    return Response(payload, media_type='application/x-ipynb+json', headers={
        'Content-Disposition': f'attachment; filename="quantbattle-mision-{mission_id}.ipynb"',
        'X-Content-Type-Options': 'nosniff'})


class AttemptBody(Body):
    choice: int | None = Field(default=None, ge=0, le=2)
    predictions: list[float] | None = Field(default=None, min_length=6, max_length=6)


def evaluate_mission(identity, body):
    if identity == 'baseline':
        if body.predictions is None or any(not math.isfinite(v) or abs(v)>10 for v in body.predictions):
            raise HTTPException(422, 'Envía seis retornos decimales finitos entre -10 y 10')
        actual = [-.03,-.01,.01,.03,.05,-.05]
        mae = sum(abs(a-b) for a,b in zip(actual, body.predictions))/6
        baseline = sum(abs(a) for a in actual)/6
        return {'passed': mae < baseline, 'mae': mae, 'baseline_mae': baseline,
            'explanation': 'La referencia cero tiene MAE 0.03 (3 puntos porcentuales). Este conjunto artificial contiene una relación exacta; no representa dificultad ni rendimiento de mercado.'}
    if identity in ('leakage', 'windows'):
        if body.choice is None:
            raise HTTPException(422, 'Selecciona una respuesta')
        explanation = ('El retorno de mañana todavía no existe al predecir. Incluirlo daría fuga de información.' if identity == 'leakage' else
            'B tiene MAE medio 0.025 frente a 0.0395 de A. La selección usa ambas ventanas de validation; live se reserva para evaluación futura.')
        return {'passed': body.choice == 1, 'explanation': explanation}
    raise HTTPException(404, 'Misión no encontrada')


@router.post('/learning/missions/{mission_id}/attempts')
def attempt(mission_id: str, body: AttemptBody, request: Request):
    uid = require_user(request)
    result = evaluate_mission(mission_id, body)
    database().table('ml_learning_attempts').insert({'user_id': uid, 'mission': mission_id,
        'definition_version': 1, 'answer': body.model_dump(), 'result': result}).execute()
    if result['passed']:
        database().table('ml_learning_completions').upsert({'user_id': uid, 'mission': mission_id,
            'definition_version': 1}, on_conflict='user_id,mission,definition_version').execute()
    return result


@router.get('/learning/progress')
def progress(request: Request):
    uid = require_user(request)
    attempts = rows('ml_learning_attempts', user_id=uid).order('created_at', desc=True).limit(200).execute().data or []
    checkpoints = rows('ml_learning_checkpoints', user_id=uid).execute().data or []
    completions = rows('ml_learning_completions', user_id=uid).execute().data or []
    real = bool(rows('ml_return_submissions', user_id=uid, is_selected=True).limit(1).execute().data)
    practice = bool(rows('prediction_submissions', user_id=uid, is_selected=True).limit(1).execute().data)
    return {'checkpoints': [p['step'] for p in checkpoints],
        'passed_missions': sorted({a['mission'] for a in completions if a['definition_version'] == 1}),
        'has_submission': real or practice, 'submission_source': 'server', 'attempts': attempts[:20]}


class CheckpointBody(Body):
    step: Literal['read_rules', 'environment', 'validation']


@router.post('/learning/checkpoints')
def checkpoint(body: CheckpointBody, request: Request):
    uid = require_user(request)
    database().table('ml_learning_checkpoints').upsert({'user_id': uid, 'step': body.step}, on_conflict='user_id,step').execute()
    return {'saved': True, 'source': 'self_reported'}


@router.get('/learning/error-lab/{round_id}')
def error_lab(round_id: uuid.UUID, request: Request):
    uid = require_user(request)
    import weekly_api as api
    from weekly_engine import all_rows
    import weekly_protocol as protocol
    row = api.lookup('ml_return_rounds', str(round_id))
    week = api.lookup('ml_return_weeks', row['week_id'])
    rounds = all_rows(api.database(), 'ml_return_rounds', week_id=week['id'])
    if not api.is_released(week, rounds, datetime.now(timezone.utc)):
        raise HTTPException(409, 'El laboratorio se habilita cuando se libera toda la semana')
    found = rows('ml_return_submissions', round_id=str(round_id), user_id=uid, is_selected=True, status='scored').execute().data or []
    if not found:
        raise HTTPException(404, 'No tienes un envío seleccionado y puntuado en esta ronda')
    submission = found[0]
    evidence = json.loads(storage.download_bytes(week['result_path'], private=False, expected_sha256=week['result_hash']))
    released_round = next((r for r in evidence['rounds'] if r['id'] == str(round_id)), None)
    if not released_round or not released_round.get('assets'):
        raise HTTPException(409, 'La ronda no dispone de precios verificados')
    assets = released_round['assets']
    content = storage.download_csv(submission['file_path'], expected_sha256=submission['file_sha256'])
    predictions = protocol.validate_csv(content, [a['id'] for a in assets])
    by_id = dict(zip(predictions.id, predictions.prediction))
    details = [{'id': a['id'], 'symbol': a['symbol'], 'actual': a['return'], 'prediction': float(by_id[a['id']]),
        'error': float(by_id[a['id']])-a['return'], 'absolute_error': abs(float(by_id[a['id']])-a['return'])} for a in assets]
    details.sort(key=lambda a: -a['absolute_error'])
    bias = sum(a['error'] for a in details)/len(details)
    measured = protocol.score(predictions, {a['id']: a['return'] for a in assets})
    return {'round_id': str(round_id), 'submission_id': submission['id'], 'dataset_version': submission['dataset_version'],
        'file_sha256': submission['file_sha256'], **measured, 'mean_signed_error': bias, 'assets': details,
        'exercises': [{'question': '¿Qué activo tiene uno de los mayores errores absolutos?',
             'answer': f'{details[0]["symbol"]}: {details[0]["absolute_error"] * 100:.3f} puntos porcentuales',
             'lesson': '/app/academia/mates/2'},
            {'question': '¿Tus predicciones sobreestimaron o subestimaron en promedio?',
             'answer': 'Sobreestimaron' if bias>0 else 'Subestimaron' if bias<0 else 'Sesgo medio cero',
             'lesson': '/app/academia/ml/3'}],
        'limitations': 'Diagnóstico descriptivo de una ronda; no demuestra sobreajuste ni superioridad estadística.'}
