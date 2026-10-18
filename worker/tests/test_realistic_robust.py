"""Tests del motor realista (slippage/calmar/report) y de robustez (validación de entrada).

Usan DATOS REALES de Binance para los casos de éxito; las validaciones de
entrada se prueban tanto a nivel de motor (run_backtest) como de API (endpoint
/backtest vía TestClient). No se inventan resultados: los tests de red descargan
de verdad y fallan explícitamente si la red no responde.
"""
import math

import pytest

import engine
from schemas import StrategyConfig


def _btc_config(**overrides) -> StrategyConfig:
    base = dict(
        code="fast=20,slow=50",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-02-15",  # ~46 barras 1d: suficiente para walk-forward
        capital=1000,
        commission=0.1,
        slippage=0.0005,
        folds=3,
        split=70,
    )
    base.update(overrides)
    return StrategyConfig(**base)


# ---------------------------------------------------------------------------
# Motor realista
# ---------------------------------------------------------------------------
@pytest.mark.external
def test_slippage_reduces_return():
    """Con más comisión+slippage el retorno total OOS debe ser menor."""
    low = engine.run_backtest(_btc_config(commission=0.0, slippage=0.0))
    high = engine.run_backtest(_btc_config(commission=0.5, slippage=0.005))
    assert low["metrics"]["ret_total"] >= high["metrics"]["ret_total"]


@pytest.mark.external
def test_report_present_and_mentions_oos():
    res = engine.run_backtest(_btc_config())
    assert "report" in res
    assert isinstance(res["report"], str) and len(res["report"]) > 20
    assert "out-of-sample" in res["report"].lower()


@pytest.mark.external
def test_calmar_computed():
    res = engine.run_backtest(_btc_config())
    assert "calmar" in res["metrics"]
    assert isinstance(res["metrics"]["calmar"], float)
    assert math.isfinite(res["metrics"]["calmar"])


@pytest.mark.external
def test_integrity_rule_few_trades():
    """Si hay pocas operaciones, la integridad debe bajar a 'Baja' (regla)."""
    res = engine.run_backtest(_btc_config())
    if res["metrics"]["n_trades"] < 10:
        assert res["integrity_label"] == "Baja"
        # el reporte advierte evidencia débil cuando hay pocas operaciones
        assert "operaciones" in res["report"].lower()
    else:
        # con muchas operaciones la regla no fuerza Baja; solo verificamos
        # que la etiqueta sea válida y el reporte exista.
        assert res["integrity_label"] in ("Alta", "Media", "Baja")
        assert "report" in res and len(res["report"]) > 20


@pytest.mark.external
def test_long_range_real_data_finite():
    """Backtest largo real: métricas finitas y curva con muchas filas."""
    res = engine.run_backtest(
        _btc_config(start="2021-01-01", end="2024-12-31", folds=5, split=70)
    )
    for k, v in res["metrics"].items():
        if isinstance(v, float):
            assert math.isfinite(v), f"métrica no finita: {k}={v}"
    assert len(res["equity_curve"]) >= 2


# ---------------------------------------------------------------------------
# Robustez: validación de entrada (vía motor directo)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "bad",
    [
        dict(symbol=""),                       # símbolo vacío
        dict(symbol="BTC@USDT"),               # caracteres raros
        dict(asset_type="forex"),             # asset_type inválido
        dict(commission=-1.0),                # comisión negativa
        dict(slippage=-0.01),                 # slippage negativo
        dict(folds=1),                        # folds < 2
        dict(split=5),                        # split fuera de rango
        dict(split=99),                       # split fuera de rango
        dict(start="2023-02-15", end="2023-01-01"),  # start >= end
    ],
)
def test_invalid_config_raises(bad):
    with pytest.raises(ValueError):
        engine.run_backtest(_btc_config(**bad))


def test_short_range_raises():
    """Rango muy corto (2 días ~ 2 barras) => ValueError claro."""
    with pytest.raises(ValueError):
        engine.run_backtest(_btc_config(start="2023-01-01", end="2023-01-02"))


# ---------------------------------------------------------------------------
# Robustez: validación de entrada vía API (TestClient, sin red en estos casos)
# ---------------------------------------------------------------------------
def test_api_rejects_invalid_symbol():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    cfg = _btc_config(symbol="").model_dump()
    resp = client.post("/backtest", json=cfg)
    assert resp.status_code == 400
    assert "símbolo" in resp.json()["error"].lower()


def test_api_rejects_start_after_end():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    cfg = _btc_config(start="2023-02-15", end="2023-01-01").model_dump()
    resp = client.post("/backtest", json=cfg)
    assert resp.status_code == 400
    assert "inicio" in resp.json()["error"].lower()


def test_api_rejects_low_folds():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    cfg = _btc_config().model_dump()
    cfg["folds"] = 1  # bajo el mínimo del esquema (ge=2): lo rechaza FastAPI con 422
    resp = client.post("/backtest", json=cfg)
    assert resp.status_code == 422
