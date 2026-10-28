"""Actual Auth/Postgres/Storage/worker checks, restricted to isolated local Supabase.

No test-auth bypass, email, production data or future market prices are used.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlparse

import requests
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', type=Path, required=True)
    args = parser.parse_args()
    status = subprocess.run(['supabase', 'status', '--workdir', str(args.workdir.resolve()), '--output', 'json'], capture_output=True, check=True)
    config = json.loads(status.stdout)
    api = config['API_URL'].rstrip('/')
    if urlparse(api).hostname not in ('127.0.0.1', 'localhost') or urlparse(api).port != 55321:
        raise RuntimeError('Only isolated local staging at port 55321 is allowed')
    admin = create_client(api, config['SERVICE_ROLE_KEY'])
    users, tokens, checks = [], [], []
    process = None
    logs = tempfile.TemporaryFile()
    worker = 'http://127.0.0.1:8108'

    def check(name, passed):
        checks.append({'name': name, 'passed': bool(passed)})
        if not passed:
            raise RuntimeError(name)

    def call(method, path, user=None, **kwargs):
        headers = kwargs.pop('headers', {})
        if user is not None:
            headers['Authorization'] = 'Bearer ' + tokens[user]
        return requests.request(method, worker + path, headers=headers, timeout=45, **kwargs)

    def rest(method, path, user, **kwargs):
        return requests.request(method, api + '/rest/v1/' + path,
            headers={'apikey': config['ANON_KEY'], 'Authorization': 'Bearer ' + tokens[user], 'Prefer': 'resolution=merge-duplicates,return=representation'}, timeout=20, **kwargs)

    try:
        for i in range(2):
            suffix = secrets.token_hex(8)
            email, password = f'ql-release-{suffix}@example.invalid', secrets.token_urlsafe(32)
            metadata = {'username': f'release_{suffix}', 'is_technical': True}
            if i == 0:
                user = admin.auth.admin.create_user({'email': email, 'password': password, 'email_confirm': True,
                    'user_metadata': metadata}).user
            else:
                user = create_client(api, config['ANON_KEY']).auth.sign_up({'email': email, 'password': password,
                    'options': {'data': metadata}}).user
                check('actual_public_signup', user is not None)
            users.append(user.id)
            session = create_client(api, config['ANON_KEY']).auth.sign_in_with_password({'email': email, 'password': password}).session
            tokens.append(session.access_token)
        env = {**os.environ, 'SUPABASE_URL': api, 'SUPABASE_ANON_KEY': config['ANON_KEY'],
            'SUPABASE_SERVICE_ROLE_KEY': config['SERVICE_ROLE_KEY'], 'DATASET_SALT': secrets.token_hex(24),
            'ADMIN_USER_IDS': users[1], 'CORS_ORIGINS': 'http://localhost:3100',
            'ML_DAILY_TOURNAMENTS_ENABLED': 'true'}
        for name in ('TESTING', 'ALLOW_TEST_AUTH', 'SUPABASE_JWKS_URL'):
            env.pop(name, None)
        process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8108'],
            cwd=ROOT / 'worker', env=env, stdout=logs, stderr=logs)
        for _ in range(90):
            if process.poll() is not None: raise RuntimeError('Staging worker stopped before health check')
            try:
                if requests.get(worker + '/health', timeout=1).ok: break
            except requests.RequestException: pass
            time.sleep(1)
        else: raise RuntimeError('Staging worker health timeout')

        check('anonymous_projects_denied', call('GET', '/ml/projects').status_code == 401)
        check('real_jwt_authenticated', call('GET', '/ml/projects', 0).status_code == 200)
        forged = requests.get(worker + '/ml/projects', headers={'Authorization': 'Bearer ' + tokens[0][:-10] + 'forged'}, timeout=15)
        check('forged_signature_denied', forged.status_code == 401)
        progress = rest('POST', 'course_progress', 0, json={'user_id': users[0], 'completed_lessons': ['c1-l1']})
        check('academia_progress_saved', progress.status_code in (200, 201))
        check('academia_progress_isolated', rest('GET', f'course_progress?user_id=eq.{users[0]}', 1).json() == [])
        check('academia_forged_owner_denied', rest('POST', 'course_progress', 1, json={'user_id': users[0], 'completed_lessons': ['forged']}).status_code == 403)
        strategy = rest('POST', 'strategies', 0, json={'user_id': users[0], 'title': 'Staging private backtest', 'code': 'fast=10,slow=30', 'is_public': False})
        check('backtest_strategy_persisted', strategy.status_code == 201)
        strategy_id = strategy.json()[0]['id']
        check('private_strategy_isolated', rest('GET', f'strategies?id=eq.{strategy_id}', 1).json() == [])
        saved_run = rest('POST', 'backtest_runs', 0, json={'strategy_id': strategy_id, 'status': 'done', 'metrics_json': {'sharpe_oos': .1}, 'equity_curve': []})
        check('backtest_result_persisted', saved_run.status_code == 201)
        check('private_backtest_isolated', rest('GET', f'backtest_runs?strategy_id=eq.{strategy_id}', 1).json() == [])
        cfg = {'code': 'fast=10,slow=30', 'asset_type': 'crypto', 'symbol': 'BTCUSDT', 'timeframe': '1d',
            'start': '2025-01-01', 'end': '2024-01-01', 'capital': 1000, 'commission': .001, 'slippage': .0005, 'folds': 3, 'split': 70}
        check('backtest_anonymous_denied', call('POST', '/backtest', json=cfg).status_code == 401)
        check('backtest_invalid_range_rejected', call('POST', '/backtest', 0, json=cfg).status_code == 400)

        project = call('POST', '/ml/projects', 0, json={'title': 'Staging research', 'protocol': 'daily_return_mae_v1', 'hypothesis': 'Technical fixture'} )
        check('project_created', project.status_code == 201)
        project_id = project.json()['id']
        check('private_project_isolated', call('GET', f'/ml/projects/{project_id}', 1).status_code == 404)
        notebook = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {'private': 'remove'}, 'cells': [
            {'id': 'technical-cell', 'cell_type': 'code', 'metadata': {}, 'execution_count': 1, 'source': ['print(1)'], 'outputs': [{'output_type': 'stream', 'name': 'stdout', 'text': ['secret output']}]}]}
        version = call('POST', f'/ml/projects/{project_id}/versions', 0, json={'model_name': 'Technical model', 'seed': 7, 'parameters': {}, 'dependencies': 'Python 3.11; technical staging notebook', 'notebook': notebook})
        check('version_and_private_notebook_saved', version.status_code == 201)
        version_id = version.json()['id']
        downloaded = call('GET', f'/ml/projects/{project_id}/versions/{version_id}/notebook', 0)
        check('notebook_cleaned', downloaded.status_code == 200 and downloaded.json()['cells'][0]['outputs'] == [] and 'private' not in downloaded.json()['metadata'])
        check('notebook_hash_exact', hashlib.sha256(downloaded.content).hexdigest() == version.json()['notebook_sha256'])
        check('private_notebook_isolated', call('GET', f'/ml/projects/{project_id}/versions/{version_id}/notebook', 1).status_code == 404)
        publication = call('POST', f'/ml/projects/{project_id}/publish', 0, json={'version_id': version_id,
            'description': 'Technical notebook used only to verify isolated staging moderation.',
            'limitations': 'Synthetic fixture. No execution, external adoption or market performance is claimed.', 'license': 'MIT'})
        check('publication_requires_review', publication.status_code == 201 and publication.json()['status'] == 'pending_review')
        publication_id = publication.json()['id']
        check('pending_not_public', call('GET', f'/ml/notebooks/{publication_id}').status_code in (401, 404))
        check('pending_not_listed', all(row['id'] != publication_id for row in call('GET', '/ml/notebooks').json()['entries']))
        review = {'status': 'published', 'note': 'Staging content review only. Execution is not verified.'}
        check('non_admin_review_denied', call('POST', f'/ml/notebooks/{publication_id}/review', 0, json=review).status_code == 403)
        check('admin_review_saved', call('POST', f'/ml/notebooks/{publication_id}/review', 1, json=review).status_code == 200)
        check('published_download_integrity', call('GET', f'/ml/notebooks/{publication_id}/download').content == downloaded.content)
        check('fork_creates_owned_project', call('POST', f'/ml/notebooks/{publication_id}/fork', 1).status_code == 201)
        check('mission_graded', call('POST', '/ml/learning/missions/leakage/attempts', 0, json={'choice': 1}).json().get('passed') is True)
        check('mission_progress_saved', 'leakage' in call('GET', '/ml/learning/progress', 0).json()['passed_missions'])
        check('operations_admin_only', call('GET', '/admin/launch-readiness', 0).status_code == 403)
        check('missing_heartbeat_is_attention', call('GET', '/admin/launch-readiness', 1).json()['status'] == 'attention')
        check('operation_history_not_directly_readable', rest('GET', 'operation_runs', 0).status_code == 403)
        preflight = subprocess.run([sys.executable, 'run_return_tournaments.py', '--check'], cwd=ROOT / 'worker', env=env, capture_output=True)
        check('referee_preflight_no_writes', preflight.returncode == 0 and admin.table('operation_runs').select('id').execute().data == [])
    finally:
        if process is not None:
            process.terminate()
            try: process.wait(timeout=15)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
        cleanup_errors = []
        for uid in users:
            try:
                versions = admin.table('ml_project_versions').select('notebook_path').eq('user_id', uid).execute().data or []
                paths = [row['notebook_path'] for row in versions if row.get('notebook_path')]
                if paths: admin.storage.from_('tournament-targets').remove(paths + [path + '.sha256' for path in paths])
                admin.table('ml_research_publications').delete().eq('author_id', uid).execute()
                admin.table('ml_research_projects').delete().eq('user_id', uid).execute()
                admin.auth.admin.delete_user(uid)
            except Exception:
                cleanup_errors.append('Could not clean isolated fixture ' + uid)
        logs.close()
        report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'environment': 'isolated-local-supabase-and-worker',
            'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'uncommitted_changes': bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=ROOT, text=True).strip()),
            'auth_bypass': False, 'checks': checks, 'passed': bool(checks) and all(c['passed'] for c in checks) and not cleanup_errors,
            'cleanup_errors': cleanup_errors, 'emails_sent': 0, 'external_participants': 0,
            'limits': ['No market-price forecast or real-week closure simulated. Engine results have separate deterministic tests.',
                'Browser contracts use simulated services; this report checks actual Auth/Postgres/Storage and worker.']}
        out = ROOT / 'artifacts/release/staging.json'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'checks_passed': sum(c['passed'] for c in checks), 'cleanup_errors': cleanup_errors}))
        if cleanup_errors: raise RuntimeError('Staging fixture cleanup failed')


if __name__ == '__main__':
    main()
