# Tests del Sello de Integridad real + endpoint Replicar (rediseño marketplace).
# Correr con: TESTING=1 python -m pytest tests/test_marketplace_integrity.py -q
#
# No tocan red real: monkeamos tournaments.run_backtest con un dict dummy.

import pytest
from unittest.mock import MagicMock, patch


def _dummy_backtest(sharpe_oos=1.2, data_hash="abc", integrity="Alta"):
    return {
        "metrics": {
            "sharpe_is": 1.0,
            "sharpe_oos": sharpe_oos,
            "deflated_sharpe_oos": sharpe_oos * 0.9,
            "sortino": 1.1,
            "maxdd": -0.2,
            "winrate": 0.55,
            "n_trades": 40,
            "ret_total": 0.3,
            "vol": 0.15,
            "calmar": 1.5,
            "n_trades_per_year": 20,
        },
        "integrity_label": integrity,
        "equity_curve": [],
        "folds_used": 5,
        "n_bars": 365,
        "n_symbols": 1,
        "data_hash": data_hash,
    }


def test_publish_writes_integrity_seal(mock_supabase):
    """ITEM 1: POST /marketplace/publish debe escribir integrity_label, method,
    backtest_metrics, data_hash y replicable=False en la fila (vía UPDATE tras el
    backtest real/mockeado)."""
    inserted: dict = {}
    updated: dict = {}

    def cap_insert(payload):
        inserted.update(payload)
        return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": "strat-xyz"}])))

    def cap_update(payload):
        updated.update(payload)
        return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": "strat-xyz"}])))

    mock_supabase.table.return_value.insert.side_effect = cap_insert
    mock_supabase.table.return_value.update.side_effect = cap_update

    dummy = _dummy_backtest(sharpe_oos=1.2, data_hash="abc", integrity="Alta")

    with patch("tournaments.get_supabase", return_value=mock_supabase), \
         patch("tournaments.run_backtest", return_value=dummy):
        from tournaments import PublishBody, marketplace_publish

        body = PublishBody(
            title="BTC · 1d",
            description="Estrategia crypto en BTCUSDT (1d).",
            tags=["btc", "trend"],
            asset_type="crypto",
            symbol="BTCUSDT",
            timeframe="1d",
            code="fast=20,slow=50",
            is_public_code=True,
            config={"fast": 20, "slow": 50},
            price_qp_week=10,
        )
        result = marketplace_publish(body, MagicMock())

    assert result == {"id": "strat-xyz", "status": "published"}

    # El Sello de Integridad se escribió en la fila (UPDATE).
    assert updated.get("integrity_label") == "Alta"
    assert "walk-forward" in (updated.get("method") or ""), "method debe indicar walk-forward"
    assert "fold" in (updated.get("method") or "")
    assert updated.get("data_hash") == "abc"
    assert updated.get("backtest_metrics") == dummy["metrics"]
    assert updated.get("backtest_equity") == []
    # Replicable arranca False: solo se pone True tras un Replicar exitoso.
    assert updated.get("replicable") is False


def test_publish_with_failed_backtest_still_publishes(mock_supabase):
    """Si el backtest falla, publica igual y deja backtest_metrics=None."""
    inserted: dict = {}
    updated: dict = {}

    def cap_insert(payload):
        inserted.update(payload)
        return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": "strat-fail"}])))

    def cap_update(payload):
        updated.update(payload)
        return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": "strat-fail"}])))

    mock_supabase.table.return_value.insert.side_effect = cap_insert
    mock_supabase.table.return_value.update.side_effect = cap_update

    with patch("tournaments.get_supabase", return_value=mock_supabase), \
         patch("tournaments.run_backtest", side_effect=RuntimeError("sin datos")):
        from tournaments import PublishBody, marketplace_publish

        body = PublishBody(
            title="Falla", asset_type="crypto", symbol="BTCUSDT", timeframe="1d",
            config={"fast": 20, "slow": 50}, price_qp_week=0,
        )
        result = marketplace_publish(body, MagicMock())

    assert result == {"id": "strat-fail", "status": "needs_review"}
    # Se conservó fuera del catálogo público, sello en estado 'sin datos'.
    assert updated.get("backtest_metrics") is None
    assert updated.get("replicable") is False


def test_replicate_marks_replicable_true_on_close_sharpe(mock_supabase):
    """ITEM 2: GET /marketplace/{id}/replicate con sharpe OOS cercano => replicable=True."""
    from tournaments import _replicate_last_run
    _replicate_last_run.clear()

    row = {
        "id": "strat-rep",
        "config": {"fast": 20, "slow": 50},
        "symbol": "BTCUSDT",
        "asset_type": "crypto",
        "timeframe": "1d",
        "backtest_metrics": {"sharpe_oos": 1.2, "ret_total": 0.3},
        "data_hash": "oldhash",
    }
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[row]
    )

    # Replica con sharpe OOS 1.25 (|Δ|=0.05 <= 0.3) y mismo data_hash.
    dummy = _dummy_backtest(sharpe_oos=1.25, data_hash="oldhash")

    with patch("tournaments.get_supabase", return_value=mock_supabase), \
         patch("tournaments.run_backtest", return_value=dummy):
        from tournaments import marketplace_replicate
        res = marketplace_replicate("strat-rep")

    assert res["replicable"] is True
    assert res["sharpe_original"] == 1.2
    assert res["sharpe_replica"] == pytest.approx(1.25)
    assert res["delta"] == pytest.approx(0.05)
    assert res["data_hash_changed"] is False


def test_replicate_marks_not_replicable_on_divergent_sharpe(mock_supabase):
    """ITEM 2: Δ sharpe OOS grande => replicable=False y explica por qué."""
    from tournaments import _replicate_last_run
    _replicate_last_run.clear()

    row = {
        "id": "strat-rep2",
        "config": {"fast": 20, "slow": 50},
        "symbol": "BTCUSDT",
        "asset_type": "crypto",
        "timeframe": "1d",
        "backtest_metrics": {"sharpe_oos": 1.2, "ret_total": 0.3},
        "data_hash": "oldhash",
    }
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[row]
    )

    dummy = _dummy_backtest(sharpe_oos=0.4, data_hash="newhash")  # |Δ|=0.8 > 0.3

    with patch("tournaments.get_supabase", return_value=mock_supabase), \
         patch("tournaments.run_backtest", return_value=dummy):
        from tournaments import marketplace_replicate
        res = marketplace_replicate("strat-rep2")

    assert res["replicable"] is False
    assert res["sharpe_original"] == 1.2
    assert res["sharpe_replica"] == pytest.approx(0.4)
    assert res["data_hash_changed"] is True
    assert "ventana" in (res.get("window_note") or "").lower()
    assert "umbral" in (res.get("note") or "").lower()
