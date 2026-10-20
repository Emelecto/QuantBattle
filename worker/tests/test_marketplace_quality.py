import pytest
from marketplace_quality import review_reasons
from ml_research import parse_experiment_header
import base64
import json
from fastapi import HTTPException


def test_catalog_requires_evidence_not_claims_in_description():
    row = {"title": "Modelo BTC", "description": "Sharpe 10, retorno alto"}
    assert review_reasons(row)
    row.update(backtest_metrics={"sharpe_oos": 0.0}, data_hash="hash-guardado")
    assert not review_reasons(row)  # No exige un resultado positivo ni selecciona ganadores.
    row["title"] = "Modelo \ufffd"
    assert review_reasons(row)


@pytest.mark.parametrize("metadata", [
    {"model_name":""}, {"model_name":"Modelo", "seed":True},
    {"model_name":"Modelo", "seed":-1}, {"model_name":"Modelo", "parameters":[]},
    {"model_name":"Modelo", "parameters":{"bad":float("nan")}},
    {"model_name":"Modelo", "unexpected":"field"}, {"model_name":"Modelo", "note":"x"*1001},
])
def test_metadata_rejects_invalid_or_unbounded_claims(metadata):
    header = base64.b64encode(json.dumps(metadata).encode()).decode()
    with pytest.raises(HTTPException) as error:
        parse_experiment_header(header)
    assert error.value.status_code == 422
