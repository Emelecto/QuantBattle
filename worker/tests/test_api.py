"""Tests de la API HTTP del worker (FastAPI), CONTRA DATOS REALES.

Requieren conexión a internet (Binance para crypto). Si la red no responde,
el test del backtest real falla EXPLÍCITAMENTE con el error real en lugar de
inventar resultados.

Se ejecutan desde worker/ (el conftest de tests/ ya añade worker/ al sys.path),
de modo que `from main import app` y `from schemas import StrategyConfig` funcionan.
"""
import math

import pytest
from fastapi.testclient import TestClient

from main import app
import engine
from schemas import StrategyConfig

client = TestClient(app)


# ---------------------------------------------------------------------------
# Healthcheck (sin red)
# ---------------------------------------------------------------------------
def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Validación ligera (/backtest/validate)
# ---------------------------------------------------------------------------
def test_validate_rejects_dangerous_code():
    cfg = StrategyConfig(
        code="import os\nos.system('rm -rf /')",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-01-15",
    )
    resp = client.post("/backtest/validate", json=cfg.model_dump())
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert any("import os" in w for w in body["warnings"]), body["warnings"]


def test_validate_accepts_clean_config():
    cfg = StrategyConfig(
        code="sma_cross",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-01-15",
    )
    resp = client.post("/backtest/validate", json=cfg.model_dump())
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["warnings"] == []


def test_validate_flags_stock_with_usdt_suffix():
    cfg = StrategyConfig(
        code="safe",
        asset_type="stock",
        symbol="AAPLUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-01-15",
    )
    resp = client.post("/backtest/validate", json=cfg.model_dump())
    assert resp.status_code == 200
    body = resp.json()
    # No es inválido (no hay código peligroso), pero debe advertir la incoherencia.
    assert body["valid"] is True
    assert any("USDT" in w for w in body["warnings"]), body["warnings"]


# ---------------------------------------------------------------------------
# Backtest real contra Binance (requiere red)
# ---------------------------------------------------------------------------
@pytest.mark.external
def test_backtest_real_crypto_btc():
    """Backtest OOS real (BTCUSDT 1d, ene-2023, rango corto para rapidez).

    Si Binance no responde, run_backtest lanza ValueError -> la API devuelve
    400 y este test FALLA con un mensaje claro (no se inventan datos).
    """
    cfg = StrategyConfig(
        code="sma_btc_api",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        capital=10000.0,
        commission=0.1,
        folds=4,
        split=70,
        start="2023-01-01",
        end="2023-01-20",
    )
    resp = client.post("/backtest", json=cfg.model_dump())

    if resp.status_code != 200:
        body = resp.json()
        pytest.fail(
            f"El backtest real contra Binance falló (HTTP {resp.status_code}): "
            f"{body.get('error', resp.text)}. "
            "Comprueba la conectividad a api.binance.com."
        )

    data = resp.json()
    assert "metrics" in data and "integrity_label" in data and "equity_curve" in data
    metrics = data["metrics"]
    assert isinstance(metrics["sharpe_oos"], float)
    assert math.isfinite(metrics["sharpe_oos"]), "sharpe_oos no es finito"
    for k, v in metrics.items():
        assert math.isfinite(v), f"métrica no finita: {k}={v}"
    assert data["integrity_label"] in ("Alta", "Media", "Baja")
    assert len(data["equity_curve"]) >= 1
    point = data["equity_curve"][0]
    assert "t" in point and "is" in point and "oos" in point


@pytest.mark.external
def test_backtest_invalid_symbol_returns_400():
    """Símbolo inexistente: la API debe devolver 400 con clave 'error'.

    Robusto a la red: tanto si Binance responde 400 como si hay fallo de red,
    el motor lanza ValueError y el endpoint contesta 400 {'error': ...}.
    """
    cfg = StrategyConfig(
        code="x",
        asset_type="crypto",
        symbol="ZZZTOPUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-01-10",
    )
    resp = client.post("/backtest", json=cfg.model_dump())
    assert resp.status_code == 400
    body = resp.json()
    assert "error" in body, body


def test_backtest_reports_engine_valueerror_as_400(monkeypatch):
    """Contrato de error: un ValueError del motor se traduce a 400 {'error': ...}.

    Test determinista (sin red) que parchea engine.run_backtest para lanzar
    ValueError, verificando que el endpoint captura y expone el mensaje.
    """
    def boom(config):
        raise ValueError("Binance: fallo de red simulado (test)")

    monkeypatch.setattr(engine, "run_backtest", boom)
    cfg = StrategyConfig(
        code="x",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-01-15",
    )
    resp = client.post("/backtest", json=cfg.model_dump())
    assert resp.status_code == 400
    body = resp.json()
    assert "error" in body
    assert "Binance" in body["error"]
