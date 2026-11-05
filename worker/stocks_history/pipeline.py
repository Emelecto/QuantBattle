import gzip
import hashlib
import json
from functools import lru_cache
from fractions import Fraction

import exchange_calendars as xc
import numpy as np
import pandas as pd

from .config import (FEATURES, FIRST_TARGET, METADATA, OUTPUT, RAW_END,
                     RAW_START, TARGET, TRAIN_END, VALIDATION_START)


def calendar():
    schedule = xc.get_calendar('XNYS', start=RAW_START, end='2026-11-02').schedule
    schedule = schedule.loc[RAW_START:RAW_END, ['open', 'close']].copy()
    schedule.index = pd.DatetimeIndex(schedule.index).tz_localize(None)
    schedule.index.name = 'date'
    return schedule


def load_bars(symbol, kind):
    records = []
    directory = OUTPUT / '_internal' / 'responses' / symbol / kind
    files = sorted(directory.glob('*.json.gz'))
    if not files:
        raise ValueError(f'No cached bars for {symbol}/{kind}')
    for path in files:
        with gzip.open(path, 'rt', encoding='utf-8') as stream:
            payload = json.load(stream)
        for key, rows in (payload.get('bars') or {}).items():
            if key != symbol:
                raise ValueError(f'Unexpected mapped symbol: {symbol}/{key}')
            records.extend(rows)
    if payload.get('next_page_token'):
        raise ValueError(f'Incomplete download for {symbol}/{kind}')
    frame = pd.DataFrame(records).rename(columns={
        't': 'timestamp', 'o': 'open', 'h': 'high', 'l': 'low',
        'c': 'close', 'v': 'volume', 'n': 'trade_count', 'vw': 'vwap'})
    frame['timestamp'] = pd.to_datetime(frame.timestamp, utc=True)
    if frame.timestamp.duplicated().any():
        raise ValueError(f'Duplicate timestamps for {symbol}/{kind}')
    return frame.sort_values('timestamp').reset_index(drop=True)


def regular_sessions(intraday, schedule):
    """Aggregate clock-aligned half-hours inside [official open, official close)."""
    frame = intraday.copy()
    frame['date'] = frame.timestamp.dt.tz_convert('America/New_York').dt.tz_localize(None).dt.normalize()
    frame = frame.join(schedule, on='date', rsuffix='_session')
    keep = (frame.timestamp >= frame.open_session) & (frame.timestamp < frame.close_session)
    frame = frame.loc[keep].copy()
    if frame.empty:
        raise ValueError('No regular-session data')
    if not (frame.timestamp + pd.Timedelta(minutes=30) <= frame.close_session).all():
        raise ValueError('An intraday bar crosses the official session close')
    invalid = (
        ~np.isfinite(frame[['open', 'high', 'low', 'close', 'volume']]).all(axis=1)
        | (frame[['open', 'high', 'low', 'close']] <= 0).any(axis=1)
        | (frame.volume < 0)
        | (frame.high < frame[['open', 'close', 'low']].max(axis=1))
        | (frame.low > frame[['open', 'close', 'high']].min(axis=1))
    )
    bad_days = sorted(frame.loc[invalid, 'date'].dt.strftime('%Y-%m-%d').unique().tolist())
    grouped = frame.groupby('date', sort=True)
    daily = grouped.agg(open=('open', 'first'), high=('high', 'max'),
                        low=('low', 'min'), close=('close', 'last'),
                        volume=('volume', 'sum'), bars=('timestamp', 'size'),
                        first_timestamp=('timestamp', 'min'), last_timestamp=('timestamp', 'max'))
    daily = daily.reindex(schedule.index)
    expected = ((schedule.close - schedule.open) / pd.Timedelta(minutes=30)).astype(int)
    complete = (daily.bars == expected) & (daily.first_timestamp == schedule.open) & (
        daily.last_timestamp == schedule.close - pd.Timedelta(minutes=30))
    daily['complete'] = complete.fillna(False)
    if bad_days:
        daily.loc[pd.to_datetime(bad_days), 'complete'] = False
    return daily, {'bad_intraday_days': bad_days,
                   'incomplete_sessions': schedule.index[~daily.complete].strftime('%Y-%m-%d').tolist(),
                   'intraday_rows': len(intraday), 'regular_half_hours': len(frame)}


def daily_prices(frame, schedule):
    frame = frame.copy()
    frame['date'] = frame.timestamp.dt.tz_convert('America/New_York').dt.tz_localize(None).dt.normalize()
    if frame.date.duplicated().any():
        raise ValueError('Duplicate daily sessions')
    return frame.set_index('date').reindex(schedule.index)


def split_factors(raw, adjusted):
    ratios = adjusted.volume / raw.volume
    segments = (ratios.pct_change(fill_method=None).abs().gt(0.0001) | ratios.isna()).cumsum()
    factors = pd.Series(np.nan, index=ratios.index, dtype=float)
    uncertainty = pd.Series(np.nan, index=ratios.index, dtype=float)
    for _, indexes in ratios.groupby(segments).groups.items():
        keep = indexes[ratios.loc[indexes].notna()]
        if not len(keep):
            continue
        total_raw = raw.loc[keep, 'volume'].sum()
        factor = float(Fraction(float(adjusted.loc[keep, 'volume'].sum()/total_raw)).limit_denominator(1000000))
        factors.loc[keep] = factor
        uncertainty.loc[keep] = len(keep)/total_raw + 1e-9
    return factors, uncertainty


@lru_cache(maxsize=1)
def auction_records():
    result = {}
    files = sorted((OUTPUT / '_internal' / 'auction_pages').glob('*.json.gz'))
    if not files:
        raise ValueError('Closing auction volume audit is missing')
    for path in files:
        with gzip.open(path,'rt',encoding='utf-8') as stream:
            payload=json.load(stream)
        for symbol,days in (payload.get('auctions') or {}).items():
            for day in days:
                result.setdefault(symbol,[]).append(day)
    if payload.get('next_page_token'):
        raise ValueError('Closing auction download is incomplete')
    return result


def closing_auction_volumes(days, schedule):
    volumes = pd.Series(np.nan,index=schedule.index,dtype=float)
    records = {}
    duplicates = 0
    for day in days:
        date = pd.Timestamp(day['d'])
        if date not in schedule.index:
            continue
        # '6' is an actual closing trade and updates volume. 'M' is an
        # official-close reference and must NOT be added a second time.
        trades = [trade for trade in day.get('c') or [] if trade.get('c') == '6']
        for trade in trades:
            # Some source messages mirror the SAME nanosecond/price/size on
            # two venue codes. Counting both demonstrably exceeds daily volume.
            # Keep the original responses; collapse matching economic prints.
            key=(trade['t'],trade['p'],trade['s'],trade['c'])
            if key in records.get(date,{}):
                duplicates += 1
            records.setdefault(date,{})[key]=trade
    for date,trades in records.items():
        # Earlier prints are already inside an RTH half-hour; do not double-count.
        volumes.at[date]=sum(trade['s'] for trade in trades.values()
                             if pd.Timestamp(trade['t']) >= schedule.at[date,'close'])
    volumes.attrs['matching_auction_prints_collapsed'] = duplicates
    return volumes


def make_daily(symbol, schedule):
    raw = daily_prices(load_bars(symbol, 'daily_raw'), schedule)
    adjusted = daily_prices(load_bars(symbol, 'daily_split'), schedule)
    intraday, quality = regular_sessions(load_bars(symbol, 'raw'), schedule)
    return assemble_sessions(symbol, raw, adjusted, intraday, quality,
                             auction_records().get(symbol, []), schedule)


def assemble_sessions(symbol, raw, adjusted, intraday, quality, auctions, schedule):
    """Shared source normalization for historical and incremental daily builds."""
    quality = quality.copy()
    auction_volume = closing_auction_volumes(auctions, schedule)
    rth_volume = intraday.volume + auction_volume
    volume_valid = intraday.complete & auction_volume.notna()
    exceeds_daily = rth_volume > raw.volume + 1
    volume_valid &= ~exceeds_daily
    volume_ratios = (rth_volume / raw.volume).dropna()
    quality.update({
        'median_rth_to_provider_daily_volume_ratio': finite_or_none(volume_ratios.median()) if not volume_ratios.empty else None,
        'missing_closing_auction_sessions': schedule.index[auction_volume.isna()].strftime('%Y-%m-%d').tolist(),
        'matching_auction_prints_collapsed': auction_volume.attrs['matching_auction_prints_collapsed'],
        'reconstructed_volume_exceeds_daily_total_sessions': schedule.index[exceeds_daily].strftime('%Y-%m-%d').tolist(),
        'daily_vs_intraday_close_different_sessions': int(((raw.close - intraday.close).abs() > 0.005).sum()),
    })
    result, quality = normalize_sessions(symbol, raw, adjusted, rth_volume, volume_valid, quality)
    result['closing_auction_volume_added'] = auction_volume
    return result, quality


def finite_or_none(value):
    return float(value) if pd.notna(value) and np.isfinite(value) else None


def normalize_sessions(symbol, raw, adjusted, rth_volume, volume_valid, quality=None):
    """Identical price/unit rules with freshly reconstructed or stored RTH volume."""
    quality = (quality or {}).copy()
    schedule_index = raw.index
    # Daily prices use the provider's daily trade-condition rules; unlike the
    # 15:30 half-hour close they can include the official closing print at 16:00.
    # Volume is deliberately the sum of eligible 30-minute bars in RTH only.
    # Provider split-adjusted prices are rounded to cents. Inferring a factor
    # from them would corrupt old low-price returns. Split-adjusted volume
    # preserves the ratio to within one share instead.
    factor, uncertainty = split_factors(raw, adjusted)
    adjusted_check = pd.DataFrame({key: raw[key] / factor for key in ['open', 'high', 'low', 'close']})
    residual_abs = (adjusted_check - adjusted[['open', 'high', 'low', 'close']]).abs().max(axis=1)
    volume_residual = (raw.volume * factor - adjusted.volume).abs()
    tolerance = 0.00501 + raw[['open','high','low','close']].max(axis=1) * uncertainty / factor.pow(2)
    if (residual_abs > tolerance).any() or (volume_residual > 1.01 + raw.volume * uncertainty).any():
        raise ValueError(f'Unresolved split adjustment for {symbol}')
    price_valid = (np.isfinite(raw[['open', 'high', 'low', 'close']]).all(axis=1)
                   & (raw[['open', 'high', 'low', 'close']] > 0).all(axis=1)
                   & (raw.high >= raw[['open', 'close', 'low']].max(axis=1))
                   & (raw.low <= raw[['open', 'close', 'high']].min(axis=1)))
    valid = volume_valid & price_valid & factor.notna()
    result = adjusted_check.copy()
    result['volume'] = rth_volume * factor
    result['dollar_volume'] = raw.close * rth_volume
    result['raw_open'] = raw.open
    result['raw_close'] = raw.close
    result['raw_rth_volume'] = rth_volume
    result['provider_daily_volume'] = raw.volume
    result['split_factor'] = factor
    result['valid_session'] = valid
    # A missing intraday volume interval does not invalidate independently
    # observed daily OHLC or all 200 subsequent price-return observations.
    result.loc[~price_valid, ['open', 'high', 'low', 'close']] = np.nan
    result.loc[~volume_valid, 'volume'] = np.nan
    result.loc[~valid, 'dollar_volume'] = np.nan
    # An absent observation stays absent; it never shifts subsequent targets.
    result.loc[~price_valid, ['raw_open', 'raw_close']] = np.nan
    quality.update({
        'valid_sessions': int(valid.sum()), 'expected_sessions': len(schedule_index),
        'invalid_price_sessions': schedule_index[~price_valid].strftime('%Y-%m-%d').tolist(),
        'max_adjusted_price_rounding_error_usd': finite_or_none(residual_abs.max()),
        'max_adjusted_volume_rounding_error_shares': finite_or_none(volume_residual.max()),
        'split_factor_changes': [str(day.date()) for day in factor.index[factor.ne(factor.shift()) & factor.notna()][1:]],
        'source_adjusted_close_return_above_35pct': {
            str(day.date()): float(value) for day,value in result.close.pct_change(fill_method=None).items()
            if pd.notna(value) and abs(value) > .35},
    })
    return result, quality


def wilder_rsi(close, period=14):
    """Wilder RSI, SMA seed, restart after missing observations; neutral flat=0.5."""
    result = pd.Series(np.nan, index=close.index, dtype=float)
    gain, loss = None, None
    differences = []
    previous = None
    for index, price in close.items():
        if pd.isna(price):
            gain, loss, previous, differences = None, None, None, []
            continue
        if previous is not None:
            delta = price - previous
            up, down = max(delta, 0), max(-delta, 0)
            if gain is None:
                differences.append((up, down))
                if len(differences) == period:
                    gain, loss = np.mean(differences, axis=0)
            else:
                gain = ((period - 1) * gain + up) / period
                loss = ((period - 1) * loss + down) / period
            if gain is not None:
                result.at[index] = 0.5 if gain + loss == 0 else gain / (gain + loss)
        previous = price
    return result


def make_features(daily, market, reset_dates=None):
    close, volume = daily.close, daily.volume
    output = pd.DataFrame(index=daily.index)
    returns = close.pct_change(fill_method=None)
    market_returns = market.close.pct_change(fill_method=None)
    # Window counts are sessions, with explicit missing-value propagation.
    # Require a contiguous window for long returns too, not just both endpoints.
    for n in [1, 2, 5, 10, 20, 60, 120, 200]:
        value = close / close.shift(n) - 1
        output[f'return_{n}d'] = value.where(close.rolling(n + 1).count() == n + 1)
    for n in [5, 20, 60]:
        output[f'volatility_{n}d'] = returns.rolling(n, min_periods=n).std(ddof=1)
    for n in [5, 20, 50, 200]:
        output[f'distance_sma_{n}d'] = close / close.rolling(n, min_periods=n).mean() - 1
    rsi_close = close.copy()
    if reset_dates:
        indexes = rsi_close.index.intersection(pd.to_datetime(reset_dates))
        rsi_close.loc[indexes] = np.nan
    output['rsi_14d'] = wilder_rsi(rsi_close)
    for n in [5, 20]:
        output[f'relative_volume_{n}d'] = volume / volume.shift(1).rolling(n, min_periods=n).mean()
    output['volume_change_1d'] = volume / volume.shift(1) - 1
    output['log_dollar_volume_20d'] = np.log1p(daily.dollar_volume.rolling(20, min_periods=20).mean())
    output['intraday_range'] = (daily.high - daily.low) / close
    output['intraday_return'] = close / daily.open - 1
    output['overnight_gap'] = daily.open / close.shift(1) - 1
    output['close_position'] = (close - daily.low) / (daily.high - daily.low)
    output['drawdown_60d'] = close / close.rolling(60, min_periods=60).max() - 1
    for n in [1, 5, 20]:
        output[f'market_return_{n}d'] = (market.close / market.close.shift(n) - 1).where(
            market.close.rolling(n + 1).count() == n + 1)
    output['market_volatility_20d'] = market_returns.rolling(20, min_periods=20).std(ddof=1)
    output['excess_return_20d'] = output.return_20d - output.market_return_20d
    output['beta_60d'] = returns.rolling(60, min_periods=60).cov(market_returns, ddof=1) / market_returns.rolling(60, min_periods=60).var(ddof=1)
    output['correlation_market_60d'] = returns.rolling(60, min_periods=60).corr(market_returns)
    return output[FEATURES].replace([np.inf, -np.inf], np.nan)


def labeled_rows(symbol, features, daily, blocked_days=None):
    frame = features.copy()
    frame[TARGET] = (daily.raw_close / daily.raw_open - 1).shift(-1)
    frame['date'] = frame.index
    frame['target_date'] = pd.Series(frame.index, index=frame.index).shift(-1)
    base_invalid = frame[FEATURES + [TARGET]].isna().any(axis=1)
    touches = pd.Series(False, index=frame.index)
    if blocked_days:
        # A mechanical merger/spin-off transition is quarantined through all
        # trailing 200-session windows. It is never silently treated as alpha.
        bad = pd.Series(frame.index.isin(pd.to_datetime(blocked_days)), index=frame.index)
        touches = bad.rolling(201, min_periods=1).max().astype(bool) | bad.shift(-1, fill_value=False)
        frame.loc[touches, FEATURES + [TARGET]] = np.nan
    candidates = frame.target_date.between(pd.Timestamp(FIRST_TARGET), pd.Timestamp(RAW_END))
    excluded = frame.loc[candidates, FEATURES + [TARGET]].isna().any(axis=1)
    excluded_by_column = frame.loc[candidates, FEATURES + [TARGET]].isna().sum().astype(int).to_dict()
    frame = frame.loc[candidates].dropna(subset=FEATURES + [TARGET, 'target_date']).copy()
    frame['ticker'] = symbol
    frame['asset_id'] = f'QB-US-{symbol}'
    frame['id'] = [hashlib.sha256(f'stocks-oc-v1|{symbol}|{day:%Y-%m-%d}'.encode()).hexdigest()[:24]
                   for day in frame.date]
    return frame[METADATA + FEATURES + [TARGET]].reset_index(drop=True), {
        'candidate_rows': int(candidates.sum()), 'excluded_rows': int(excluded.sum()),
        'excluded_observation_dates': excluded.index[excluded].strftime('%Y-%m-%d').tolist(),
        'excluded_by_column': excluded_by_column,
        'exclusion_reasons_disjoint': {
            'source_gap_or_undefined_outside_embargo': int((base_invalid & ~touches & candidates).sum()),
            'corporate_transition_embargo': int((touches & candidates).sum()),
        },
        'corporate_transition_dates': blocked_days or [],
    }


def split_rows(frame):
    train = frame.loc[frame.target_date <= pd.Timestamp(TRAIN_END)].copy()
    validation = frame.loc[frame.target_date >= pd.Timestamp(VALIDATION_START)].copy()
    if len(train) + len(validation) != len(frame):
        raise ValueError('Rows outside the configured target-date partitions')
    for part in [train, validation]:
        part.sort_values(['date', 'ticker'], inplace=True, ignore_index=True)
    return train, validation
