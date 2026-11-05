import numpy as np
import pandas as pd

from .config import FEATURES, TARGET
from .pipeline import (calendar, closing_auction_volumes, labeled_rows, make_features, regular_sessions,
                       split_factors, split_rows, wilder_rsi)


def synthetic_daily(index):
    phase = np.arange(len(index))
    close = 100 * np.exp(.0003 * phase + .01 * np.sin(phase/4))
    volume = 1_000_000 + 1000 * phase + 10000*np.cos(phase)
    return pd.DataFrame({'open':close*.998, 'close':close, 'high':close*1.01,
                         'low':close*.99,'volume':volume,'dollar_volume':close*volume,
                         'raw_open':close*.998,'raw_close':close},index=index)


def test_future_prices_and_labels_cannot_change_past_features():
    index = pd.bdate_range('2020-01-01',periods=360)
    daily = synthetic_daily(index)
    market = synthetic_daily(index)
    before = make_features(daily,market)
    altered = daily.copy()
    altered.loc[index[300]:,['open','high','low','close']] *= 9
    altered.loc[index[300]:,'volume'] *= 3
    after = make_features(altered,market)
    pd.testing.assert_frame_equal(before.loc[:index[299]],after.loc[:index[299]])
    pd.testing.assert_frame_equal(before.loc[:index[299]],make_features(daily.iloc[:300],market.iloc[:300]))


def test_future_split_unit_rescaling_preserves_features():
    index = pd.bdate_range('2020-01-01',periods=360)
    daily = synthetic_daily(index)
    market = synthetic_daily(index)
    rescaled = daily.copy()
    rescaled[['open','high','low','close']] /= 4
    rescaled['volume'] *= 4
    pd.testing.assert_frame_equal(make_features(daily,market),make_features(rescaled,market),rtol=1e-9,atol=1e-9)


def test_missing_session_is_not_skipped_for_next_session_target():
    index = pd.bdate_range('2023-12-20',periods=12)
    daily = synthetic_daily(index)
    daily.loc[index[4],['raw_open','raw_close']] = np.nan
    features = pd.DataFrame(0.1,index=index,columns=FEATURES)
    rows,_ = labeled_rows('AAPL',features,daily)
    assert index[3] not in set(rows.date)
    row = rows.loc[rows.date == index[2]].iloc[0]
    assert row.target_date == index[3]
    assert np.isclose(row[TARGET], daily.loc[index[3],'raw_close']/daily.loc[index[3],'raw_open']-1)


def test_partition_uses_target_date_and_keeps_same_dates_together():
    frame = pd.DataFrame({'date':pd.to_datetime(['2023-12-28','2023-12-28','2023-12-29','2023-12-29']),
                          'target_date':pd.to_datetime(['2023-12-29','2023-12-29','2024-01-02','2024-01-02']),
                          'ticker':['MSFT','AAPL','MSFT','AAPL']})
    train,validation = split_rows(frame)
    assert len(train)==len(validation)==2
    assert train.target_date.max()<validation.target_date.min()
    assert not set(train.date)&set(validation.date)


def test_short_session_excludes_post_close_and_accepts_all_seven_bars():
    date = pd.Timestamp('2024-11-29')
    opening = pd.Timestamp('2024-11-29T14:30:00Z')
    closing = pd.Timestamp('2024-11-29T18:00:00Z')
    schedule = pd.DataFrame({'open':[opening],'close':[closing]},index=pd.DatetimeIndex([date],name='date'))
    bars = pd.DataFrame({'timestamp':pd.date_range(opening,periods=8,freq='30min'),
                         'open':100.,'high':101.,'low':99.,'close':100.5,'volume':100.})
    bars.loc[7,'volume']=1_000_000
    daily,quality=regular_sessions(bars,schedule)
    assert daily.loc[date,'volume']==700
    assert daily.loc[date,'complete']
    assert quality['incomplete_sessions']==[]
    incomplete,_=regular_sessions(bars.drop(index=3),schedule)
    assert not incomplete.loc[date,'complete']


def test_rsi_has_wilder_seed_and_restarts_after_missing():
    close=pd.Series(list(range(1,17))+[np.nan]+list(range(1,17)),dtype=float)
    actual=wilder_rsi(close)
    assert actual.iloc[:14].isna().all()
    assert actual.iloc[14]==1
    assert actual.iloc[17:31].isna().all()
    assert actual.iloc[31]==1
    assert wilder_rsi(pd.Series([5.]*20)).iloc[-1]==.5


def test_volume_recovers_split_factor_despite_cent_rounded_prices():
    index=pd.date_range('2020-01-01',periods=4)
    raw=pd.DataFrame({'volume':[1000001.,2000001.,4000001.,5000001.]},index=index)
    adjusted=raw.copy()
    adjusted.loc[index[:2],'volume'] *= 4
    factors,_=split_factors(raw,adjusted)
    np.testing.assert_array_equal(factors,[4,4,1,1])


def test_event_embargo_blocks_full_feature_windows_and_event_target():
    index=pd.bdate_range('2020-01-01',periods=500)
    daily=synthetic_daily(index)
    features=pd.DataFrame(.1,index=index,columns=FEATURES)
    event=index[250]
    rows,_=labeled_rows('IBM',features,daily,[str(event.date())])
    assert index[249] not in set(rows.date)
    assert index[450] not in set(rows.date)
    assert index[451] in set(rows.date)


def test_calendar_covers_requested_bounds_and_historical_closures():
    schedule=calendar()
    assert str(schedule.index[0].date())=='2016-01-04'
    assert str(schedule.index[-1].date())=='2026-10-30'
    assert pd.Timestamp('2018-12-05') not in schedule.index
    assert pd.Timestamp('2025-01-09') not in schedule.index


def test_recursive_rsi_restarts_at_corporate_transition():
    index=pd.bdate_range('2020-01-01',periods=360)
    daily=synthetic_daily(index)
    market=synthetic_daily(index)
    changed=daily.copy()
    changed.loc[:index[249],'close'] *= 3
    reset=[str(index[250].date())]
    first=make_features(daily,market,reset_dates=reset)
    second=make_features(changed,market,reset_dates=reset)
    pd.testing.assert_series_equal(first.rsi_14d.loc[index[265]:],second.rsi_14d.loc[index[265]:])


def test_closing_auction_counts_actual_trades_once_without_reference_duplicates():
    date=pd.Timestamp('2024-11-29')
    schedule=pd.DataFrame({'close':[pd.Timestamp('2024-11-29T18:00:00Z')]},index=[date])
    actual={'c':'6','p':100.,'s':1000,'t':'2024-11-29T18:00:00.1Z','x':'Q'}
    official={**actual,'c':'M','t':'2024-11-29T18:00:00.2Z'}
    mirrored={**actual,'x':'T'}
    earlier={**actual,'t':'2024-11-29T17:59:59Z','s':200}
    days=[{'d':'2024-11-29','c':[actual,official,earlier,mirrored]},
          {'d':'2024-11-29','c':[actual]}]
    assert closing_auction_volumes(days,schedule).iloc[0]==1000
    assert pd.isna(closing_auction_volumes([],schedule).iloc[0])
