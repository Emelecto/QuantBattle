"""Pure calendar, privacy, CSV and scoring rules for weekly return tournaments."""
from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import math
import os
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

TZ = ZoneInfo('America/Bogota')
PROTOCOL = 'daily_return_mae_v1'
MAX_BYTES = 10 * 1024 * 1024
NORMALIZER_FLOOR = 0.005  # 0.5 percentage points; zero-return benchmark always scores 0.
LABEL_STEP = 0.005
FEATURES = 8


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def week_key(week_id: str) -> bytes:
    secret = os.environ.get('DATASET_SALT', '')
    if len(secret) < 24:
        raise ValueError('DATASET_SALT debe tener al menos 24 caracteres para el torneo real')
    return hmac.digest(secret.encode(), f'quantlab-return-week-v1|{week_id}'.encode(), 'sha256')


def round_key(key: bytes, round_id: str) -> bytes:
    return hmac.digest(key, f'round|{round_id}'.encode(), 'sha256')


def seal(document: dict, key: bytes, context: str) -> bytes:
    nonce = os.urandom(12)
    return b'QLR1' + nonce + AESGCM(key).encrypt(nonce, canonical(document), context.encode())


def unseal(payload: bytes, key: bytes, context: str) -> dict:
    if not payload.startswith(b'QLR1'):
        raise ValueError('Archivo cifrado de formato desconocido')
    return json.loads(AESGCM(key).decrypt(payload[4:16], payload[16:], context.encode()))


def local_midnight(day: date) -> datetime:
    return datetime.combine(day, time(), TZ)


def schedule(monday: date) -> tuple[dict, list[dict]]:
    if monday.weekday() != 0:
        raise ValueError('La semana debe empezar un lunes')
    week_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'quantlab:{PROTOCOL}:{monday}'))
    release = local_midnight(monday + timedelta(days=5)) + timedelta(minutes=30)
    week = {'id': week_id, 'week_start': str(monday), 'name': f'Retornos diarios · semana del {monday}',
            'timezone': str(TZ), 'protocol': PROTOCOL, 'status': 'open', 'release_at': release.isoformat()}
    rounds = []
    for offset in range(4):
        day = monday + timedelta(days=offset)
        start = local_midnight(day + timedelta(days=1))
        rounds.append({'id': str(uuid.uuid5(uuid.UUID(week_id), str(offset + 1))), 'week_id': week_id,
                       'ordinal': offset + 1, 'observation_day': str(day - timedelta(days=1)),
                       'submission_day': str(day), 'target_day': str(day + timedelta(days=1)),
                       'opens_at': (local_midnight(day) + timedelta(minutes=30)).isoformat(),
                       'closes_at': start.isoformat(), 'target_start': start.isoformat(),
                       'target_end': (start + timedelta(days=1)).isoformat(), 'status': 'pending'})
    return week, rounds


def row_id(key: bytes, day: str, symbol: str) -> str:
    return hmac.new(key, f'row|{day}|{symbol}'.encode(), hashlib.sha256).hexdigest()[:24]


def features(frame: pd.DataFrame) -> pd.DataFrame:
    """Only past/local completed candles. Target observation day d+2 is separate."""
    c, v = frame['close'], frame['volume']
    out = pd.DataFrame(index=frame.index)
    for lag in (1, 3, 5, 10, 20, 60):
        out[f'return_{lag}'] = c.pct_change(lag)
    for window in (7, 20, 60):
        out[f'volatility_{window}'] = c.pct_change().rolling(window).std()
    for window in (20, 50, 100):
        out[f'distance_{window}'] = c / c.rolling(window).mean() - 1
    for window in (7, 20):
        out[f'volume_{window}'] = v / v.rolling(window).mean()
    up = c.diff().clip(lower=0).rolling(14).mean()
    down = -c.diff().clip(upper=0).rolling(14).mean()
    out['rsi'] = (up / (up + down)).fillna(0.5)
    out['range'] = (frame['high'] - frame['low']) / frame['open']
    out['body'] = c / frame['open'] - 1
    return out


def public_parts(bars: dict[str, pd.DataFrame], observation_day: date, key: bytes,
                 projection_override=None) -> tuple[dict, dict]:
    """Rotate/mix coarse cross-sectional features. No symbols, exact dates or raw labels."""
    symbols = sorted(bars)
    if len(symbols) < 30:
        raise ValueError('Se requieren al menos 30 activos con historia completa')
    frames = []
    for symbol in symbols:
        source = bars[symbol].sort_index()
        f = features(source)
        # At snapshot d, participant has the submission day d+1; forecasts d+2.
        f['target'] = source['close'].shift(-2) / source['open'].shift(-2) - 1
        f['symbol'] = symbol
        f['day'] = f.index.astype(str)
        frames.append(f.reset_index(drop=True))
    panel = pd.concat(frames, ignore_index=True).replace([np.inf, -np.inf], np.nan)
    cols = list(features(bars[symbols[0]]).columns)
    panel = panel.dropna(subset=cols)
    complete = panel.groupby('day').size()
    panel = panel[panel['day'].isin(complete[complete == len(symbols)].index)].copy()
    obs = str(observation_day)
    if len(panel[panel.day == obs]) != len(symbols):
        raise ValueError('Falta el último día completo del universo fijo')
    rng = np.random.default_rng(int.from_bytes(key[:8], 'big'))
    projection, _ = np.linalg.qr(rng.normal(size=(len(cols), FEATURES)))
    if projection_override is not None:
        projection = np.asarray(projection_override, dtype=float)
        if projection.shape != (len(cols), FEATURES) or not np.isfinite(projection).all():
            raise ValueError('La proyección revelada no coincide con el protocolo')
    ranks = panel.groupby('day')[cols].rank(pct=True).to_numpy() - 0.5
    mixed = pd.DataFrame(ranks @ projection, index=panel.index)
    names = [f'feature_{i:02d}' for i in range(1, FEATURES + 1)]
    public = pd.DataFrame(index=panel.index)
    for i, name in enumerate(names):
        # Five levels deliberately sacrifice precision to reduce fingerprinting.
        r = mixed[i].groupby(panel['day']).rank(pct=True)
        public[name] = np.floor(r * 5).clip(0, 4) / 4
    public['id'] = [row_id(key, d, s) for d, s in zip(panel.day, panel.symbol)]
    if public['id'].duplicated().any():
        raise ValueError('Colisión de identificadores: se rechaza la publicación')
    days = sorted(panel.day.unique())
    perm = rng.permutation(len(days))
    era_map = {d: f'era_{int(perm[i]):04d}' for i, d in enumerate(days)}
    public['era'] = panel.day.map(era_map)
    # Exact historical return decimals are also a fingerprint. Release coarse labels.
    public['target'] = (panel.target / LABEL_STEP).round() * LABEL_STEP
    history_days = sorted(panel.loc[panel.target.notna() & (panel.day < obs), 'day'].unique())
    if len(history_days) < 120:
        raise ValueError('Se requieren al menos 120 días históricos etiquetados completos')
    cut = int(len(history_days) * 0.75)
    train_days = set(history_days[:cut - 2])
    val_days = set(history_days[cut:])
    parts = {'train': public[panel.day.isin(train_days)], 'validation': public[panel.day.isin(val_days)],
             'live': public[panel.day == obs].drop(columns='target')}
    for kind in parts:
        columns = ['id', 'era', *names] + ([] if kind == 'live' else ['target'])
        parts[kind] = parts[kind][columns].sample(frac=1, random_state=23).reset_index(drop=True)
        if not np.isfinite(parts[kind].select_dtypes('number').to_numpy()).all():
            raise ValueError('Dataset no finito')
    private = {'live_map': [{'id': row_id(key, obs, s), 'symbol': s} for s in symbols],
               'observation_day': obs, 'feature_names': cols, 'feature_projection': projection.tolist(),
               'privacy': {'feature_bins': 5, 'mixed_features': FEATURES, 'training_target_step': LABEL_STEP,
                           'rotated_per_round': True, 'cryptographic_anonymity': False},
               'training_days': len(train_days), 'validation_days': len(val_days)}
    return parts, private


def validate_csv(content: bytes, ids: list[str]) -> pd.DataFrame:
    if not content or len(content) > MAX_BYTES:
        raise ValueError('El CSV está vacío o supera 10 MB')
    try:
        text = content.decode('utf-8-sig')
        rows = list(csv.reader(io.StringIO(text), strict=True))
    except (UnicodeDecodeError, csv.Error) as exc:
        raise ValueError('Usa un CSV UTF-8 válido') from exc
    if not rows or rows[0] != ['id', 'prediction'] or len(rows) < 2:
        raise ValueError('La cabecera debe ser exactamente id,prediction')
    result, seen = [], set()
    for row in rows[1:]:
        if len(row) != 2:
            raise ValueError('Cada fila debe tener exactamente dos columnas')
        identity = row[0].strip()
        if not identity or identity in seen:
            raise ValueError('Hay IDs vacíos o repetidos')
        try:
            if not re.fullmatch(r'[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?', row[1].strip()):
                raise ValueError('Formato decimal inválido')
            number = float(row[1])
        except ValueError as exc:
            raise ValueError('Las predicciones deben ser números decimales') from exc
        if not math.isfinite(number) or not -1 <= number <= 10:
            raise ValueError('Retornos fuera de rango: usa decimales entre -1 y 10; 0.025 significa +2,5 %')
        seen.add(identity)
        result.append((identity, number))
    if len(result) != len(ids) or seen != set(ids):
        raise ValueError('Incluye exactamente todos los IDs del live de esta ronda')
    return pd.DataFrame(result, columns=['id', 'prediction'])


def score(predictions: pd.DataFrame, actual: dict[str, float]) -> dict:
    if set(predictions.id) != set(actual) or len(predictions) != len(actual):
        raise ValueError('Cobertura de puntuación incompleta')
    aligned = np.array([actual[x] for x in predictions.id], dtype=float)
    if not np.isfinite(aligned).all():
        raise ValueError('Resultados de mercado no finitos')
    mae = float(np.mean(np.abs(predictions.prediction.to_numpy() - aligned)))
    baseline = float(np.mean(np.abs(aligned)))
    return {'mae': mae, 'baseline_mae': baseline,
            'score': (baseline - mae) / max(baseline, NORMALIZER_FLOOR)}
