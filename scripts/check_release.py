"""Fail-closed release gate for one commit, its CI, deployments and operational monitor."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def gh(*args):
    return subprocess.check_output(['gh', *args], cwd=ROOT, text=True).strip()


def existing_reference(value):
    if not isinstance(value, str): return False
    path = (ROOT / value).resolve()
    return path.is_relative_to(ROOT) and path.is_file()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=('controlled-pilot', 'open-call'), default='controlled-pilot')
    args = parser.parse_args()
    load_dotenv(ROOT / 'worker/.env')
    scope = json.loads((ROOT / 'release/scope.json').read_text(encoding='utf-8'))
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=ROOT, text=True).strip())
    checks = [{'name': 'committed_source', 'passed': not dirty}]
    runs = json.loads(gh('run', 'list', '--repo', scope['repository'], '--commit', sha, '--limit', '100', '--json', 'workflowName,headSha,status,conclusion,url,databaseId'))
    for workflow in scope['required_workflows']:
        matches = sorted((run for run in runs if run['workflowName'] == workflow), key=lambda run: run['databaseId'], reverse=True)
        run = matches[0] if matches else None
        checks.append({'name': workflow, 'passed': bool(run and run['headSha'] == sha and run['status'] == 'completed' and run['conclusion'] == 'success'),
            'url': run['url'] if run else None, 'state': run['conclusion'] or run['status'] if run else 'missing'})
    status = json.loads(gh('api', f'repos/{scope["repository"]}/commits/{sha}/status'))
    vercel = next((row for row in status['statuses'] if row['context'].lower() == 'vercel'), None)
    checks.append({'name': 'web_deployment', 'passed': bool(vercel and vercel['state'] == 'success'), 'url': vercel['target_url'] if vercel else None})
    render_key = os.environ.get('RENDER_API_KEY')
    render_ok = False
    if render_key:
        response = requests.get(f'https://api.render.com/v1/services/{scope["render_service_id"]}/deploys?limit=10', headers={'Authorization': 'Bearer ' + render_key}, timeout=30)
        response.raise_for_status()
        deployments = [row.get('deploy', row) for row in response.json()]
        latest_live = next((row for row in deployments if row.get('status') == 'live'), None)
        render_ok = bool(latest_live and latest_live.get('commit', {}).get('id') == sha)
    checks.append({'name': 'worker_deployment', 'passed': render_ok})
    references = [ref for journey in scope['journeys'] for kind in ('browser', 'server', 'services') for ref in journey.get(kind, [])]
    checks.append({'name': 'scope_evidence_sources_exist', 'passed': all(existing_reference(ref) for ref in references)})
    if args.stage == 'open-call':
        evidence = json.loads((ROOT / 'release/pilot-evidence.json').read_text(encoding='utf-8'))
        week_id = evidence.get('real_week_id')
        released = False
        if isinstance(week_id, str):
            import uuid
            uuid.UUID(week_id)
            response = requests.get(scope['worker_url'] + '/ml/return-tournaments/' + week_id, timeout=45)
            if response.ok:
                week = response.json().get('tournament', response.json())
                released = week.get('results_released') is True and len(week.get('rounds', [])) == 4 and all(row.get('status') == 'published' for row in week['rounds'])
        checks.append({'name': 'complete_real_week_reviewed', 'passed': released and existing_reference(evidence.get('real_week_review'))})
        feedback = evidence.get('external_feedback', [])
        checks.append({'name': 'external_feedback_reviewed', 'passed': bool(feedback) and all(existing_reference(ref) for ref in feedback)})
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'commit': sha, 'requested_stage': args.stage,
        'ready_for_requested_stage': all(check['passed'] for check in checks), 'checks': checks,
        'scope': scope['journeys'], 'outside_scope': scope['outside_launch'],
        'limitation': 'Green CI certifies these automated checks; it is not proof of external adoption or financial returns.'}
    path = ROOT / 'artifacts/release/readiness.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'commit': sha, 'stage': args.stage, 'ready': report['ready_for_requested_stage'],
        'pending': [check['name'] for check in checks if not check['passed']]}))
    return 0 if report['ready_for_requested_stage'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
