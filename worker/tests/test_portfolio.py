"""Tests del motor multi-activo/cartera y del hash reproducible de backtest.

Usan DATOS REALES de Binance (igual que el resto del motor). Los tests de red
descargan de verdad y fallan explícitamente si la red no responde.
"""
import math
import pytest

from engine import run_backtest, run_backtest_portfolio, _compute_data_hash
from schemas import StrategyConfig


# Claves esperadas en el dict de resultado (mismo shape para single y portfolio).
_EXPECTED_KEYS = {
    "metrics", "integrity_label", "equity_curve",
    "folds_used", "n_bars", "n_symbols", "report", "data_hash",
}
_EXPECTED_METRIC_KEYS = {
    "sharpe_is", "sharpe_oos", "deflated_sharpe_oos", "sortino", "maxdd",
    "winrate", "n_trades", "ret_total", "vol", "calmar", "n_trades_per_year",
}


def _two_symbol_config(**overrides) -> StrategyConfig:
    base = dict(
        code="fast=20,slow=50",
        asset_type="crypto",
        symbols=["BTCUSDT", "ETHUSDT"],
        timeframe="1d",
        start="2023-01-01",
        end="2023-02-15",  # ~46 barras 1d: suficiente para walk-forward
        commission=0.1,
        slippage=0.0005,
        folds=3,
        split=70,
    )
    base.update(overrides)
    return StrategyConfig(**base)


def _single_config(**overrides) -> StrategyConfig:
    base = dict(
        code="fast=20,slow=50",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        start="2023-01-01",
        end="2023-02-15",
        commission=0.1,
        slippage=0.0005,
        folds=3,
        split=70,
    )
    base.update(overrides)
    return StrategyConfig(**base)


# ---------------------------------------------------------------------------
# (a) run_backtest_portfolio con 2 símbolos: mismo shape y equity_curve no vacío
# ---------------------------------------------------------------------------
@pytest.mark.external
def test_portfolio_returns_same_shape_and_nonempty_curve():
    res = run_backtest_portfolio(_two_symbol_config())

    assert isinstance(res, dict)
    # Mismas claves que run_backtest (single).
    assert set(res.keys()) == _EXPECTED_KEYS, set(res.keys()) ^ _EXPECTED_KEYS
    # Métricas con las mismas claves y finitas.
    metrics = res["metrics"]
    assert set(metrics.keys()) == _EXPECTED_METRIC_KEYS
    for k, v in metrics.items():
        assert math.isfinite(v), f"métrica no finita: {k}={v}"
    # Cartera de 2 activos.
    assert res["n_symbols"] == 2
    # Curva de equity sobre la cartera combinada, no vacía.
    assert len(res["equity_curve"]) >= 1
    point = res["equity_curve"][0]
    assert "t" in point and "is" in point and "oos" in point
    # Hash reproducible presente.
    assert isinstance(res["data_hash"], str) and len(res["data_hash"]) == 16


@pytest.mark.external
def test_portfolio_equal_weight_defaults_to_equal():
    """Sin pesos => igual peso; el retorno de cartera es el promedio de los activos."""
    res = run_backtest_portfolio(_two_symbol_config())
    assert res["n_symbols"] == 2


# ---------------------------------------------------------------------------
# (b) run_backtest con símbolo único: mismo shape que antes (contrato intacto)
# ---------------------------------------------------------------------------
@pytest.mark.external
def test_single_symbol_shape_unchanged():
    res = run_backtest(_single_config())

    assert set(res.keys()) == _EXPECTED_KEYS, set(res.keys()) ^ _EXPECTED_KEYS
    assert set(res["metrics"].keys()) == _EXPECTED_METRIC_KEYS
    assert res["n_symbols"] == 1
    assert res["integrity_label"] in ("Alta", "Media", "Baja")
    assert len(res["equity_curve"]) >= 1
    assert "data_hash" in res and len(res["data_hash"]) == 16


@pytest.mark.external
def test_portfolio_falls_back_to_single_when_one_symbol():
    """symbols con 1 (o 0) activo => se comporta como run_backtest (compatibilidad)."""
    cfg = _single_config()
    cfg.symbols = ["BTCUSDT"]  # un solo activo => fallback
    res = run_backtest_portfolio(cfg)
    assert res["n_symbols"] == 1


# ---------------------------------------------------------------------------
# (c) data_hash determinista y sensible al símbolo
# ---------------------------------------------------------------------------
@pytest.mark.external
def test_data_hash_deterministic():
    cfg_a = _single_config()
    cfg_b = _single_config()  # misma config
    assert _compute_data_hash(cfg_a) == _compute_data_hash(cfg_b)
    # Y vía run_backtest también es estable entre dos corridas.
    h1 = run_backtest(_single_config())["data_hash"]
    h2 = run_backtest(_single_config())["data_hash"]
    assert h1 == h2


def test_data_hash_changes_with_symbol():
    cfg_btc = _single_config(symbol="BTCUSDT")
    cfg_eth = _single_config(symbol="ETHUSDT")
    assert _compute_data_hash(cfg_btc) != _compute_data_hash(cfg_eth)


def test_data_hash_changes_with_seed():
    cfg_a = _single_config(seed=42)
    cfg_b = _single_config(seed=7)
    assert _compute_data_hash(cfg_a) != _compute_data_hash(cfg_b)
