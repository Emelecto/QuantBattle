"""Referencia reproducible: seleccionar un modelo con validation, sin etiquetas live."""
from __future__ import annotations

import hashlib
import pandas as pd

from ml_protocol import score_predictions, validate_predictions


def rank_predictions(frame: pd.DataFrame, values) -> pd.DataFrame:
    ranks = pd.Series(values, index=frame.index).groupby(frame["era"]).rank(pct=True)
    return pd.DataFrame({"id": frame["id"], "prediction": ranks})


def train_reference(train: pd.DataFrame, validation: pd.DataFrame,
                    live: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    from sklearn.ensemble import HistGradientBoostingRegressor

    if "target" in live:
        raise ValueError("El archivo live de un participante no debe tener target")
    features = [c for c in train if c.startswith("feature_")]
    if not features or any(c not in live or c not in validation for c in features):
        raise ValueError("Features incompatibles entre particiones")
    candidates = []
    best_model, best_score = None, float("-inf")
    target = validation[["id", "era", "target"]].rename(columns={"id": "row_id"})
    for leaves in (7, 15):
        model = HistGradientBoostingRegressor(
            max_iter=100, max_leaf_nodes=leaves, learning_rate=0.05,
            l2_regularization=1.0, random_state=42,
        )
        model.fit(train[features], train["target"])
        predictions = rank_predictions(validation, model.predict(validation[features]))
        score = score_predictions(predictions, target, min_eras=1)["score"]
        candidates.append({"max_leaf_nodes": leaves, "validation_score": score})
        if score > best_score:
            best_model, best_score = model, score
    assert best_model is not None
    predictions = rank_predictions(live, best_model.predict(live[features]))
    validate_predictions(predictions.to_csv(index=False).encode(), live[["id", "era"]])
    return predictions, {
        "algorithm": "HistGradientBoostingRegressor",
        "selection": "mayor Spearman medio en validation; entrenamiento solo en train",
        "candidates": candidates, "selected_max_leaf_nodes": best_model.max_leaf_nodes,
        "max_iter": 100, "learning_rate": 0.05, "l2_regularization": 1.0,
        "random_state": 42, "n_features": len(features),
    }


def random_reference(live: pd.DataFrame, version: str) -> pd.DataFrame:
    return pd.DataFrame({"id": live["id"], "prediction": [
        int(hashlib.sha256(f"{version}|{row_id}".encode()).hexdigest()[:13], 16) / float(0xfffffffffffff)
        for row_id in live["id"]
    ]})
