"""Small stock-return contract; usable on Render without the generation runtime."""
import csv
import hashlib
import io
import math
import re
from datetime import datetime

MAX_BYTES = 1024 * 1024
PROTOCOL = 'stocks_open_close_mae_v1'


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamp requires timezone')
    return result


def digest(data):
    return hashlib.sha256(data).hexdigest()


def predictions(data, ids):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('CSV vacío o mayor de 1 MB')
    try:
        rows = list(csv.reader(io.StringIO(data.decode('utf-8-sig')), strict=True))
    except (UnicodeDecodeError, csv.Error) as exc:
        raise ValueError('Usa CSV UTF-8 válido') from exc
    if not rows or rows[0] != ['id', 'prediction']:
        raise ValueError('La cabecera debe ser exactamente id,prediction')
    values = {}
    for row in rows[1:]:
        if len(row) != 2 or not row[0] or row[0] in values:
            raise ValueError('Filas inválidas o IDs repetidos')
        if not re.fullmatch(r'[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?', row[1].strip()):
            raise ValueError('Las predicciones deben ser números decimales')
        number = float(row[1])
        if not math.isfinite(number) or not -1 <= number <= 10:
            raise ValueError('Usa retornos entre -1 y 10; 0.02 significa +2 %')
        values[row[0]] = number
    if len(values) != len(ids) or set(values) != set(ids):
        raise ValueError('Incluye exactamente todos los IDs del dataset de esta ronda')
    return values


def score(predicted, actual):
    if not actual or set(predicted) != set(actual):
        raise ValueError('Incomplete scoring coverage')
    if not all(math.isfinite(x) for x in [*actual.values(), *predicted.values()]):
        raise ValueError('Non-finite scoring values')
    mae = math.fsum(abs(predicted[k] - v) for k, v in actual.items()) / len(actual)
    baseline = math.fsum(abs(v) for v in actual.values()) / len(actual)
    return {'mae': mae, 'baseline_mae': baseline, 'score': (baseline - mae) / max(baseline, 0.005)}
