import pytest

from engine import walkforward_splits, deflated_sharpe, integrity_label


def test_walkforward_splits_min_folds():
    splits = walkforward_splits(n_folds=5, total=1000)
    assert len(splits) >= 3


def test_walkforward_no_overlap():
    splits = walkforward_splits(n_folds=5, total=1000)
    for train, test in splits:
        assert set(train).isdisjoint(set(test))
        assert len(train) > 0 and len(test) > 0


def test_walkforward_train_before_test():
    splits = walkforward_splits(n_folds=5, total=1000)
    for train, test in splits:
        assert max(train) < min(test)


def test_deflated_sharpe_penalizes_multiple_tests():
    base = 1.5
    assert deflated_sharpe(base, n_tests=1) == base
    assert deflated_sharpe(base, n_tests=100) < base


def test_integrity_label():
    assert integrity_label(1.0, 0.8) == "Alta"
    assert integrity_label(1.0, 0.5) == "Media"
    assert integrity_label(1.0, 0.1) == "Baja"


@pytest.mark.external
def test_run_backtest_real_btc_jan2023():
    """Backtest OOS con datos REALES de Binance (BTC enero 2023)."""
    from schemas import StrategyConfig
    from engine import run_backtest
    import math

    cfg = StrategyConfig(
        code="sma_btc",
        asset_type="crypto",
        symbol="BTCUSDT",
        timeframe="1d",
        folds=5,
        split=70,
        start="2023-01-01",
        end="2023-01-31",
    )
    res = run_backtest(cfg)

    assert isinstance(res, dict)
    assert "metrics" in res and "integrity_label" in res and "equity_curve" in res
    metrics = res["metrics"]
    assert metrics, "metrics vacíos"
    # sharpe_oos debe ser un float finito.
    assert isinstance(metrics["sharpe_oos"], float)
    assert math.isfinite(metrics["sharpe_oos"]), "sharpe_oos no es finito"
    # todas las métricas deben ser finitas.
    for k, v in metrics.items():
        assert math.isfinite(v), f"métrica no finita: {k}={v}"
    assert res["integrity_label"] in ("Alta", "Media", "Baja")
    assert len(res["equity_curve"]) >= 1
    assert "t" in res["equity_curve"][0] and "is" in res["equity_curve"][0] and "oos" in res["equity_curve"][0]
