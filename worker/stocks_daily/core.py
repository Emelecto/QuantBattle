import hashlib
import json
from datetime import time

import exchange_calendars as xc
import numpy as np
import pandas as pd

from worker.stocks_history.config import FEATURES, METADATA, RAW_START, SYMBOLS, VERSION
from worker.stocks_history.pipeline import make_features

ALL_SYMBOLS = SYMBOLS + ['SPY']
COLUMNS = METADATA + FEATURES
NY = 'America/New_York'


def schedule_through(day):
    end = pd.Timestamp(day).normalize() + pd.Timedelta(days=40)
    schedule = xc.get_calendar('XNYS', start=RAW_START, end=str(end.date())).schedule
    schedule = schedule[['open', 'close']].copy()
    schedule.index = pd.DatetimeIndex(schedule.index).tz_localize(None)
    schedule.index.name = 'date'
    return schedule


def session_plan(now, observation=None):
    now = pd.Timestamp(now)
    if now.tzinfo is None:
        raise ValueError('Clock must include timezone')
    now = now.tz_convert('UTC')
    calendar = schedule_through(now.tz_convert(NY).date() if observation is None else observation)
    if observation is None:
        completed = calendar.index[calendar.close + pd.Timedelta(minutes=20) <= now]
        if not len(completed):
            raise ValueError('No completed session')
        observation = completed[-1]
    observation = pd.Timestamp(observation).normalize()
    if observation not in calendar.index:
        raise ValueError('Observation date is not an exchange session')
    position = calendar.index.get_loc(observation)
    target = calendar.index[position + 1]
    if now < calendar.at[observation, 'close'] + pd.Timedelta(minutes=20):
        raise ValueError('Observation session is not yet mature (close + 20 minutes)')
    deadline = pd.Timestamp.combine(target.date(), time(9)).tz_localize(NY).tz_convert('UTC')
    return {'observation_date': str(observation.date()), 'target_date': str(target.date()),
            'submission_deadline': deadline.isoformat(), 'target_open': calendar.at[target, 'open'].isoformat(),
            'target_close': calendar.at[target, 'close'].isoformat()}, calendar


def publication_window(plan):
    date=plan['observation_date']
    opening=pd.Timestamp(date+' 20:30').tz_localize(NY).tz_convert('UTC')
    closing=pd.Timestamp(date+' 22:00').tz_localize(NY).tz_convert('UTC')
    return opening,closing


def in_embargo(calendar, observation, target, events):
    index = calendar.index
    position = index.get_loc(pd.Timestamp(observation))
    for event in pd.to_datetime(events):
        event_position = index.searchsorted(event)
        if event == pd.Timestamp(target) or 0 <= position - event_position <= 200:
            return True
    return False


def snapshot(sessions, events, plan, calendar, min_assets=40):
    """Slice BEFORE feature computation; never inspect the target's prices."""
    observation = pd.Timestamp(plan['observation_date'])
    target = pd.Timestamp(plan['target_date'])
    frames = {symbol: frame.loc[:observation].copy() for symbol,frame in sessions.items()}
    expected = calendar.loc[:observation].index
    for symbol in ALL_SYMBOLS:
        if symbol not in frames or not frames[symbol].index.equals(expected):
            raise ValueError(f'History is not calendar-aligned: {symbol}')
    if not np.isfinite(frames['SPY'].loc[observation, 'close']):
        raise ValueError('SPY context is missing for the observation session')
    market = frames['SPY']
    rows, excluded = [], {}
    for symbol in SYMBOLS:
        if in_embargo(calendar, observation, target, events.get(symbol, [])):
            excluded[symbol] = {'reason': 'corporate_transition_embargo'}
            continue
        features = make_features(frames[symbol], market, reset_dates=events.get(symbol, []))
        values = features.loc[observation]
        undefined = [name for name in FEATURES if not np.isfinite(values[name])]
        if undefined:
            excluded[symbol] = {'reason': 'undefined_features', 'features': undefined}
            continue
        row = {'id': hashlib.sha256(f'stocks-oc-v1|{symbol}|{observation:%Y-%m-%d}'.encode()).hexdigest()[:24],
               'asset_id': f'QB-US-{symbol}', 'ticker': symbol,
               'date': observation, 'target_date': target, **values.to_dict()}
        rows.append(row)
    if not 1 <= min_assets <= 50:
        raise ValueError('min_assets must be between 1 and 50')
    if len(rows) < min_assets:
        raise ValueError(f'Insufficient eligible assets: {len(rows)}; required {min_assets}; excluded={sorted(excluded)}')
    live = pd.DataFrame(rows, columns=COLUMNS).sort_values('ticker').reset_index(drop=True)
    if live.id.duplicated().any() or live.ticker.duplicated().any() or live.isna().any().any():
        raise ValueError('Invalid live identifiers/values')
    checks = {'columns_exactly_37': len(live.columns) == 37 and list(live.columns) == COLUMNS,
              'no_target_values': not any(name.startswith('target_return') for name in live.columns),
              'finite_32_features': bool(np.isfinite(live[FEATURES]).all().all()),
              'one_observation_date': live.date.nunique() == 1,
              'one_next_session_target': live.target_date.nunique() == 1 and target == calendar.index[calendar.index.get_loc(observation)+1],
              'rsi_valid': bool(live.rsi_14d.between(0,1).all()),
              'correlation_valid': bool(live.correlation_market_60d.between(-1.00000001,1.00000001).all()),
              'close_position_valid': bool(live.close_position.between(-1e-9,1+1e-9).all()),
              'coverage_sufficient': len(live) >= min_assets}
    if not all(checks.values()):
        raise ValueError('Live data quality checks failed')
    return live, {'eligible_assets': live.ticker.tolist(), 'excluded_assets': excluded,
                  'rows': len(live), 'columns': 37, 'min_assets': min_assets,
                  'checks': checks, 'historical_contract': VERSION}
