import copy
import json
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from .protocol import digest, predictions, score
from .tournament import Repository, evidence_from_bars, register_latest, settle_round

NOW = datetime(2026, 11, 5, 23, tzinfo=timezone.utc)
ROW = {'id': 'stocks-oc-2026-11-05', 'target_date': '2026-11-05', 'status': 'open',
       'target_close': '2026-11-05T21:00:00+00:00', 'manifest_hash': 'hash',
       'assets': [{'id': 'a', 'ticker': 'AAPL'}, {'id': 'b', 'ticker': 'MSFT'}]}
PAYLOAD = {'bars': {s: [{'t': '2026-11-05T05:00:00Z', 'o': 100, 'h': 103, 'l': 98, 'c': c, 'v': 1000}]
                   for s, c in [('AAPL', 102), ('MSFT', 99)]}}


def test_csv_decimal_return_and_id_alignment():
    values = predictions(b'\xef\xbb\xbfid,prediction\r\nb,-0.01\r\na,0.02\r\n', ['a', 'b'])
    assert score(values, {'a': .02, 'b': -.01})['mae'] == 0
    assert score({'a': 0, 'b': 0}, {'a': .02, 'b': -.01})['score'] == 0
    assert score({'a': 0}, {'a': 0})['score'] == 0


@pytest.mark.parametrize('data', [b'id,prediction\na,NaN\nb,0', b'id,prediction\na,0\na,0',
    b'id,prediction\na,0', b'id,prediction\na,0\nb,1_0', b'id,prediction\na,0\nb,inf',
    b'id,prediction\na,\nb,0', b'id,prediction\na,0\nb,-1.01', b'id,prediction,x\na,0,1\nb,0,1',
    b'id,prediction\na,0\nb,0\n\n'])
def test_invalid_csv_is_rejected(data):
    with pytest.raises(ValueError):
        predictions(data, ['a', 'b'])


def test_actual_return_is_next_session_open_close_not_close_close():
    assets = evidence_from_bars(ROW, PAYLOAD)
    assert assets[0]['return'] == pytest.approx(.02)
    assert assets[1]['return'] == pytest.approx(-.01)


@pytest.mark.parametrize('change', ['missing', 'duplicate', 'date', 'nan', 'ohlc', 'pagination'])
def test_settlement_never_drops_bad_assets(change):
    data = copy.deepcopy(PAYLOAD)
    if change == 'missing': del data['bars']['MSFT']
    if change == 'duplicate': data['bars']['MSFT'] *= 2
    if change == 'date': data['bars']['MSFT'][0]['t'] = '2026-11-04T05:00:00Z'
    if change == 'nan': data['bars']['MSFT'][0]['c'] = float('nan')
    if change == 'ohlc': data['bars']['MSFT'][0]['h'] = 50
    if change == 'pagination': data['next_page_token'] = 'more'
    with pytest.raises(ValueError): evidence_from_bars(ROW, data)


class Store:
    def __init__(self): self.objects = {}
    def get(self, key, optional=False): return self.objects.get(key) if optional else self.objects[key]
    def put(self, key, data, **kwargs):
        if key in self.objects and self.objects[key] != data: raise ValueError('immutable')
        self.objects[key] = data


def test_settlement_retry_reuses_frozen_evidence_after_partial_failure():
    repo = MagicMock()
    repo.storage = Store()
    raw = b'id,prediction\na,0.02\nb,-0.01\n'
    repo.storage.objects['submission.csv'] = raw
    repo.rows.return_value = [{'id': 'sub', 'file_path': 'submission.csv', 'file_sha256': digest(raw), 'manifest_hash': 'hash'}]
    evidence = {'round_id': ROW['id'], 'assets': evidence_from_bars(ROW, PAYLOAD)}
    repo.update.side_effect = RuntimeError('temporary database error')
    with patch.object(sys.modules[settle_round.__module__], 'fetch_actual', return_value=evidence) as fetch:
        with pytest.raises(RuntimeError): settle_round(repo, ROW, NOW)
        repo.update.side_effect = None
        assert settle_round(repo, ROW, NOW)
        assert fetch.call_count == 1
    assert repo.update.call_args.args[2]['status'] == 'settled'


def test_settlement_waits_for_maturity_and_rejects_corrupt_submission():
    repo = MagicMock()
    assert not settle_round(repo, ROW, datetime(2026, 11, 5, 21, 15, tzinfo=timezone.utc))
    repo.rows.assert_not_called()
    repo.storage = Store()
    repo.storage.objects['submission.csv'] = b'changed'
    repo.rows.return_value = [{'id': 's', 'file_path': 'submission.csv', 'file_sha256': 'original', 'manifest_hash': 'hash'}]
    with patch.object(sys.modules[settle_round.__module__], 'fetch_actual', return_value={'round_id': ROW['id'], 'assets': evidence_from_bars(ROW, PAYLOAD)}):
        with pytest.raises(ValueError, match='integrity'): settle_round(repo, ROW, NOW)
    repo.update.assert_not_called()


def test_repository_paginates_beyond_one_thousand_submissions():
    repo = Repository(MagicMock())
    with patch.object(repo, 'request', side_effect=[[{'id': str(i)} for i in range(500)],
         [{'id': str(i)} for i in range(500, 1000)], [{'id': '1000'}]]) as request:
        assert len(repo.rows('stock_return_submissions')) == 1001
        assert request.call_args.kwargs['params']['offset'] == 1000


def test_registration_checks_hash_and_never_replaces_existing_round():
    repo = MagicMock()
    manifest = {'mode': 'live', 'target_date': '2026-11-05', 'submission_deadline': '2026-11-05T14:00:00Z'}
    raw = json.dumps(manifest).encode()
    pointer = json.dumps({'manifest': 'manifest.json', 'manifest_sha256': digest(raw)}).encode()
    repo.storage.get.side_effect = [pointer, raw]
    repo.rows.return_value = [{'manifest_hash': 'changed'}]
    with pytest.raises(ValueError, match='cannot change'): register_latest(repo, NOW)
    repo.request.assert_not_called()
    repo.storage.get.side_effect = [pointer, raw]
    repo.rows.return_value = []
    with pytest.raises(ValueError, match='closed round'): register_latest(repo, NOW)
    repo.request.assert_not_called()


def registration_fixture():
    repo = MagicMock()
    live = ('id,ticker,date,target_date\n' + ''.join(
        f'asset-{i},STOCK{i},2026-11-04,2026-11-05\n' for i in range(40))).encode()
    manifest = {'mode': 'live', 'target_date': '2026-11-05', 'observation_date': '2026-11-04',
                'submission_deadline': '2026-11-05T14:00:00Z', 'target_open': '2026-11-05T14:30:00Z',
                'target_close': '2026-11-05T21:00:00Z', 'rows': 40,
                'files': {'live.csv': {'sha256': digest(live)}}}
    raw = json.dumps(manifest).encode()
    pointer = json.dumps({'manifest': 'daily/manifest.json', 'manifest_sha256': digest(raw)}).encode()
    repo.storage.get.side_effect = lambda path, **kw: {
        'daily/latest.json': pointer, 'daily/manifest.json': raw, 'daily/live.csv': live}[path]
    return repo, manifest, raw


def test_registration_recovers_committed_files_and_requires_database_confirmation():
    repo, manifest, raw = registration_fixture()
    now = datetime(2026, 11, 5, 10, tzinfo=timezone.utc)
    repo.rows.side_effect = [[], [{'id': 'stocks-oc-2026-11-05', 'manifest_hash': digest(raw)}]]
    assert register_latest(repo, now) is True
    record = repo.request.call_args.kwargs['json']
    assert record['deadline'] == manifest['submission_deadline']
    assert record['manifest_hash'] == digest(raw)
    assert len(record['assets']) == 40
    repo.rows.side_effect = [[], []]
    with pytest.raises(RuntimeError, match='not confirmed'):
        register_latest(repo, now)


def test_reconciliation_skips_missing_closed_round_without_opening_late_entries():
    repo, _, _ = registration_fixture()
    repo.rows.return_value = []
    assert register_latest(repo, NOW, skip_closed=True) is False
    repo.request.assert_not_called()
