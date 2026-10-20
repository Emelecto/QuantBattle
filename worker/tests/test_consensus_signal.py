"""Tests del meta-modelo comunitario cuando la licencia permite publicarlo.

Todo offline: se mockea Supabase (conftest.mock_supabase) con un _Table en
memoria que soporta el encadenamiento y los filtros reales usados por el
código, igual que test_ml_tournaments.py.
"""
import numpy as np
import pandas as pd
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Mock de tabla Supabase con encadenamiento y filtros reales (copiado de
# test_ml_tournaments.py) para que _build_consensus_signal corra de verdad.
# ---------------------------------------------------------------------------
class _Table:
    def __init__(self, store, name):
        self._store = store
        self._name = name
        self._last_insert = None
        self._reset()

    def _reset(self):
        self._filters = []
        self._order = None
        self._limit = None
        self._pk = None
        if self._name == "ml_datasets":
            self._pk = ("tournament_id", "round_number", "kind")
        elif self._name == "prediction_submissions":
            self._pk = ("dataset_id", "user_id")

    def select(self, *a, **k):
        self._reset()
        return self

    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        for r in rows:
            r.setdefault("id", f"{self._name}-{len(self._store.get(self._name, [])) + 1}")
        self._store.setdefault(self._name, []).extend(rows)
        self._last_insert = rows
        return self

    def update(self, payload):
        self._reset()
        data = self._store.get(self._name, [])
        target = self._apply_filters(data)
        for row in (target if self._filters else data):
            row.update(payload)
        return self

    def upsert(self, payload, **kwargs):
        return self.insert(payload)

    def delete(self):
        self._reset()
        data = self._store.get(self._name, [])
        keep = [r for r in data if not self._matches(r)]
        self._store[self._name] = keep
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def neq(self, col, val):
        self._filters.append(("neq", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, vals))
        return self

    def gte(self, col, val):
        self._filters.append(("gte", col, val))
        return self

    def lte(self, col, val):
        self._filters.append(("lte", col, val))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _matches(self, row):
        for op, col, val in self._filters:
            if op == "eq" and row.get(col) != val:
                return False
            if op == "neq" and row.get(col) == val:
                return False
            if op == "in" and row.get(col) not in val:
                return False
            if op == "gte" and not (row.get(col) is not None and row.get(col) >= val):
                return False
            if op == "lte" and not (row.get(col) is not None and row.get(col) <= val):
                return False
        return True

    def _apply_filters(self, data):
        out = [r for r in data if self._matches(r)]
        if self._order:
            col, desc = self._order
            out = sorted(out, key=lambda r: r.get(col) or 0, reverse=desc)
        if self._limit:
            out = out[: self._limit]
        return out

    def execute(self):
        if self._last_insert is not None and not self._filters and self._order is None:
            data = list(self._last_insert)
            self._last_insert = None
            return MagicMock(data=data)
        self._last_insert = None
        data = self._store.get(self._name, [])
        out = self._apply_filters(data)
        return MagicMock(data=out)


@pytest.fixture
def sb(mock_supabase):
    """Supabase mockeado (basado en conftest.mock_supabase) con encadenamiento real."""
    store = {}
    created = {}

    def make_table(name):
        if name not in created:
            created[name] = _Table(store, name)
        return created[name]

    mock_supabase.table.side_effect = make_table
    mock_supabase._store = store
    yield mock_supabase


# ---------------------------------------------------------------------------
# (a) _build_consensus_signal persiste el meta-modelo en consensus_signals
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("data_source,expected_rows", [(None, 1), ("binance_vision", 0)])
def test_build_consensus_signal_respects_data_license(sb, monkeypatch, data_source, expected_rows):
    """Al construir 'meta', _build_consensus_signal guarda una fila en
    consensus_signals (upsert por tournament_id/round_number)."""
    import tournaments as _t
    import ml_scheduler
    import ml_persist
    import scoring_ml as sc

    monkeypatch.setattr(_t, "get_supabase", lambda: sb)

    tid = "11111111-0000-0000-0000-0000000000aa"
    dsid = "22222222-0000-0000-0000-0000000000bb"

    sb._store.setdefault("ml_datasets", [{
        "id": dsid, "tournament_id": tid, "round_number": 7, "kind": "live",
        "status": "ready", "feature_cols": ["f1"],
        "params": {"data_source": data_source} if data_source else {},
    }])
    # Submission válida con score>0 (para que entre en el meta-modelo) y predicciones.
    preds = pd.DataFrame({
        "id": [f"r{i}" for i in range(5)],
        "prediction": np.linspace(-1, 1, 5),
    })
    sb._store.setdefault("prediction_submissions", [{
        "id": "sub1", "dataset_id": dsid, "user_id": "u1", "file_path": "x.csv",
        "is_valid": True, "score": 1.0, "_predicciones_df": preds.copy(),
    }])

    # Mock: cargar_predicciones_validas devuelve un DataFrame dummy (columna sub1)
    # y stake_weight devuelve la Serie del meta-modelo.
    dummy_df = pd.DataFrame({"sub1": np.linspace(0.0, 1.0, 5)}, index=[f"r{i}" for i in range(5)])
    meta_dummy = pd.Series(np.linspace(0.1, 0.9, 5), index=[f"r{i}" for i in range(5)], name="meta")

    with patch.object(ml_persist, "cargar_predicciones_validas", return_value=dummy_df), \
         patch.object(sc, "stake_weight", return_value=meta_dummy), \
         patch.object(ml_persist, "puntuar_submission_en_bd", return_value={"valida": True}):
        ml_scheduler._build_consensus_signal(sb, dsid)

    # Las señales derivadas de Binance Vision no salen al marketplace.
    sigs = sb._store.get("consensus_signals", [])
    assert len(sigs) == expected_rows
    if expected_rows:
        row = sigs[0]
        assert row["tournament_id"] == tid
        assert row["round_number"] == 7
        assert row["dataset_id"] == dsid
        assert row["signal_json"] == meta_dummy.to_dict()
        assert len(row["signal_json"]) == 5


# ---------------------------------------------------------------------------
# (b) GET /marketplace/consensus-signal devuelve la señal guardada
# ---------------------------------------------------------------------------
def test_consensus_signal_endpoint_devuelve_senal(sb, monkeypatch):
    import tournaments as _t
    monkeypatch.setattr(_t, "get_supabase", lambda: sb)

    signal_json = {"r0": 0.1, "r1": 0.2, "r2": -0.3}
    sb._store.setdefault("consensus_signals", [{
        "id": "cs1", "tournament_id": "tid", "round_number": 3,
        "dataset_id": "dsid", "signal_json": signal_json,
        "created_at": "2026-01-01T00:00:00+00:00",
    }])

    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.get("/marketplace/consensus-signal")
    assert r.status_code == 200
    body = r.json()
    assert body["n_signals"] == 3
    assert body["signal"] == signal_json
    assert body["source"] == "meta-modelo comunitario"
    assert body["tournament_id"] == "tid"
    assert body["round_number"] == 3
    assert body["dataset_id"] == "dsid"
    assert body["created_at"] == "2026-01-01T00:00:00+00:00"


def test_consensus_signal_endpoint_filtra_por_torneo(sb, monkeypatch):
    import tournaments as _t
    monkeypatch.setattr(_t, "get_supabase", lambda: sb)

    sb._store.setdefault("consensus_signals", [
        {
            "id": "cs-other", "tournament_id": "tid-otro", "round_number": 1,
            "dataset_id": "dsid-otro", "signal_json": {"r0": 0.0},
            "created_at": "2026-01-01T00:00:00+00:00",
        },
        {
            "id": "cs-x", "tournament_id": "tid-x", "round_number": 9,
            "dataset_id": "dsid-x", "signal_json": {"r0": 0.5},
            "created_at": "2026-02-02T00:00:00+00:00",
        },
    ])

    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.get("/marketplace/consensus-signal?tournament_id=tid-x&round=9")
    assert r.status_code == 200
    body = r.json()
    assert body["tournament_id"] == "tid-x"
    assert body["round_number"] == 9
    assert body["signal"] == {"r0": 0.5}


def test_consensus_signal_endpoint_404_si_no_hay(sb, monkeypatch):
    import tournaments as _t
    monkeypatch.setattr(_t, "get_supabase", lambda: sb)

    # Sin filas en consensus_signals -> 404 claro.
    sb._store.setdefault("consensus_signals", [])

    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    r = client.get("/marketplace/consensus-signal")
    assert r.status_code == 404
