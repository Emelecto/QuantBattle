import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from worker.stocks_history.config import FEATURES, OUTPUT
from worker.stocks_history.test_pipeline import synthetic_daily
from .bundle import export_bundle, verify_bundle
from .cloud import publish_bundle, save_state
from .core import ALL_SYMBOLS, COLUMNS, session_plan, snapshot
from .feed import Collector
from .state import read_state, write_state


@pytest.fixture(scope='module')
def setup():
    clock=pd.Timestamp('2026-10-30T01:00:00Z')
    plan,calendar=session_plan(clock,'2026-10-29')
    index=calendar.loc[:'2026-11-02'].index
    return clock,plan,calendar,{symbol:synthetic_daily(index) for symbol in ALL_SYMBOLS}


def test_schema_and_no_future_information(setup):
    clock,plan,calendar,frames=setup
    original,quality=snapshot(frames,{},plan,calendar)
    changed={symbol:frame.copy() for symbol,frame in frames.items()}
    for frame in changed.values():
        frame.loc['2026-10-30':,['close','open','raw_open','raw_close']]*=8
    replay,_=snapshot(changed,{},plan,calendar)
    pd.testing.assert_frame_equal(original,replay,check_exact=True)
    assert original.shape==(50,37)
    assert all(quality['checks'].values())
    assert 'target_return_oc_1d' not in original


def test_calendar_holiday_early_close_and_dst():
    plan,_=session_plan(pd.Timestamp('2026-11-26T02:00:00Z'),'2026-11-25')
    assert plan['target_date']=='2026-11-27'
    assert plan['target_close']=='2026-11-27T18:00:00+00:00'
    summer,_=session_plan(pd.Timestamp('2026-10-30T01:00:00Z'),'2026-10-29')
    winter,_=session_plan(pd.Timestamp('2026-11-05T02:00:00Z'),'2026-11-04')
    assert summer['submission_deadline'].endswith('13:00:00+00:00')
    assert winter['submission_deadline'].endswith('14:00:00+00:00')
    with pytest.raises(ValueError,match='not an exchange session'):
        session_plan(pd.Timestamp('2026-11-05T02:00:00Z'),'2026-11-01')
    with pytest.raises(ValueError,match='not yet mature'):
        session_plan(pd.Timestamp('2026-11-04T21:05:00Z'),'2026-11-04')


def test_embargo_and_minimum_coverage(setup):
    clock,plan,calendar,frames=setup
    live,quality=snapshot(frames,{'HON':['2026-06-29']},plan,calendar)
    assert len(live)==49 and 'HON' not in set(live.ticker)
    assert quality['excluded_assets']['HON']['reason']=='corporate_transition_embargo'
    events={symbol:['2026-10-01'] for symbol in ALL_SYMBOLS[:11]}
    with pytest.raises(ValueError,match='Insufficient eligible assets'):
        snapshot(frames,events,plan,calendar)


def test_missing_context_blocks_generation(setup):
    clock,plan,calendar,frames=setup
    bad={symbol:frame.copy() for symbol,frame in frames.items()}
    bad['SPY'].loc['2026-10-29','close']=np.nan
    with pytest.raises(ValueError,match='SPY context'):
        snapshot(bad,{},plan,calendar)


@pytest.fixture
def bundle(tmp_path,setup):
    clock,plan,calendar,frames=setup
    live,quality=snapshot(frames,{},plan,calendar)
    path=export_bundle(tmp_path,live,quality,plan,clock)
    return path,live,quality


def test_export_formats_and_immutability(bundle,setup):
    path,live,quality=bundle
    manifest=verify_bundle(path)
    assert manifest['rows']==50 and manifest['columns']==COLUMNS
    assert len(list(path.iterdir()))==6
    clock,plan,_,_=setup
    with pytest.raises(FileExistsError):
        export_bundle(path.parent.parent,live,quality,plan,clock)
    with (path/'live.csv').open('a') as stream:stream.write('corruption')
    with pytest.raises(ValueError,match='checksum'):
        verify_bundle(path)


def test_state_checksum_and_roundtrip(tmp_path,setup):
    clock,plan,calendar,frames=setup
    path=tmp_path/'state.zip'
    write_state(path,frames,{'HON':['2026-06-29']},'2026-10-29')
    restored,metadata=read_state(path)
    assert metadata['events']['HON']==['2026-06-29']
    assert restored['AAPL'].index.max()==pd.Timestamp('2026-10-29')
    pd.testing.assert_frame_equal(restored['AAPL'],frames['AAPL'].loc[:'2026-10-29'],check_dtype=False,check_freq=False)


class FakeStorage:
    def __init__(self,fail=None):
        self.objects={}
        self.writes=[]
        self.fail=fail
    def get(self,key,optional=False):
        return self.objects.get(key)
    def put(self,key,data,replace=False,content_type=None):
        if self.fail and self.fail in key:
            raise RuntimeError('simulated storage failure')
        if not replace and key in self.objects and self.objects[key]!=data:
            raise RuntimeError('immutable object differs')
        self.objects[key]=data
        self.writes.append(key)


def test_partial_upload_is_not_discoverable(bundle,setup):
    path,_,_=bundle
    store=FakeStorage(fail='quality_report.json')
    with pytest.raises(RuntimeError):
        publish_bundle(store,path,clock=lambda:setup[0])
    assert 'daily/latest.json' not in store.objects
    assert not any(key.startswith('rounds/') for key in store.objects)
    store.fail=None
    publish_bundle(store,path,clock=lambda:setup[0])
    assert store.writes[-1]=='daily/latest.json'
    commit=json.loads(store.objects['rounds/2026-10-30/v1.json'])
    manifest=json.loads(store.objects[commit['manifest']])
    assert manifest['rows']==50


def test_deadline_crossed_during_upload_does_not_open_round(bundle,setup):
    path,_,_=bundle
    store=FakeStorage()
    clocks=iter([setup[0],setup[0],pd.Timestamp('2026-10-30T13:00:00Z')])
    with pytest.raises(ValueError,match='Deadline passed'):
        publish_bundle(store,path,clock=lambda:next(clocks))
    assert not any(key.startswith('rounds/') for key in store.objects)
    assert 'daily/latest.json' not in store.objects


def test_replay_can_never_be_published(tmp_path,setup):
    clock,plan,calendar,frames=setup
    live,quality=snapshot(frames,{},plan,calendar)
    path=export_bundle(tmp_path,live,quality,plan,clock,mode='replay')
    store=FakeStorage()
    with pytest.raises(ValueError,match='Replay or late'):
        publish_bundle(store,path,clock=lambda:clock)
    assert store.writes==[]


def test_late_night_publication_is_rejected_before_upload(bundle):
    store=FakeStorage()
    with pytest.raises(ValueError,match='Outside publication window'):
        publish_bundle(store,bundle[0],clock=lambda:pd.Timestamp('2026-10-30T05:00:00Z'))
    assert store.writes==[]


def test_state_concurrent_writer_not_overwritten(tmp_path):
    path=tmp_path/'state.zip'
    path.write_bytes(b'state data')
    store=FakeStorage()
    store.objects['state/latest.json']=b'another writer'
    with pytest.raises(RuntimeError,match='Concurrent state writer'):
        save_state(store,path,None)
    assert store.objects['state/latest.json']==b'another writer'


def test_remote_corruption_does_not_commit_round(bundle,setup):
    class CorruptStorage(FakeStorage):
        def get(self,key,optional=False):
            data=super().get(key,optional)
            return b'corrupt' if key.endswith('live.csv') else data
    store=CorruptStorage()
    with pytest.raises(RuntimeError,match='checksum differs'):
        publish_bundle(store,bundle[0],clock=lambda:setup[0])
    assert not any(key.startswith('rounds/') for key in store.objects)


def test_missing_volume_quality_metrics_are_json_safe():
    from worker.stocks_history.pipeline import assemble_sessions
    from .core import schedule_through
    schedule=schedule_through('2026-11-04').loc['2026-11-04':'2026-11-04']
    raw=pd.DataFrame({'open':[100.],'high':[101.],'low':[99.],
                      'close':[100.],'volume':[100000.]},index=schedule.index)
    aggregate=pd.DataFrame({'open':[np.nan],'close':[np.nan],
                            'volume':[np.nan],'complete':[False]},index=schedule.index)
    result,quality=assemble_sessions('AAPL',raw,raw.copy(),aggregate,{},[],schedule)
    assert pd.isna(result.volume.iloc[0])
    assert quality['median_rth_to_provider_daily_volume_ratio'] is None
    json.dumps(quality,allow_nan=False)


def test_cloud_credentials_use_environment_without_local_secret_file(tmp_path,monkeypatch):
    from worker.stocks_history.client import credentials
    monkeypatch.setenv('APCA_API_KEY_ID','test-key')
    monkeypatch.setenv('APCA_API_SECRET_KEY','test-secret')
    assert credentials(tmp_path/'does-not-exist')=={
        'APCA-API-KEY-ID':'test-key','APCA-API-SECRET-KEY':'test-secret'}
    monkeypatch.delenv('APCA_API_SECRET_KEY')
    with pytest.raises(RuntimeError,match='Both Alpaca'):
        credentials(tmp_path/'does-not-exist')


def test_pagination_loop_is_rejected_and_receipt_has_no_credentials(tmp_path):
    class BrokenClient:
        def get(self,route,params):
            return {'bars':{},'next_page_token':'same-token'},'request-id'
    collector=Collector(tmp_path/'source',client=BrokenClient())
    with pytest.raises(ValueError,match='pagination'):
        collector.pages('bars','/v2/stocks/bars',{'symbols':'AAPL'})
    assert all('APCA' not in json.dumps(receipt) for receipt in collector.receipts)


def test_local_historical_replay_matches_released_dataset():
    state=Path('artifacts/stock-daily-v1/state.zip')
    if not state.exists() or not (OUTPUT/'validation.parquet').exists():
        pytest.skip('Local historical artefacts are not checked into the repository')
    frames,metadata=read_state(state)
    plan,calendar=session_plan(pd.Timestamp('2026-10-30T01:00:00Z'),'2026-10-29')
    actual,_=snapshot(frames,metadata['events'],plan,calendar)
    expected=pd.read_parquet(OUTPUT/'validation.parquet')
    expected=expected.loc[pd.to_datetime(expected.date)==pd.Timestamp('2026-10-29'),COLUMNS].reset_index(drop=True)
    for name in ['date','target_date']:expected[name]=pd.to_datetime(expected[name])
    # Fresh vendor revisions in a later state may differ slightly. Use the
    # original historical bootstrap to test the exact published contract.
    from .state import bootstrap
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        seed=Path(directory)/'seed.zip'
        bootstrap(seed)
        frames,metadata=read_state(seed)
        actual,_=snapshot(frames,metadata['events'],plan,calendar)
    pd.testing.assert_frame_equal(actual,expected,check_dtype=False,check_exact=True)


def test_incremental_source_update_preserves_calendar_and_produces_live(tmp_path,monkeypatch):
    from . import feed
    clock=pd.Timestamp('2026-11-05T02:00:00Z')
    plan,calendar=session_plan(clock,'2026-11-04')
    index=calendar.loc[:'2026-11-04'].index
    full=synthetic_daily(index)
    full['volume']=1000000.
    sessions={}
    for symbol in ALL_SYMBOLS:
        frame=full.loc[:'2026-10-30'].copy()
        frame['raw_rth_volume']=frame.volume
        frame['closing_auction_volume_added']=1000.
        sessions[symbol]=frame
    refresh=calendar.loc['2026-10-19':'2026-11-04']
    class Source:
        def __init__(self,directory):
            Path(directory).mkdir()
            self.receipts=[]
        def bars(self,name,start,end,timeframe='1Day',adjustment='raw'):
            if timeframe=='1Day':
                frame=full[['open','high','low','close','volume']].copy()
                frame['timestamp']=frame.index.tz_localize('America/New_York').tz_convert('UTC')
                return {symbol:frame.reset_index(drop=True) for symbol in ALL_SYMBOLS}
            rows=[]
            for day,session in refresh.iterrows():
                for t in pd.date_range(session.open,session.close-pd.Timedelta(minutes=30),freq='30min'):
                    rows.append({'timestamp':t,'open':100.,'high':101.,'low':99.,'close':100.,'volume':1000.})
            return {symbol:pd.DataFrame(rows) for symbol in ALL_SYMBOLS}
        def pages(self,name,route,params):
            if name=='actions':return [{'corporate_actions':{}}]
            return [{'auctions':{symbol:[{'d':str(day.date()),'c':[{
                'c':'6','p':100.,'s':1000,'t':session.close.isoformat(),'x':'Q'}]}
                for day,session in refresh.iterrows()] for symbol in ALL_SYMBOLS}}]
    monkeypatch.setattr(feed,'Collector',Source)
    metadata={'observation_date':'2026-10-30','events':{symbol:[] for symbol in ALL_SYMBOLS}}
    updated,events,quality,receipts=feed.update_history(sessions,metadata,plan,calendar,tmp_path/'source',clock)
    assert updated['AAPL'].index.equals(index)
    assert quality['AAPL']['latest_prices_present']
    assert updated['AAPL'].loc['2026-11-04','raw_rth_volume']==14000
    live,_=snapshot(updated,events,plan,calendar)
    assert len(live)>=40 and live.date.iloc[0]==pd.Timestamp('2026-11-04')
