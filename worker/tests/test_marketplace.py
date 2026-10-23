# Tests de marketplace.
# Correr con: TESTING=1 python -m pytest tests/test_marketplace.py -q

import pytest
from unittest.mock import MagicMock, patch


def test_publish_strategy_inserts_and_returns_id(mock_supabase):
    """POST /marketplace/publish debe insertar TODOS los campos requeridos por
    supabase/migrations/0002_tournaments_marketplace.sql y devolver {'id': ...}."""
    inserted: dict = {}

    def capture_insert(payload):
        inserted.update(payload)
        return MagicMock(
            execute=MagicMock(return_value=MagicMock(data=[{"id": "gen-strat-id"}]))
        )

    mock_supabase.table.return_value.insert.side_effect = capture_insert

    # Evita un backtest real de red en el test (el Sello se ejercita en
    # tests/test_marketplace_integrity.py). El flujo de publicación no cambia.
    dummy_bt = {
        "metrics": {"sharpe_oos": 1.0, "ret_total": 0.2},
        "integrity_label": "Media",
        "equity_curve": [],
        "folds_used": 5,
        "data_hash": "testhash",
    }

    with patch("tournaments.get_supabase", return_value=mock_supabase), \
         patch("tournaments.run_backtest", return_value=dummy_bt):
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
        # Devuelve el id generado.
        assert result == {"id": "gen-strat-id", "status": "published"}

        # Campos requeridos por el esquema (NOT NULL / obligatorios del flujo).
        for field in (
            "author_id",
            "title",
            "slug",
            "description",
            "tags",
            "asset_type",
            "symbol",
            "timeframe",
            "config",
            "price_qp_week",
            "status",
            "published_at",
        ):
            assert field in inserted, f"Falta el campo requerido '{field}' en el insert"

        # Valores correctos.
        assert inserted["status"] == "needs_review"
        assert inserted["author_id"] == "00000000-0000-0000-0000-000000000001"  # uid fijo TESTING
        assert inserted["title"] == "BTC · 1d"
        assert inserted["symbol"] == "BTCUSDT"
        assert inserted["asset_type"] == "crypto"
        assert inserted["timeframe"] == "1d"
        assert inserted["config"] == {"fast": 20, "slow": 50}
        assert inserted["price_qp_week"] == 10
        assert inserted["is_public_code"] is True
        assert isinstance(inserted["slug"], str) and inserted["slug"]


def test_marketplace_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[
            {"id": "s1", "title": "Strat 1", "backtest_metrics": {"sharpe_oos": 1.0}, "data_hash": "hash", "price_qp_week": 10, "subscribers": 5},
        ]
    )
    with patch("tournaments.get_supabase", return_value=mock_supabase):
        from tournaments import marketplace_list
        result = marketplace_list()
        assert len(result) >= 1


def test_marketplace_list_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[]
    )
    with patch("tournaments.get_supabase", return_value=mock_supabase):
        from tournaments import marketplace_list
        result = marketplace_list()
        assert result == []


def test_subscribe_to_strategy(mock_supabase):
    # Mock: no hay suscripción previa
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    # Mock: estrategia existe
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "strat-1", "status": "published", "title": "Estrategia", "backtest_metrics": {"sharpe_oos": 1.0}, "data_hash": "hash", "price_qp_week": 0, "author_id": "author-1"}]
    )
    with patch("tournaments.get_supabase", return_value=mock_supabase):
        from tournaments import marketplace_subscribe
        result = marketplace_subscribe("strat-1", MagicMock())
        assert result["status"] == "active"


def test_signals_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[]
    )
    with patch("tournaments.get_supabase", return_value=mock_supabase):
        from tournaments import signals_list
        result = signals_list("strat-1")
        assert result == []


def test_signals_with_data(mock_supabase):
    signals = [
        {"id": "sig1", "direction": "long", "strength": 0.8, "created_at": "2024-01-01"},
        {"id": "sig2", "direction": "short", "strength": 0.6, "created_at": "2024-01-02"},
    ]
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=signals
    )
    with patch("tournaments.get_supabase", return_value=mock_supabase):
        from tournaments import signals_list
        result = signals_list("strat-1")
        assert len(result) == 2


def test_unique_slug_no_se_cuelga_si_todo_esta_ocupado(mock_supabase):
    """REGRESION: _unique_slug usaba `while True`.

    Si la consulta devuelve SIEMPRE datos (mock, o un fallo raro de la DB) el
    request se colgaba para siempre. Se detecto porque este fichero de tests
    bloqueaba la suite completa de forma indefinida.
    """
    ocupado = MagicMock(
        execute=MagicMock(return_value=MagicMock(data=[{"id": "ya-existe"}]))
    )
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value = ocupado

    from tournaments import _unique_slug

    slug = _unique_slug(mock_supabase, "BTCUSDT · 1d", "2ca7b197-86f5-4605")
    assert slug.startswith("btcusdt-1d-")
    assert len(slug) > len("btcusdt-1d-")


def test_unique_slug_tolera_error_de_consulta(mock_supabase):
    """Si la comprobacion del slug revienta, debe devolver algo, no propagar."""
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.side_effect = (
        RuntimeError("DB caida")
    )

    from tournaments import _unique_slug

    slug = _unique_slug(mock_supabase, "Mi Estrategia", "abcdef1234")
    assert slug.startswith("mi-estrategia-")
