import pytest
import dataset_builder as builder
from research_benchmark import train_reference
from ml_protocol import validate_predictions


def test_reference_trains_without_live_labels_and_emits_valid_csv():
    panel, features, _ = builder.generar_mercado_sintetico(
        n_activos=40, n_eras=60, n_features=8, n_features_utiles=4, seed=42,
    )
    _, internal, _ = builder.obfuscar(panel, features, salt="research-test", seed=42)
    parts = builder.partir(internal)
    live = parts["live"].drop(columns="target")
    predictions, metadata = train_reference(parts["train"], parts["validation"], live)
    assert metadata["selected_max_leaf_nodes"] in (7, 15)
    assert len(metadata["candidates"]) == 2
    checked = validate_predictions(predictions.to_csv(index=False).encode(), live[["id", "era"]])
    assert len(checked) == len(live)
    with pytest.raises(ValueError, match="no debe tener target"):
        train_reference(parts["train"], parts["validation"], parts["live"])
