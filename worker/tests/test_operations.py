from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from operations import assess_state, validate_configuration
import weekly_engine as engine

NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)


def run(status='success', age=10):
    return {'run_id': 'technical', 'started_at': (NOW - timedelta(minutes=age + 1)).isoformat(),
        'finished_at': (NOW - timedelta(minutes=age)).isoformat(), 'status': status}


@pytest.mark.parametrize('runs', [[], [run('failed')], [run('running')], [run(age=181)], [run(age=-10)]])
def test_missing_stale_failed_or_future_heartbeat_never_reports_healthy(runs):
    assert assess_state(runs, [], [], NOW)['status'] == 'attention'


def test_latest_failure_is_not_hidden_by_an_older_success():
    assert assess_state([run(age=20), run('failed', age=1)], [], [], NOW)['status'] == 'attention'


def test_overdue_settlement_and_release_require_attention_without_exposing_sources():
    round_ = {'id': 'r', 'status': 'ready', 'target_end': (NOW - timedelta(hours=3)).isoformat(), 'source_path': 'private-secret'}
    week = {'id': 'w', 'status': 'open', 'release_at': (NOW - timedelta(hours=3)).isoformat()}
    report = assess_state([run()], [week], [round_], NOW)
    assert report['status'] == 'attention'
    assert all(not check['passed'] for check in report['checks'][1:])
    assert 'private-secret' not in str(report)
    assert assess_state([run()], [], [], NOW)['status'] == 'ok'


def test_configuration_errors_name_missing_fields_without_values():
    with pytest.raises(ValueError, match='DATASET_SALT'):
        validate_configuration({'SUPABASE_URL': 'private-url', 'SUPABASE_SERVICE_ROLE_KEY': 'private-key'})
    env = {'SUPABASE_URL': 'url', 'SUPABASE_SERVICE_ROLE_KEY': 'secret', 'DATASET_SALT': 's' * 24,
        'ML_DAILY_TOURNAMENTS_ENABLED': 'true'}
    validate_configuration(env)
    with pytest.raises(ValueError, match='disabled'):
        validate_configuration({**env, 'ML_DAILY_TOURNAMENTS_ENABLED': 'false'})


def test_paused_creation_still_settles_and_publishes_existing_rounds():
    week = {'id': 'w', 'status': 'open'}
    pending = {'id': 'pending', 'status': 'pending', 'closes_at': (NOW + timedelta(hours=1)).isoformat()}
    ready = {'id': 'ready', 'status': 'ready', 'closes_at': (NOW - timedelta(hours=25)).isoformat()}
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [ready]
    with patch.object(engine, 'ensure_week') as ensure, patch.object(engine, 'all_rows', side_effect=[[week], [pending, ready], [pending, ready]]), \
            patch.object(engine, 'build_round', return_value=False) as build, \
            patch.object(engine, 'settle_round', return_value=True) as settle, \
            patch.object(engine, 'publish_week', return_value=False) as publish:
        engine.run_tick(sb, NOW, allow_create=False)
    ensure.assert_not_called()
    assert [call.args[2]['id'] for call in build.call_args_list] == ['ready']
    assert settle.call_count == 2
    publish.assert_called_once()


def test_referee_records_failure_before_propagating_it(monkeypatch):
    import run_return_tournaments as runner
    monkeypatch.setattr('sys.argv', ['run_return_tournaments.py'])
    with patch('operations.validate_configuration'), patch('tournaments.get_supabase', return_value=MagicMock()), \
            patch('operations.start_run') as start, patch('operations.finish_run') as finish, \
            patch('weekly_engine.run_tick', side_effect=RuntimeError('market unavailable')):
        with pytest.raises(RuntimeError, match='market unavailable'):
            runner.main()
    start.assert_called_once()
    assert finish.call_args.args[2] == 'failed'


def test_monitor_rejects_a_successful_heartbeat_from_another_commit(monkeypatch):
    import check_operations
    monkeypatch.setenv('GITHUB_SHA', 'current-revision')
    with patch('tournaments.get_supabase'), patch('operations.readiness_report', return_value={
        'status': 'ok', 'checks': [], 'latest_run': {'commit_sha': 'older-revision'}}):
        assert check_operations.main() == 1
