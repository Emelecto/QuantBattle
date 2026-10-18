"""Protocolo público de envíos y puntuación para rondas ML v1.

La validación de archivos no toca el target. La única función que lo usa es
``score_predictions`` y el worker solo la invoca después del cierre.
"""
from __future__ import annotations

import csv
import io
import math

import numpy as np
import pandas as pd

SCORE_VERSION = "spearman_era_v1"
MAX_CSV_BYTES = 10 * 1024 * 1024


class PredictionError(ValueError):
    """Error público de formato o cobertura, sin información del target."""


def validate_round_parts(parts: dict[str, pd.DataFrame], feature_cols: list[str],
                         *, min_assets: int, min_test_eras: int,
                         live_target_required: bool = True) -> dict:
    """Detiene la publicación si el dataset no admite una puntuación útil."""
    seen: set[str] = set()
    era_sets: dict[str, set[int]] = {}
    counts: dict[str, int] = {}
    if not feature_cols:
        raise ValueError("El dataset no tiene features")
    for kind in ("train", "validation", "live"):
        frame = parts[kind]
        required = {"id", "era", "era_idx", "target", *feature_cols}
        if frame.empty or not required.issubset(frame.columns):
            raise ValueError(f"Partición {kind} vacía o incompleta")
        ids = frame["id"].astype(str)
        if ids.duplicated().any() or seen.intersection(ids):
            raise ValueError("IDs repetidos entre particiones")
        seen.update(ids)
        eras = set(int(era) for era in frame["era_idx"].unique())
        era_sets[kind] = eras
        counts[kind] = len(frame)
        if frame.groupby("era_idx").size().min() < min_assets:
            raise ValueError(f"{kind} tiene eras con menos de {min_assets} activos")
        values = frame[feature_cols + (["target"] if kind != "live" or live_target_required else [])].to_numpy(dtype=float)
        if not np.isfinite(values).all():
            raise ValueError(f"{kind} contiene features o targets no finitos")
        if (kind != "live" or live_target_required) and frame.groupby("era_idx")["target"].nunique().le(1).any():
            raise ValueError(f"{kind} tiene eras con target constante")
    if any(era_sets[a] & era_sets[b] for a, b in
           (("train", "validation"), ("train", "live"), ("validation", "live"))):
        raise ValueError("Eras compartidas entre particiones")
    if len(era_sets["live"]) < min_test_eras:
        raise ValueError(f"El holdout necesita al menos {min_test_eras} eras")
    return {
        "row_counts": counts,
        "era_counts": {k: len(v) for k, v in era_sets.items()},
        "min_assets_per_era": min_assets,
        "min_test_eras": min_test_eras,
        "passed": True,
    }


def validate_predictions(content: bytes, live_rows: pd.DataFrame) -> pd.DataFrame:
    """Acepta exactamente ``id,prediction`` y todos los IDs del live una vez.

    Los valores son rangos entre 0 y 1. El orden de filas no afecta el score.
    ``live_rows`` contiene únicamente columnas públicas, al menos id y era.
    """
    if not content or len(content) > MAX_CSV_BYTES:
        raise PredictionError("El CSV está vacío o supera 10 MB")
    try:
        source = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise PredictionError("El CSV debe estar codificado en UTF-8") from exc
    try:
        reader = csv.reader(io.StringIO(source))
        header = next(reader)
        if header != ["id", "prediction"]:
            raise PredictionError("La cabecera debe ser exactamente id,prediction")
        if any(len(row) != 2 for row in reader):
            raise PredictionError("Cada fila del CSV debe tener dos columnas")
        df = pd.read_csv(io.StringIO(source), dtype=str, keep_default_na=False)
    except PredictionError:
        raise
    except (csv.Error, pd.errors.ParserError, StopIteration, ValueError) as exc:
        raise PredictionError("CSV inválido") from exc
    if list(df.columns) != ["id", "prediction"] or df.empty:
        raise PredictionError("El CSV debe contener id,prediction y al menos una fila")
    df["id"] = df["id"].str.strip()
    if df["id"].eq("").any() or df["id"].duplicated().any():
        raise PredictionError("Hay IDs vacíos o duplicados")
    raw = df["prediction"].str.strip()
    if raw.eq("").any():
        raise PredictionError("Hay predicciones vacías")
    numeric = pd.to_numeric(raw, errors="coerce")
    if numeric.isna().any() or not numeric.map(math.isfinite).all():
        raise PredictionError("Todas las predicciones deben ser números finitos")
    if ((numeric < 0) | (numeric > 1)).any():
        raise PredictionError("Las predicciones deben estar entre 0 y 1")
    expected = live_rows[["id", "era"]].copy()
    expected["id"] = expected["id"].astype(str)
    if len(df) != len(expected) or set(df["id"]) != set(expected["id"]):
        raise PredictionError("El CSV debe contener exactamente todos los IDs de esta ronda")
    checked = df.assign(prediction=numeric.astype(float)).merge(
        expected, on="id", how="left", validate="one_to_one"
    )
    # Se verifica antes del cierre: no revela etiquetas ni puntuaciones.
    if checked.groupby("era")["prediction"].nunique().le(1).any():
        raise PredictionError("Cada era necesita predicciones con valores distintos")
    return checked[["id", "prediction"]]


def score_predictions(predictions: pd.DataFrame, targets: pd.DataFrame,
                      *, min_eras: int) -> dict:
    """Correlación de Spearman por era; score principal = media entre eras."""
    if min_eras < 1:
        raise ValueError("min_eras debe ser positivo")
    required = {"row_id", "era", "target"}
    if not required.issubset(targets.columns) or not {"id", "prediction"}.issubset(predictions.columns):
        raise ValueError("Columnas de scoring incompletas")
    merged = predictions.merge(
        targets[["row_id", "era", "target"]], left_on="id", right_on="row_id",
        how="inner", validate="one_to_one"
    )
    if len(merged) != len(predictions) or len(merged) != len(targets):
        raise ValueError("IDs del envío y del target no coinciden")
    correlations = []
    for _, era in merged.groupby("era"):
        if era["prediction"].nunique() < 2 or era["target"].nunique() < 2:
            raise ValueError("Una era no admite correlación")
        corr = era["prediction"].corr(era["target"], method="spearman")
        if not math.isfinite(corr):
            raise ValueError("Correlación no finita")
        correlations.append(float(corr))
    if len(correlations) < min_eras:
        raise ValueError("La ronda tiene menos eras evaluables que las requeridas")
    series = pd.Series(correlations, dtype=float)
    return {
        "score": float(series.mean()),
        "corr_mean": float(series.mean()),
        "corr_std": float(series.std(ddof=0)),
        "n_eras": len(correlations),
        "per_era": correlations,
        "score_version": SCORE_VERSION,
    }
