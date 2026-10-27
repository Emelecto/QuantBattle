"""Ownership, moderation, data embargo and independently reproduced diagnostics."""
import hashlib
import json
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import ml_learning as learning
import weekly_api
import weekly_protocol
from test_ml_tournaments import FakeSupabase, Query

USER = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-000000000002'
ADMIN = '00000000-0000-0000-0000-000000000003'


@pytest.fixture
def context(monkeypatch):
    db, files = FakeSupabase(), {}
    def authenticate(request):
        uid = request.headers.get('x-test-user')
        if uid not in (USER, OTHER, ADMIN):
            raise HTTPException(401, 'Inicia sesión')
        return uid
    monkeypatch.setattr(learning, 'database', lambda: db)
    monkeypatch.setattr(weekly_api, 'database', lambda: db)
    monkeypatch.setattr(learning, 'require_user', authenticate)
    import admin
    monkeypatch.setattr(admin, '_get_admin_ids', lambda: [ADMIN])
    monkeypatch.setattr(admin, 'require_user', authenticate)
    def upload(payload, path, **kwargs):
        assert kwargs.get('private') is True
        assert path not in files
        files[path] = payload
    def download(path, *, expected_sha256=None, **kwargs):
        payload = files[path]
        if expected_sha256:
            assert hashlib.sha256(payload).hexdigest() == expected_sha256
        return payload
    monkeypatch.setattr(learning.storage, 'upload_bytes', upload)
    monkeypatch.setattr(learning.storage, 'download_bytes', download)
    monkeypatch.setattr(learning.storage, 'download_csv', download)
    def upsert(query, payload, **kwargs):
        table = db.rows.setdefault(query.table, [])
        keys = kwargs['on_conflict'].split(',')
        matches = [r for r in table if all(r.get(k) == payload[k] for k in keys)]
        if matches:
            matches[0].update(payload)
            return query
        return query.insert(payload)
    monkeypatch.setattr(Query, 'upsert', upsert, raising=False)
    app = FastAPI()
    app.include_router(learning.router)
    return TestClient(app), db, files


def create_version(client, *, user=USER, protocol='daily_return_mae_v1'):
    headers = {'x-test-user': user}
    response = client.post('/ml/projects', headers=headers, json={
        'title': 'Regresión reproducible', 'hypothesis': 'Una relación lineal puede generalizar.', 'protocol': protocol})
    assert response.status_code == 201, response.text
    project = response.json()
    notebook = {'nbformat': 4, 'cells': [{'cell_type': 'code', 'source': ['print(1)'],
        'outputs': [{'text': 'PRIVATE OUTPUT'}], 'execution_count': 9, 'metadata': {'token': 'PRIVATE METADATA'}}]}
    response = client.post(f'/ml/projects/{project["id"]}/versions', headers=headers, json={
        'model_name': 'Ridge', 'parameters': {'alpha': 1}, 'seed': 7, 'note': 'PRIVATE NOTE',
        'notebook': notebook, 'dependencies': 'scikit-learn==1.5.2', 'dataset_version': 'v1'})
    assert response.status_code == 201, response.text
    return project, response.json()


def test_projects_are_private_and_notebooks_are_cleaned_and_hashed(context):
    client, db, files = context
    assert client.get('/ml/projects').status_code == 401
    project, version = create_version(client)
    assert client.get(f'/ml/projects/{project["id"]}', headers={'x-test-user': OTHER}).status_code == 404
    assert client.get('/ml/projects', headers={'x-test-user': OTHER}).json()['entries'] == []
    assert 'notebook_path' not in version
    response = client.get(f'/ml/projects/{project["id"]}/versions/{version["id"]}/notebook', headers={'x-test-user': USER})
    assert response.status_code == 200
    assert b'PRIVATE OUTPUT' not in response.content and b'PRIVATE METADATA' not in response.content
    assert hashlib.sha256(response.content).hexdigest() == version['notebook_sha256']
    assert client.get(f'/ml/projects/{project["id"]}/versions/{version["id"]}/notebook', headers={'x-test-user': OTHER}).status_code == 404
    original = version['snapshot']['hypothesis']
    assert client.patch(f'/ml/projects/{project["id"]}', headers={'x-test-user': USER}, json={
        'title':'Otra hipótesis','hypothesis':'Nueva idea','protocol':project['protocol']}).status_code == 200
    assert db.rows['ml_project_versions'][0]['snapshot']['hypothesis'] == original
    assert client.patch(f'/ml/projects/{project["id"]}', headers={'x-test-user': USER}, json={
        'title':'Otra','hypothesis':'','protocol':'spearman_era_v1'}).status_code == 409


def test_publication_requires_admin_review_omits_private_note_and_forks_with_lineage(context):
    client, db, _ = context
    project, version = create_version(client)
    headers = {'x-test-user': USER}
    pub = client.post(f'/ml/projects/{project["id"]}/publish', headers=headers, json={
        'version_id':version['id'], 'description':'Un método educativo con regresión y validación temporal.',
        'limitations':'No prueba capacidad predictiva en datos financieros futuros.', 'license':'MIT'}).json()
    assert pub['status'] == 'pending_review'
    assert client.get('/ml/notebooks').json()['entries'] == []
    assert client.get(f'/ml/notebooks/{pub["id"]}', headers={'x-test-user': OTHER}).status_code == 404
    assert client.get(f'/ml/notebooks/{pub["id"]}/download', headers={'x-test-user': OTHER}).status_code == 404
    review = {'status':'published', 'note':'Formato y contexto revisados manualmente; ejecución no verificada.'}
    assert client.post(f'/ml/notebooks/{pub["id"]}/review', headers=headers, json=review).status_code == 403
    assert client.post(f'/ml/notebooks/{pub["id"]}/review', headers={'x-test-user':ADMIN}, json=review).status_code == 200
    public = client.get('/ml/notebooks').text
    assert 'PRIVATE NOTE' not in public and 'notebook_path' not in public and 'author_id' not in public
    assert client.get(f'/ml/notebooks/{pub["id"]}/download').status_code == 200
    clone = client.post(f'/ml/notebooks/{pub["id"]}/fork', headers={'x-test-user':OTHER})
    assert clone.status_code == 201, clone.text
    detail = client.get(f'/ml/projects/{clone.json()["id"]}', headers={'x-test-user':OTHER}).json()
    assert detail['project']['parent_publication_id'] == pub['id']
    assert 'MIT' in detail['versions'][0]['snapshot']['note']
    assert client.delete(f'/ml/notebooks/{pub["id"]}', headers={'x-test-user':OTHER}).status_code == 404
    assert client.delete(f'/ml/notebooks/{pub["id"]}', headers=headers).status_code == 200
    assert client.get('/ml/notebooks').json()['entries'] == []
    assert client.get(f'/ml/notebooks/{pub["id"]}/download').status_code == 401


def test_submissions_can_only_link_to_own_project_with_matching_dataset(context):
    client, db, _ = context
    project, version = create_version(client)
    sid = str(uuid.uuid4())
    db.rows['ml_return_submissions'] = [{'id':sid, 'user_id':OTHER, 'dataset_version':'v1'}]
    target=f'/ml/projects/{project["id"]}/submissions'
    payload={'version_id':version['id'], 'submission_id':sid}
    assert client.post(target,headers={'x-test-user':USER},json=payload).status_code==404
    db.rows['ml_return_submissions'][0].update(user_id=USER,dataset_version='wrong')
    assert client.post(target,headers={'x-test-user':USER},json=payload).status_code==409
    db.rows['ml_return_submissions'][0]['dataset_version']='v1'
    assert client.post(target,headers={'x-test-user':USER},json=payload).status_code==200
    assert client.post(target,headers={'x-test-user':USER},json=payload).status_code==409


def test_missions_grade_on_server_and_progress_is_personal(context):
    client, db, _ = context
    headers={'x-test-user':USER}
    for mission in ('baseline', 'leakage', 'windows'):
        notebook = client.get(f'/ml/learning/missions/{mission}/notebook')
        assert notebook.status_code == 200
        document = notebook.json()
        assert document['nbformat'] == 4
        assert all('id' in cell for cell in document['cells'])
        assert document['cells'][1]['outputs'] == []
    assert client.post('/ml/learning/missions/leakage/attempts',json={'choice':1}).status_code==401
    assert client.post('/ml/learning/missions/leakage/attempts',headers=headers,json={'choice':0}).json()['passed'] is False
    assert client.post('/ml/learning/missions/leakage/attempts',headers=headers,json={'choice':1}).json()['passed'] is True
    response=client.post('/ml/learning/missions/baseline/attempts',headers=headers,json={'predictions':[-.03,-.01,.01,.03,.05,-.05]})
    assert response.json()['mae']==0 and response.json()['passed']
    assert client.post('/ml/learning/missions/windows/attempts',headers=headers,json={'choice':1,'passed':True}).status_code==422
    own=client.get('/ml/learning/progress',headers=headers).json()
    assert own['passed_missions']==['baseline','leakage'] and own['has_submission'] is False
    assert client.get('/ml/learning/progress',headers={'x-test-user':OTHER}).json()['passed_missions']==[]


def test_error_lab_enforces_entire_week_embargo_and_recomputes_only_own_errors(context):
    client, db, files=context
    week, rounds=weekly_protocol.schedule(date(2026,1,5))
    week.update(status='open',result_path='results.json',result_hash='not-downloaded-before-release')
    for row in rounds:
        row['status']='settled'
    db.rows['ml_return_weeks']=[week]
    db.rows['ml_return_rounds']=rounds
    identity=rounds[0]['id']
    path='my.csv'
    files[path]=b'id,prediction\na,0.01\nb,-0.01\n'
    db.rows['ml_return_submissions']=[{'id':str(uuid.uuid4()),'round_id':identity,'user_id':USER,'is_selected':True,'status':'scored',
        'file_path':path,'file_sha256':hashlib.sha256(files[path]).hexdigest(),'dataset_version':'v1'}]
    url=f'/ml/learning/error-lab/{identity}'
    assert client.get(url,headers={'x-test-user':USER}).status_code==409
    evidence={'rounds':[{'id':identity,'assets':[{'id':'a','symbol':'AA','return':.03},{'id':'b','symbol':'BB','return':-.03}]}]}
    files['results.json']=json.dumps(evidence).encode()
    week.update(status='published',result_hash=hashlib.sha256(files['results.json']).hexdigest())
    report=client.get(url,headers={'x-test-user':USER})
    assert report.status_code==200,report.text
    assert report.json()['mae']==pytest.approx(.02)
    assert report.json()['score']==pytest.approx(1/3)
    assert client.get(url,headers={'x-test-user':OTHER}).status_code==404
    week['release_at']=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
    assert client.get(url,headers={'x-test-user':USER}).status_code==409


def test_notebook_limits_and_nonfinite_parameters_are_rejected(context):
    client, _, _=context
    with pytest.raises(ValueError):
        learning.clean_notebook({'nbformat':4,'cells':[{'cell_type':'html','source':'<script/>'}]})
    with pytest.raises(ValueError):
        learning.clean_notebook({'nbformat':4,'cells':[{'cell_type':'code','source':'x'*2_000_001}]})
    project, _=create_version(client,protocol='spearman_era_v1')
    assert client.post(f'/ml/projects/{project["id"]}/versions',headers={'x-test-user':USER},json={
        'model_name':'Ridge','validation_mae':0.02}).status_code==422
    sid = str(uuid.uuid4())
    context[1].rows['prediction_submissions'] = [{'id': sid, 'user_id': USER, 'dataset_id': 'legacy', 'dataset_version': 'v1'}]
    context[1].rows['ml_datasets'] = [{'id': 'legacy', 'score_version': 'older_protocol'}]
    version = context[1].rows['ml_project_versions'][0]
    assert client.post(f'/ml/projects/{project["id"]}/submissions', headers={'x-test-user':USER}, json={
        'version_id':version['id'], 'submission_id':sid}).status_code==409
    response = client.post('/ml/projects', headers={'x-test-user': USER, 'Content-Type': 'application/json'}, content=b' '*2_200_001)
    assert response.status_code == 413
