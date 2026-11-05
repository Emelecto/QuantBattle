import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

from worker.stocks_history.build import transitions
from worker.stocks_history.client import Client, now as received_at, sha256
from worker.stocks_history.config import ASOF, RAW_START, SYMBOLS
from worker.stocks_history.pipeline import (assemble_sessions, daily_prices,
    normalize_sessions, regular_sessions)
from .core import ALL_SYMBOLS


class Collector:
    def __init__(self, directory, client=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=False)
        self.client = client or Client()
        self.receipts = []

    def pages(self, name, route, params):
        result, tokens = [], set()
        params = params.copy()
        while True:
            payload, request_id = self.client.get(route, params)
            path = self.directory / f'{name}-{len(result):04d}.json.gz'
            with gzip.open(path,'wt',encoding='utf-8') as stream:
                json.dump(payload, stream, separators=(',',':'))
            receipt = {'route': route, 'params': params.copy(), 'received_at': received_at(),
                       'request_id': request_id, 'sha256': sha256(path), 'file': path.name}
            self.receipts.append(receipt)
            result.append(payload)
            token = payload.get('next_page_token')
            if not token:
                break
            if token in tokens or len(result) >= 1000:
                raise ValueError('Invalid market-data pagination')
            tokens.add(token)
            params['page_token'] = token
        return result

    def bars(self, name, start, end, timeframe='1Day', adjustment='raw'):
        pages = self.pages(name,'/v2/stocks/bars', {
            'symbols':','.join(ALL_SYMBOLS), 'start':start, 'end':end,
            'timeframe':timeframe, 'adjustment':adjustment, 'feed':'sip',
            'asof':ASOF, 'limit':10000, 'sort':'asc', 'currency':'USD'})
        records = {symbol:[] for symbol in ALL_SYMBOLS}
        for page in pages:
            for symbol,rows in (page.get('bars') or {}).items():
                if symbol not in records:
                    raise ValueError('Unexpected market-data instrument')
                records[symbol].extend(rows)
        frames = {}
        for symbol,rows in records.items():
            frame = pd.DataFrame(rows, columns=['t','o','h','l','c','v','n','vw']).rename(columns={
                't':'timestamp','o':'open','h':'high','l':'low','c':'close','v':'volume',
                'n':'trade_count','vw':'vwap'})
            frame['timestamp'] = pd.to_datetime(frame.timestamp, utc=True)
            for field in ['open','high','low','close','volume','trade_count','vwap']:
                frame[field] = pd.to_numeric(frame[field],errors='raise').astype(float)
            if frame.timestamp.duplicated().any():
                raise ValueError(f'Duplicate source bars: {symbol}')
            frames[symbol] = frame.sort_values('timestamp')
        return frames


def update_history(sessions, metadata, plan, calendar, directory, now, max_catchup=20):
    observation = pd.Timestamp(plan['observation_date'])
    schedule = calendar.loc[:observation]
    previous = pd.Timestamp(metadata['observation_date'])
    if previous > observation:
        raise ValueError('State is newer than observation; use replay mode')
    if previous not in schedule.index:
        raise ValueError('State date is not a session')
    gap = len(schedule.loc[previous:]) - 1
    if gap > max_catchup:
        raise ValueError(f'State requires {gap} catch-up sessions; maximum {max_catchup}')
    start = schedule.index[max(0, schedule.index.get_loc(previous)-9)]
    refresh_schedule = schedule.loc[start:]
    cutoff = min((observation+pd.Timedelta(days=1)).tz_localize('America/New_York').tz_convert('UTC'),
                 pd.Timestamp(now).tz_convert('UTC')-pd.Timedelta(minutes=20))
    source = Collector(directory)
    end = cutoff.isoformat()
    raw = {symbol:daily_prices(frame,schedule) for symbol,frame in
           source.bars('daily-raw',RAW_START,end).items()}
    adjusted = {symbol:daily_prices(frame,schedule) for symbol,frame in
                source.bars('daily-split',RAW_START,end,adjustment='split').items()}
    spin = {symbol:daily_prices(frame,schedule) for symbol,frame in
            source.bars('daily-spin',RAW_START,end,adjustment='spin-off').items()}
    intraday = source.bars('intraday',str(start.date()),end,timeframe='30Min')
    auction_pages = source.pages('auctions','/v2/stocks/auctions',{
        'symbols':','.join(ALL_SYMBOLS),'start':str(start.date()),'end':end,
        'asof':ASOF,'feed':'sip','limit':10000,'sort':'asc','currency':'USD'})
    auctions = {symbol:[] for symbol in ALL_SYMBOLS}
    for page in auction_pages:
        for symbol,days in (page.get('auctions') or {}).items():
            if symbol not in auctions:
                raise ValueError('Unexpected auction instrument')
            auctions[symbol].extend(days)
    action_pages = source.pages('actions','/v1/corporate-actions',{
        'symbols':','.join(SYMBOLS),'start':RAW_START,'end':str(observation.date()),
        'types':'forward_split,reverse_split,spin_off,cash_merger,stock_merger,stock_and_cash_merger,name_change,reorganization',
        'limit':1000,'sort':'asc'})
    action_data = {'available':True,'pages':[{'payload':p} for p in action_pages]}
    detected = transitions(calendar.loc[:pd.Timestamp(plan['target_date'])],action_data,raw,spin)
    # Preserve prior evidence if a provider later removes an event from its API.
    events = {symbol:sorted(set(detected.get(symbol,[])) | set(metadata['events'].get(symbol,[])))
              for symbol in ALL_SYMBOLS}
    updated, quality = {}, {}
    for symbol in ALL_SYMBOLS:
        if intraday[symbol].empty:
            aggregate = pd.DataFrame(index=refresh_schedule.index,
                data={'open':np.nan,'high':np.nan,'low':np.nan,'close':np.nan,
                      'volume':np.nan,'complete':False})
            details = {'incomplete_sessions':refresh_schedule.index.strftime('%Y-%m-%d').tolist()}
        else:
            aggregate,details = regular_sessions(intraday[symbol],refresh_schedule)
        recent,details = assemble_sessions(symbol,raw[symbol].loc[start:],adjusted[symbol].loc[start:],
                        aggregate,details,auctions[symbol],refresh_schedule)
        old = sessions[symbol].reindex(schedule.index)
        volume = old.raw_rth_volume.copy()
        valid = old.volume.notna().copy()
        volume.loc[start:] = recent.raw_rth_volume
        valid.loc[start:] = recent.volume.notna()
        normalized,all_quality = normalize_sessions(symbol,raw[symbol],adjusted[symbol],volume,valid)
        closing = old.closing_auction_volume_added.copy()
        closing.loc[start:] = recent.closing_auction_volume_added
        normalized['closing_auction_volume_added'] = closing
        updated[symbol] = normalized
        quality[symbol] = {'recent':details,'all_history':all_quality,
                           'latest_prices_present':bool(np.isfinite(normalized.loc[observation,['open','close']].to_numpy(dtype=float)).all())}
    index = {'observation_date':str(observation.date()),'refresh_start':str(start.date()),
             'feed':'sip','symbol_asof':ASOF,'receipts':source.receipts}
    (Path(directory)/'receipts.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
    return updated,events,quality,index
