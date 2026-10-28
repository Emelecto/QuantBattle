import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def gate(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location('release_gate', Path(__file__).resolve().parents[2] / 'scripts/check_release.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    (tmp_path / 'release').mkdir()
    scope = {'repository': 'fixture/repo', 'required_workflows': ['web-ci', 'backend-ci', 'database-ci', 'operations-monitor'],
        'render_service_id': 'fixture', 'worker_url': 'https://fixture.invalid', 'journeys': [], 'outside_launch': []}
    (tmp_path / 'release/scope.json').write_text(json.dumps(scope))
    (tmp_path / 'release/pilot-evidence.json').write_text(json.dumps({'real_week_id': None, 'real_week_review': None, 'external_feedback': []}))
    state = {'sha': 'a' * 40, 'run_sha': 'a' * 40, 'dirty': '', 'conclusion': 'success'}
    monkeypatch.setattr(module.subprocess, 'check_output', lambda cmd, **kw: state['dirty'] if 'status' in cmd else state['sha'])
    def gh(*args):
        if args[0] == 'run':
            return json.dumps([{'workflowName': name, 'headSha': state['run_sha'], 'status': 'completed', 'conclusion': state['conclusion'], 'url': 'https://fixture.invalid/run', 'databaseId': i} for i, name in enumerate(scope['required_workflows'])])
        return json.dumps({'statuses': [{'context': 'Vercel', 'state': 'success', 'target_url': 'https://fixture.invalid/deploy'}]})
    monkeypatch.setattr(module, 'gh', gh)
    monkeypatch.setenv('RENDER_API_KEY', 'fixture-key')
    monkeypatch.setattr(module.requests, 'get', lambda *a, **kw: SimpleNamespace(raise_for_status=lambda: None,
        json=lambda: [{'deploy': {'status': 'live', 'commit': {'id': state['sha']}}}]))
    monkeypatch.setattr('sys.argv', ['check_release.py'])
    return module, state, tmp_path


def test_controlled_pilot_requires_current_ci_and_current_deployments(gate):
    module, state, root = gate
    assert module.main() == 0
    state['run_sha'] = 'b' * 40
    assert module.main() == 1
    report = json.loads((root / 'artifacts/release/readiness.json').read_text())
    assert all(not row['passed'] for row in report['checks'] if row['name'] in ('web-ci', 'backend-ci', 'database-ci', 'operations-monitor'))


def test_failed_checks_and_uncommitted_source_block_approval(gate):
    module, state, _ = gate
    state['conclusion'] = 'failure'
    assert module.main() == 1
    state['conclusion'], state['dirty'] = 'success', ' M source.py'
    assert module.main() == 1


def test_technical_checks_do_not_replace_real_week_and_external_feedback(gate, monkeypatch):
    module, _, root = gate
    monkeypatch.setattr('sys.argv', ['check_release.py', '--stage', 'open-call'])
    assert module.main() == 1
    report = json.loads((root / 'artifacts/release/readiness.json').read_text())
    blocked = {row['name'] for row in report['checks'] if not row['passed']}
    assert blocked == {'complete_real_week_reviewed', 'external_feedback_reviewed'}
