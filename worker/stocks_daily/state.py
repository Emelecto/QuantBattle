import io
import json
import zipfile
from pathlib import Path

import pandas as pd

from worker.stocks_history.client import sha256
from worker.stocks_history.config import OUTPUT, SYMBOLS, VERSION
from .core import ALL_SYMBOLS


def write_state(path, sessions, events, observation, provenance=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    for symbol in ALL_SYMBOLS:
        frame = sessions[symbol].loc[:pd.Timestamp(observation)].copy()
        frame['ticker'] = symbol
        frames.append(frame.reset_index())
    combined = pd.concat(frames, ignore_index=True)
    data = io.BytesIO()
    combined.to_parquet(data, index=False, compression='zstd')
    import hashlib
    metadata = {'contract': VERSION, 'observation_date': str(pd.Timestamp(observation).date()),
                'symbols': ALL_SYMBOLS, 'events': events,
                'sessions_sha256': hashlib.sha256(data.getvalue()).hexdigest(),
                'provenance': provenance or {}}
    temporary = path.with_suffix('.tmp')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_STORED) as package:
        package.writestr('sessions.parquet', data.getvalue())
        package.writestr('state.json', json.dumps(metadata,sort_keys=True,allow_nan=False))
    temporary.replace(path)
    return metadata


def read_state(path):
    import hashlib
    with zipfile.ZipFile(path) as package:
        if set(package.namelist()) != {'sessions.parquet','state.json'}:
            raise ValueError('Unexpected files in state archive')
        metadata = json.loads(package.read('state.json'))
        data = package.read('sessions.parquet')
    if metadata['contract'] != VERSION or metadata['symbols'] != ALL_SYMBOLS:
        raise ValueError('State feature contract/universe differs')
    if hashlib.sha256(data).hexdigest() != metadata['sessions_sha256']:
        raise ValueError('State checksum mismatch')
    frame = pd.read_parquet(io.BytesIO(data))
    frame['date'] = pd.to_datetime(frame.date)
    if frame.duplicated(['ticker','date']).any() or set(frame.ticker) != set(ALL_SYMBOLS):
        raise ValueError('Invalid state instrument/date keys')
    sessions = {symbol: group.drop(columns='ticker').set_index('date').sort_index()
                for symbol,group in frame.groupby('ticker')}
    return sessions, metadata


def bootstrap(destination, history=OUTPUT):
    history = Path(history)
    manifest = json.loads((history/'manifest.json').read_text(encoding='utf-8'))
    if manifest['dataset_version'] != VERSION:
        raise ValueError('Historical feature contract differs')
    for name in ['quality_report.json','feature_definitions.json']:
        if sha256(history/name) != manifest['files'][name]['sha256']:
            raise ValueError('Historical metadata checksum mismatch')
    quality = json.loads((history/'quality_report.json').read_text(encoding='utf-8'))
    sessions = {symbol:pd.read_parquet(history/'_internal'/f'{symbol}_sessions.parquet')
                for symbol in ALL_SYMBOLS}
    events = {symbol:quality['per_symbol'][symbol]['corporate_transition_dates'] for symbol in SYMBOLS}
    events['SPY'] = []
    write_state(destination,sessions,events,manifest['download_end'],
                {'bootstrap_manifest_sha256':sha256(history/'manifest.json')})
