from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import stock_api as api


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app)


def sample():
    return {'id': 'stocks-oc-2026-11-05', 'deadline': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            'status': 'open', 'manifest_hash': 'hash', 'assets': [{'id': 'a'}, {'id': 'b'}]}


def test_requires_auth_before_opening_private_storage(client, monkeypatch):
    monkeypatch.delenv('ALLOW_TEST_AUTH', raising=False)
    with patch.object(api, 'Repository') as repo:
        assert client.get('/ml/stock-rounds').status_code == 401
        repo.assert_not_called()


def test_upload_uses_atomic_confirmation_and_does_not_expose_private_path(client):
    repo = MagicMock()
    repo.rows.return_value = [sample()]
    repo.request.return_value = {'id': 's', 'status': 'validated', 'file_path': 'private/path', 'is_selected': True}
    with patch.object(api, 'require_user', return_value='user'), patch.object(api, 'Repository', return_value=repo):
        response = client.post('/ml/stock-rounds/stocks-oc-2026-11-05/predictions', content='id,prediction\na,0.02\nb,-0.01\n')
    assert response.status_code == 200
    assert 'private/path' not in response.text
    assert repo.request.call_args.args == ('POST', 'rpc/submit_stock_prediction')


def test_closed_upload_never_writes_storage(client):
    repo = MagicMock()
    repo.rows.return_value = [{**sample(), 'deadline': '2020-01-01T00:00:00Z'}]
    with patch.object(api, 'require_user', return_value='user'), patch.object(api, 'Repository', return_value=repo):
        assert client.post('/ml/stock-rounds/stocks-oc-2026-11-05/predictions', content='id,prediction\na,0\nb,0').status_code == 409
    repo.storage.put.assert_not_called()


def test_invalid_csv_never_writes_storage_and_db_failure_never_claims_success(client):
    repo = MagicMock()
    repo.rows.return_value = [sample()]
    with patch.object(api, 'require_user', return_value='user'), patch.object(api, 'Repository', return_value=repo):
        assert client.post('/ml/stock-rounds/stocks-oc-2026-11-05/predictions', content='id,prediction\na,NaN\nb,0').status_code == 422
        repo.storage.put.assert_not_called()
        repo.request.side_effect = RuntimeError('database unavailable')
        assert client.post('/ml/stock-rounds/stocks-oc-2026-11-05/predictions', content='id,prediction\na,0\nb,0').status_code == 503


def test_scores_stay_hidden_until_round_fully_settled():
    sub = {'status': 'scored', 'score': 1, 'mae': 0, 'baseline_mae': .02, 'file_path': 'private'}
    assert 'score' not in api.receipt(sub, False)
    assert api.receipt(sub, True)['score'] == 1


def test_results_blocked_until_settlement(client):
    repo = MagicMock()
    repo.rows.return_value = [sample()]
    with patch.object(api, 'require_user', return_value='user'), patch.object(api, 'Repository', return_value=repo):
        assert client.get('/ml/stock-rounds/stocks-oc-2026-11-05/results').status_code == 409
    repo.storage.get.assert_not_called()
