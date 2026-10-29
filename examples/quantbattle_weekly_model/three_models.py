"""Three independent, untrained recipes for QuantBattle daily_return_mae_v1.

Nothing is fitted on import or describe. Training requires the explicit train
subcommand; validation and live are never read by the model factories.
"""
from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path
import warnings

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.kernel_approximation import Nystroem
from sklearn.metrics import mean_absolute_error
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVR

from quantbattle_model import (
    SEED, checked_predictions, official_score, predict_saved,
    read_round, sha256_file, write_submission,
)


MODEL_SPECS = {
    "random_forest": {
        "name": "QuantBattle Random Forest MAE v1",
        "family": "bootstrap forest with median leaves and mean tree aggregation",
        "training_loss": "absolute_error within trees; forest averages tree predictions",
        "parameters": {
            "n_estimators": 200, "criterion": "absolute_error", "max_depth": 6,
            "min_samples_leaf": 40, "max_features": 0.75,
            "bootstrap": True, "max_samples": 0.8, "n_jobs": 2,
        },
        "source": "https://www.stat.berkeley.edu/~breiman/randomforest2001.pdf",
    },
    "rbf_svr": {
        "name": "QuantBattle SVR RBF Nystrom v1",
        "family": "approximate RBF features followed by linear support vector regression",
        "training_loss": "epsilon_insensitive on standardized targets plus L2 regularization",
        "parameters": {
            "feature_scaler": "StandardScaler", "target_scaler": "StandardScaler",
            "kernel": "rbf", "gamma": 0.1, "n_components": 128,
            "C": 0.1, "epsilon": 0.05, "loss": "epsilon_insensitive",
            "dual": True, "tol": 0.0001, "max_iter": 10000,
        },
        "source": "https://alex.smola.org/papers/2004/SmoSch04.pdf",
        "approximation_source": "https://proceedings.neurips.cc/paper/2000/file/19de10adbaa1b2ee13f77f679fa1483a-Paper.pdf",
    },
    "mlp": {
        "name": "QuantBattle MLP 32-16 v1",
        "family": "feedforward neural network with two hidden layers",
        "training_loss": "squared_error on standardized targets plus L2 regularization",
        "parameters": {
            "feature_scaler": "StandardScaler", "target_scaler": "StandardScaler",
            "hidden_layer_sizes": [32, 16], "activation": "relu", "solver": "adam",
            "alpha": 0.01, "batch_size": 128, "learning_rate_init": 0.001,
            "max_iter": 300, "early_stopping": False, "shuffle": True,
            "tol": 0.0001, "n_iter_no_change": 20,
        },
        "source": "https://doi.org/10.1093/rfs/hhaa009",
    },
}


def create_model(name: str, seed: int = SEED):
    """Return a fresh estimator, without loading or fitting any dataset."""
    if name == "random_forest":
        return RandomForestRegressor(**MODEL_SPECS[name]["parameters"], random_state=seed)
    if name == "rbf_svr":
        regressor = Pipeline([
            ("scale", StandardScaler()),
            ("rbf", Nystroem(kernel="rbf", gamma=0.1, n_components=128, random_state=seed)),
            ("svr", LinearSVR(C=0.1, epsilon=0.05, loss="epsilon_insensitive", dual=True,
                              tol=0.0001, max_iter=10000, random_state=seed)),
        ])
    elif name == "mlp":
        regressor = Pipeline([
            ("scale", StandardScaler()),
            ("network", MLPRegressor(
                loss="squared_error", hidden_layer_sizes=(32, 16), activation="relu",
                solver="adam", alpha=0.01, batch_size=128, learning_rate_init=0.001,
                max_iter=300, early_stopping=False, shuffle=True, tol=0.0001,
                n_iter_no_change=20, random_state=seed,
            )),
        ])
    else:
        raise ValueError(f"Modelo desconocido: {name}")
    # Fit and inverse transformation are part of the persisted model, so the
    # submitted predictions stay in decimal returns, not standardized units.
    return TransformedTargetRegressor(regressor=regressor, transformer=StandardScaler())


def fit_with_warnings(model, x, y) -> list[str]:
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        model.fit(x, y)
    return [f"{warning.category.__name__}: {warning.message}" for warning in recorded]


def train_one(name: str, train_path: Path, validation_path: Path, live_path: Path,
              output_csv: Path, seed: int = SEED) -> dict:
    if name not in MODEL_SPECS:
        raise ValueError("Selecciona uno de los tres modelos disponibles.")
    if output_csv.suffix.lower() != ".csv":
        raise ValueError("La salida debe terminar en .csv.")
    if output_csv.resolve() in {path.resolve() for path in (train_path, validation_path, live_path)}:
        raise ValueError("La salida no puede reemplazar una entrada.")
    train, validation, live, features = read_round(train_path, validation_path, live_path)
    if len(train) < 128:
        raise ValueError("Se requieren al menos 128 ejemplos de train para estas recetas.")
    comparison_model = create_model(name, seed)
    comparison_warnings = fit_with_warnings(comparison_model, train[features], train.target)
    validation_prediction = checked_predictions(comparison_model.predict(validation[features]))
    mae = float(mean_absolute_error(validation.target, validation_prediction))
    zero_mae = float(mean_absolute_error(validation.target, np.zeros(len(validation))))

    labeled = pd.concat([train, validation], ignore_index=True)
    final_model = create_model(name, seed)
    refit_warnings = fit_with_warnings(final_model, labeled[features], labeled.target)
    prediction = checked_predictions(final_model.predict(live[features]))
    write_submission(live, prediction, output_csv)
    artifact_path = output_csv.with_suffix(".model.joblib")
    joblib.dump({
        "format_version": 1, "protocol": "daily_return_mae_v1", "model_name": name,
        "model": final_model, "features": features, "live_sha256": sha256_file(live_path),
        "sklearn_version": sklearn.__version__,
    }, artifact_path)

    report = {
        "protocol": "daily_return_mae_v1", "model": name, "recipe": MODEL_SPECS[name],
        "seed": seed, "features": features,
        "rows": {"train": len(train), "validation": len(validation), "live": len(live)},
        "validation_mae": mae, "zero_validation_mae": zero_mae,
        "validation_score_vs_zero": official_score(mae, zero_mae), "beats_zero": mae < zero_mae,
        "submission_method": name, "automatic_zero_substitution": False,
        "fit_warnings": {"comparison": comparison_warnings, "final_refit": refit_warnings},
        "input_sha256": {"train": sha256_file(train_path), "validation": sha256_file(validation_path),
                         "live": sha256_file(live_path)},
        "runtime": {"python": platform.python_version(), "numpy": np.__version__,
                    "pandas": pd.__version__, "scikit_learn": sklearn.__version__, "joblib": joblib.__version__},
        "prediction_range": [float(prediction.min()), float(prediction.max())],
        "submission_csv": str(output_csv.resolve()), "model_file": str(artifact_path.resolve()),
        "limitations": [
            "Validation es una medida de desarrollo; no demuestra rendimiento prospectivo.",
            "Las etiquetas históricas están redondeadas; el torneo usa retornos futuros sin redondear.",
            "Si beats_zero es false, este CSV conserva las predicciones ML y no reemplaza por cero.",
            "Reentrenar para cada ronda porque cambian las transformaciones de features.",
        ],
    }
    output_csv.with_suffix(".report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Tres modelos adicionales de QuantBattle; no se entrenan automáticamente.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("describe", help="Ver las tres recetas sin leer datos ni entrenar.")
    train = commands.add_parser("train", help="Entrenar explícitamente un modelo para una ronda.")
    train.add_argument("--model", choices=tuple(MODEL_SPECS), required=True)
    train.add_argument("--seed", type=int, default=SEED)
    train.add_argument("--data-dir", type=Path)
    train.add_argument("--train-path", type=Path)
    train.add_argument("--validation-path", type=Path)
    train.add_argument("--live-path", type=Path)
    train.add_argument("--output", type=Path, required=True)
    predict = commands.add_parser("predict", help="Reproducir predicciones con un modelo propio ya entrenado.")
    predict.add_argument("--model-file", type=Path, required=True)
    predict.add_argument("--live-path", type=Path, required=True)
    predict.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "describe":
        print(json.dumps({"status": "untrained_recipes", "models": MODEL_SPECS}, indent=2, ensure_ascii=False))
    elif args.command == "predict":
        predict_saved(args.model_file, args.live_path, args.output)
        print(f"CSV reproducido: {args.output.resolve()}")
    else:
        direct = (args.train_path, args.validation_path, args.live_path)
        if args.data_dir:
            if any(path is not None for path in direct):
                parser.error("Usa --data-dir o las tres rutas directas.")
            paths = tuple(args.data_dir / f"{part}.parquet" for part in ("train", "validation", "live"))
        else:
            if any(path is None for path in direct):
                parser.error("Indica --data-dir o las tres rutas directas.")
            paths = direct
        print(json.dumps(train_one(args.model, *paths, args.output, args.seed), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
