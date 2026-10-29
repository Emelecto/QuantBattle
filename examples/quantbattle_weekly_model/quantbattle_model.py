#!/usr/bin/env python3
"""Train a compact baseline model for QuantBattle's weekly daily-return tournament.

Uses only the round's train/validation/live Parquet files. The selected model is
chosen by validation MAE against the official zero forecast, refit on all
available labeled rows, and exported as id,prediction CSV.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import joblib
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


SEED = 20261028
TARGET = "target"
ID = "id"
FEATURE_PREFIX = "feature_"
PREDICTION_MIN = -1.0
PREDICTION_MAX = 10.0
SCORE_FLOOR = 0.005


def checked_predictions(values: Any) -> np.ndarray:
    prediction = np.asarray(values, dtype=np.float64)
    if prediction.ndim != 1 or not np.isfinite(prediction).all():
        raise ValueError("Predicciones ausentes, no finitas o de dimensión inválida.")
    return np.clip(prediction, PREDICTION_MIN, PREDICTION_MAX)


def write_submission(live: pd.DataFrame, prediction: np.ndarray, path: Path) -> None:
    prediction = checked_predictions(prediction)
    if len(prediction) != len(live) or live[ID].astype(str).duplicated().any():
        raise ValueError("La salida debe conservar una predicción por ID live.")
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({ID: live[ID].astype(str), "prediction": prediction}).to_csv(
        path, index=False, encoding="utf-8", float_format="%.10g"
    )


def read_round(
    train_path: Path, validation_path: Path, live_path: Path
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, list[str]]:
    train = pd.read_parquet(train_path)
    validation = pd.read_parquet(validation_path)
    live = pd.read_parquet(live_path)

    for name, frame in (("train", train), ("validation", validation), ("live", live)):
        if frame.empty or not frame.columns.is_unique:
            raise ValueError(f"{name}: tabla vacía o columnas repetidas.")
        if ID not in frame or frame[ID].isna().any() or frame[ID].astype(str).duplicated().any():
            raise ValueError(f"{name}: IDs ausentes o repetidos.")
    id_sets = [set(frame[ID].astype(str)) for frame in (train, validation, live)]
    if any(id_sets[a] & id_sets[b] for a, b in ((0, 1), (0, 2), (1, 2))):
        raise ValueError("Los IDs de train, validation y live deben ser disjuntos.")
    if "era" in train and "era" in validation:
        if set(train.era) & set(validation.era):
            raise ValueError("Train y validation comparten eras; revisa las versiones.")

    features = sorted(column for column in train.columns if column.startswith(FEATURE_PREFIX))
    if not features:
        raise ValueError(f"No se encontraron columnas con prefijo {FEATURE_PREFIX!r} en train.parquet.")
    if TARGET not in train or TARGET not in validation:
        raise ValueError("train.parquet y validation.parquet deben tener la columna 'target'.")
    if TARGET in live:
        raise ValueError("live.parquet no debe incluir target.")
    if ID not in live:
        raise ValueError("live.parquet debe incluir la columna 'id'.")
    for name, frame in (("validation", validation), ("live", live)):
        if {column for column in frame if column.startswith(FEATURE_PREFIX)} != set(features):
            raise ValueError(f"El conjunto de features no coincide en {name}.")
        missing = sorted(set(features) - set(frame.columns))
        if missing:
            raise ValueError(f"Faltan features de train en {name}: {missing}")
    if live.empty:
        raise ValueError("live.parquet no tiene filas para predecir.")
    if live[ID].isna().any() or live[ID].duplicated().any():
        raise ValueError("Los IDs de live.parquet deben estar completos y ser únicos.")

    for name, frame in (("train", train), ("validation", validation), ("live", live)):
        values = frame[features].to_numpy(dtype=np.float64)
        if not np.isfinite(values).all():
            raise ValueError(f"{name}.parquet contiene features no numéricas, ausentes o no finitas.")
    for name, frame in (("train", train), ("validation", validation)):
        targets = frame[TARGET].to_numpy(dtype=np.float64)
        if not np.isfinite(targets).all():
            raise ValueError(f"{name}.parquet contiene target ausente o no finito.")
    if train.empty or validation.empty:
        raise ValueError("train.parquet y validation.parquet deben tener al menos una fila.")

    return train, validation, live, features


def build_candidates() -> dict[str, Any]:
    """Small, fixed model set to keep validation selection restrained."""
    return {
        "ridge": make_pipeline(StandardScaler(), Ridge(alpha=10.0)),
        "hist_gradient_boosting": HistGradientBoostingRegressor(
            loss="absolute_error",
            learning_rate=0.04,
            max_iter=160,
            max_leaf_nodes=7,
            min_samples_leaf=40,
            l2_regularization=1.0,
            early_stopping=False,
            random_state=SEED,
        ),
    }


def official_score(mae_model: float, mae_zero: float) -> float:
    return (mae_zero - mae_model) / max(mae_zero, SCORE_FLOOR)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def train_predict(
    train_path: Path, validation_path: Path, live_path: Path, output_csv: Path
) -> dict[str, Any]:
    if output_csv.suffix.lower() != ".csv":
        raise ValueError("El archivo de salida debe terminar en .csv.")
    if output_csv.resolve() in {p.resolve() for p in (train_path, validation_path, live_path)}:
        raise ValueError("La salida no puede reemplazar un archivo de entrada.")
    train, validation, live, features = read_round(train_path, validation_path, live_path)
    y_train = train[TARGET].to_numpy(dtype=np.float64)
    y_validation = validation[TARGET].to_numpy(dtype=np.float64)

    zero_mae = float(mean_absolute_error(y_validation, np.zeros(len(validation))))
    results: list[dict[str, Any]] = [{"name": "zero", "validation_mae": zero_mae}]
    candidates = build_candidates()
    for name, model in candidates.items():
        model.fit(train[features], y_train)
        prediction = checked_predictions(model.predict(validation[features]))
        if not np.isfinite(prediction).all():
            raise ValueError(f"El candidato {name} produjo predicciones no finitas en validation.")
        mae = float(mean_absolute_error(y_validation, prediction))
        results.append({"name": name, "validation_mae": mae})

    # Keep the zero forecast on an exact tie: it is simpler and is the official baseline.
    selected = min(results, key=lambda result: result["validation_mae"])
    model_name = str(selected["name"])

    learned = min(results[1:], key=lambda result: result["validation_mae"])
    learned_name = str(learned["name"])
    labeled = pd.concat([train, validation], ignore_index=True)
    learned_model = build_candidates()[learned_name]
    learned_model.fit(labeled[features], labeled[TARGET].to_numpy(dtype=np.float64))
    learned_prediction = checked_predictions(learned_model.predict(live[features]))

    if model_name == "zero":
        live_prediction = np.zeros(len(live), dtype=np.float64)
    else:
        live_prediction = learned_prediction

    live_prediction = checked_predictions(live_prediction)
    if not np.isfinite(live_prediction).all():
        raise ValueError("El modelo produjo predicciones no finitas para live.")

    write_submission(live, live_prediction, output_csv)
    learned_csv = output_csv.with_suffix(".ml.csv")
    write_submission(live, learned_prediction, learned_csv)
    model_path = output_csv.with_suffix(".model.joblib")
    joblib.dump({
        "format_version": 1, "protocol": "daily_return_mae_v1",
        "model_name": learned_name, "model": learned_model, "features": features,
        "live_sha256": sha256_file(live_path), "sklearn_version": sklearn.__version__,
    }, model_path)

    for result in results:
        result["score_vs_zero"] = official_score(float(result["validation_mae"]), zero_mae)
    report = {
        "protocol": "daily_return_mae_v1",
        "seed": SEED,
        "runtime": {"python": platform.python_version(), "scikit_learn": sklearn.__version__,
                    "numpy": np.__version__, "pandas": pd.__version__, "joblib": joblib.__version__},
        "selected_model": model_name,
        "learned_model": learned_name,
        "learned_model_parameters": {"ridge_alpha": 10.0, "standard_scaler": True}
            if learned_name == "ridge" else learned_model.get_params(),
        "learned_validation_beats_zero": learned["validation_mae"] < zero_mae,
        "learned_prediction_range": [float(learned_prediction.min()), float(learned_prediction.max())],
        "learned_submission_csv": str(learned_csv.resolve()),
        "trained_model_file": str(model_path.resolve()),
        "selected_model_parameters": {
            "zero": {"prediction": 0.0},
            "ridge": {"standard_scaler": True, "alpha": 10.0},
            "hist_gradient_boosting": {
                "loss": "absolute_error",
                "learning_rate": 0.04,
                "max_iter": 160,
                "max_leaf_nodes": 7,
                "min_samples_leaf": 40,
                "l2_regularization": 1.0,
                "early_stopping": False,
                "random_state": SEED,
            },
        }[model_name],
        "input_sha256": {
            "train": sha256_file(train_path),
            "validation": sha256_file(validation_path),
            "live": sha256_file(live_path),
        },
        "features": features,
        "rows": {"train": len(train), "validation": len(validation), "live": len(live)},
        "validation_candidates": results,
        "prediction_range": [float(live_prediction.min()), float(live_prediction.max())],
        "submission_csv": str(output_csv.resolve()),
        "notes": [
            "Validation target histórico redondeado; el score oficial usa retornos reales sin redondear.",
            "La selección utiliza únicamente train y validation; live solo se usa para inferencia.",
            "Un score de validación positivo no garantiza superar cero en rondas futuras.",
            "Validation ya se utilizó en el desarrollo; no constituye un test final independiente.",
            "El modelo guardado corresponde a la transformación de esta ronda; reentrenar en cada ronda.",
        ],
    }
    report_path = output_csv.with_suffix(".report.json")
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def predict_saved(model_path: Path, live_path: Path, output_csv: Path) -> None:
    if output_csv.suffix.lower() != ".csv" or output_csv.resolve() in {live_path.resolve(), model_path.resolve()}:
        raise ValueError("Usa una salida .csv distinta del modelo y de live.")
    artifact = joblib.load(model_path)
    if artifact.get("format_version") != 1 or artifact.get("protocol") != "daily_return_mae_v1":
        raise ValueError("Formato de modelo desconocido.")
    if artifact["sklearn_version"] != sklearn.__version__:
        raise ValueError("Usa la misma versión de scikit-learn registrada al entrenar.")
    if sha256_file(live_path) != artifact["live_sha256"]:
        raise ValueError("Este modelo pertenece a otro live. Reentrena con los tres Parquet de la nueva ronda.")
    live = pd.read_parquet(live_path)
    prediction = artifact["model"].predict(live[artifact["features"]])
    write_submission(live, prediction, output_csv)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Entrena el baseline QuantBattle y crea un CSV id,prediction para la ronda semanal."
    )
    parser.add_argument("--data-dir", type=Path, help="Carpeta con los tres Parquet de una ronda.")
    parser.add_argument("--train-path", type=Path, help="Ruta directa a train.parquet.")
    parser.add_argument("--validation-path", type=Path, help="Ruta directa a validation.parquet.")
    parser.add_argument("--live-path", type=Path, help="Ruta directa a live.parquet.")
    parser.add_argument("--model-file", type=Path, help="Recrear predicciones ML con un .model.joblib propio de esta ronda.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("predicciones_retornos.csv"),
        help="Ruta del CSV a subir (por defecto: ./predicciones_retornos.csv).",
    )
    args = parser.parse_args()
    if args.model_file:
        if args.data_dir or args.train_path or args.validation_path or not args.live_path:
            parser.error("Para inferencia usa --model-file, --live-path y --output.")
        predict_saved(args.model_file, args.live_path, args.output)
        print(f"CSV ML reproducido: {args.output.resolve()}")
        return
    explicit_paths = (args.train_path, args.validation_path, args.live_path)
    if args.data_dir is not None:
        if any(path is not None for path in explicit_paths):
            parser.error("Usa --data-dir o las tres rutas directas, no ambos formatos.")
        paths = (args.data_dir / "train.parquet", args.data_dir / "validation.parquet", args.data_dir / "live.parquet")
    else:
        if any(path is None for path in explicit_paths):
            parser.error("Indica --data-dir o las tres opciones --train-path, --validation-path y --live-path.")
        paths = explicit_paths
    report = train_predict(paths[0], paths[1], paths[2], args.output)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
