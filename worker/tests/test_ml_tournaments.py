"""Pruebas de contrato para una ronda ML, con Supabase y Storage simulados."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

import dataset_builder as builder
import ml_persist
import ml_protocol
import ml_scheduler
import ml_storage
import ml_prospective

USER = "00000000-0000-0000-0000-000000000001"


class Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters = []
        self.action, self.payload = "select", None
        self.order_by, self.max_rows, self.start = None, None, 0

    def select(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.action, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.action, self.payload = "update", payload
        return self

    def eq(self, key, value):
        self.filters.append(lambda row: row.get(key) == value)
        return self

    def neq(self, key, value):
        self.filters.append(lambda row: row.get(key) != value)
        return self

    def in_(self, key, values):
        self.filters.append(lambda row: row.get(key) in values)
        return self

    def gte(self, key, value):
        self.filters.append(lambda row: row.get(key) is not None and row[key] >= value)
        return self

    def lte(self, key, value):
        self.filters.append(lambda row: row.get(key) is not None and row[key] <= value)
        return self

    def range(self, start, end):
        self.start, self.max_rows = start, end - start + 1
        return self

    def order(self, key, desc=False):
        self.order_by = (key, desc)
        return self

    def limit(self, value):
        self.max_rows = value
        return self

    def offset(self, value):
        self.start = value
        return self

    def execute(self):
        rows = self.db.rows.setdefault(self.table, [])
        if self.action == "insert":
            values = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for item in values:
                row = dict(item)
                row.setdefault("id", f"{self.table}-{len(rows) + 1}")
                row.setdefault("submitted_at", datetime.now(timezone.utc).isoformat())
                rows.append(row)
                inserted.append(dict(row))
            return SimpleNamespace(data=inserted)
        selected = [row for row in rows if all(fn(row) for fn in self.filters)]
        if self.order_by:
            key, descending = self.order_by
            selected.sort(key=lambda row: row.get(key) or "", reverse=descending)
        selected = selected[self.start:]
        if self.max_rows is not None:
            selected = selected[:self.max_rows]
        if self.action == "update":
            for row in selected:
                row.update(self.payload)
        return SimpleNamespace(data=[dict(row) for row in selected])


class FakeSupabase:
    def __init__(self):
        self.rows = {}

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, payload):
        def execute():
            assert name == "activate_ml_submission"
            sub = next(row for row in self.rows["prediction_submissions"]
                       if row["id"] == payload["p_submission"])
            ds = next(row for row in self.rows["ml_datasets"] if row["id"] == sub["dataset_id"])
            assert ds["status"] == "ready" and sub["dataset_version"] == ds["version"]
            assert datetime.fromisoformat(ds["closes_at"]) > datetime.now(timezone.utc)
            for row in self.rows["prediction_submissions"]:
                if row["dataset_id"] == sub["dataset_id"] and row["user_id"] == sub["user_id"]:
                    row["is_selected"] = row["id"] == sub["id"]
            return SimpleNamespace(data=True)
        return SimpleNamespace(execute=execute)


@pytest.fixture
def backend(monkeypatch):
    import main
    import tournaments
    monkeypatch.setenv("ML_REAL_ROUNDS_APPROVED", "true")

    db, files = FakeSupabase(), {}
    monkeypatch.setattr(tournaments, "get_supabase", lambda: db)

    def save_frame(frame, path):
        files[path] = frame.copy()
        return path

    def save_csv(data, path):
        files[path] = data.encode() if isinstance(data, str) else data
        return path

    def read_csv(path, expected_sha256=None, **_kwargs):
        data = files[path]
        if expected_sha256:
            assert hashlib.sha256(data).hexdigest() == expected_sha256
        return data

    monkeypatch.setattr(ml_storage, "upload_parquet", save_frame)
    monkeypatch.setattr(ml_storage, "download_parquet", lambda path, **_kw: files[path].copy())
    monkeypatch.setattr(ml_storage, "upload_private_parquet", save_frame)
    monkeypatch.setattr(ml_storage, "download_private_parquet", lambda path: files[path].copy())
    monkeypatch.setattr(ml_storage, "upload_experiment", lambda document, path: files.update({path: document.copy()}))
    monkeypatch.setattr(ml_storage, "download_experiment", lambda path: files.get(path))
    monkeypatch.setattr(ml_storage, "upload_csv", save_csv)
    monkeypatch.setattr(ml_storage, "download_csv", read_csv)
    monkeypatch.setattr(ml_storage, "public_url", lambda path: f"https://fake.storage/{path}")
    return db, files, TestClient(main.app)


def make_round(backend, *, number=1, seed=1):
    _db, files, _client = backend
    panel, cols, meta = builder.generar_mercado_sintetico(
        n_activos=40, n_eras=60, n_features=10, n_features_utiles=5, seed=seed,
    )
    with patch.object(builder, "generar_mercado_sintetico", return_value=(panel, cols, meta)):
        live = ml_persist.crear_dataset(
            "tournament-1", number, mode="sintetico",
            closes_at=(datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            n_activos=40, n_eras=60, n_features=10, n_features_utiles=5, seed=seed,
        )
    return live, files[live["bucket_path"]]


def test_round_publishes_features_but_seals_targets(backend):
    db, files, client = backend
    live, public = make_round(backend)
    assert live["status"] == "ready"
    assert live["quality_report"]["passed"]
    assert "target" not in public.columns
    assert "target" in files[live["target_path"]].columns
    # El orden de filas público no puede actuar como índice estable del activo.
    assert public["id"].tolist() != files[live["target_path"]]["row_id"].tolist()
    assert all(row["status"] == "ready" for row in db.rows["ml_datasets"])
    result = client.get("/ml/datasets", params={"tournament_id": "tournament-1"})
    assert result.status_code == 200 and len(result.json()["datasets"]) == 3
    assert "target_path" not in result.text


def test_research_receipt_history_is_private_and_bound_to_csv(backend):
    import base64
    import json
    db, files, client = backend
    live, public = make_round(backend)
    content = public[["id", "feature_01"]].rename(columns={"feature_01": "prediction"}).to_csv(index=False).encode()
    metadata = {"model_name": "Modelo técnico", "parameters": {"depth": 4}, "seed": 42, "note": "Solo train y validation"}
    headers = {"Authorization": "Bearer x", "Content-Type": "text/csv", "X-QuantLab-Experiment": base64.b64encode(json.dumps(metadata).encode()).decode()}
    response = client.post(f"/ml/datasets/{live['id']}/predictions", content=content, headers=headers)
    assert response.status_code == 200, response.text
    receipt = response.json()["submission"]
    stored = db.rows["prediction_submissions"][0]
    document = files[stored["file_path"] + ".experiment.json"]
    assert document["file_sha256"] == receipt["file_sha256"] and document["experiment"] == metadata
    stored["score"] = 0.99  # Incluso si hubiese un valor interno, la API no lo revela antes de scored.
    db.rows["prediction_submissions"].append({**stored, "id": "other", "user_id": "someone-else"})
    with patch.dict("os.environ", {"ALLOW_TEST_AUTH": "0"}):
        assert client.get("/ml/experiments").status_code == 401
    history = client.get("/ml/experiments", headers={"Authorization": "Bearer x"})
    assert history.status_code == 200, history.text
    entries = history.json()["entries"]
    assert len(entries) == 1 and entries[0]["experiment"] == metadata
    assert entries[0]["score"] is None and entries[0]["round"]["benchmarks"] is None
    assert "file_path" not in history.text and "user_id" not in history.text
    index = client.get(f"/ml/datasets/{live['id']}/rows")
    assert index.status_code == 200 and index.json()["columns"] == ["id", "era"]
    assert len(index.json()["rows"]) == len(public) and "target" not in index.text
    assert client.get("/ml/experiments?limit=500", headers={"Authorization": "Bearer x"}).status_code == 422
    assert client.get("/ml/experiments?snapshot=invalid", headers={"Authorization": "Bearer x"}).status_code == 422
    files[stored["file_path"] + ".experiment.json"]["file_sha256"] = "tampered"
    changed = client.get("/ml/experiments", headers={"Authorization": "Bearer x"}).json()["entries"][0]
    assert changed["experiment"] is None and changed["metadata_status"] == "unavailable"


def test_invalid_experiment_never_replaces_selected_submission(backend):
    db, _files, client = backend
    live, public = make_round(backend)
    content = public[["id", "feature_01"]].rename(columns={"feature_01": "prediction"}).to_csv(index=False).encode()
    path = f"/ml/datasets/{live['id']}/predictions"
    headers = {"Authorization": "Bearer x", "Content-Type": "text/csv"}
    first = client.post(path, content=content, headers=headers)
    assert first.status_code == 200
    assert client.post(path, content=content, headers={**headers, "X-QuantLab-Experiment": "not-base64"}).status_code == 422
    assert len(db.rows["prediction_submissions"]) == 1 and db.rows["prediction_submissions"][0]["is_selected"] is True


@pytest.mark.parametrize("bad", [
    b"id,other\na,0.2\n", b"id,prediction\na,inf\n",
    b"id,prediction\na,-0.1\n", b"id,prediction\na,0.1\na,0.2\n",
    b"id,prediction\na,0.2,extra\n",
])
def test_invalid_files_rejected_before_scoring(backend, bad):
    _db, _files, client = backend
    live, _ = make_round(backend)
    result = client.post(f"/ml/datasets/{live['id']}/predictions", content=bad,
                         headers={"Content-Type": "text/csv", "Authorization": "Bearer x"})
    assert result.status_code == 422


def test_replacement_close_and_idempotent_finalization(backend):
    db, _files, client = backend
    live, public = make_round(backend)
    path = f"/ml/datasets/{live['id']}/predictions"
    headers = {"Content-Type": "text/csv", "Authorization": "Bearer x"}
    first_csv = public[["id", "feature_01"]].rename(columns={"feature_01": "prediction"}).to_csv(index=False).encode()
    first = client.post(path, content=first_csv, headers=headers)
    assert first.status_code == 200, first.text
    receipt = first.json()["submission"]
    assert receipt["status"] == "validated"
    assert receipt["file_sha256"] == hashlib.sha256(first_csv).hexdigest()
    assert client.get("/ml/leaderboard", params={"dataset_id": live["id"]}).json()["leaderboard"] == []
    assert client.post(f"/ml/submissions/{receipt['id']}/evaluate", headers=headers).status_code == 410

    second_csv = public[["id", "feature_02"]].rename(columns={"feature_02": "prediction"}).to_csv(index=False).encode()
    second = client.post(path, content=second_csv, headers=headers)
    assert second.status_code == 200, second.text
    subs = db.rows["prediction_submissions"]
    assert len(subs) == 2 and [row["is_selected"] for row in subs] == [False, True]
    assert "score" not in subs[0] and "score" not in subs[1]

    db.rows["ml_datasets"][-1]["closes_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    assert ml_scheduler.evaluate_ml_rounds(db) == 1
    assert subs[1]["status"] == "scored" and isinstance(subs[1]["score"], float)
    assert subs[0]["status"] == "validated"
    assert set(db.rows["ml_datasets"][-1]["benchmarks"]) == {"random", "feature_01"}
    assert ml_scheduler.evaluate_ml_rounds(db) == 0
    assert not ml_scheduler._finalize_v1_round(db, db.rows["ml_datasets"][-1], datetime.now(timezone.utc))
    ranking = client.get("/ml/leaderboard", params={"dataset_id": live["id"]}).json()["leaderboard"]
    assert len(ranking) == 1 and ranking[0]["user_id"] == USER


def test_chunked_upload_is_bounded_without_content_length(backend, monkeypatch):
    import ml_endpoints
    _db, _files, client = backend
    live, _ = make_round(backend)
    monkeypatch.setattr(ml_endpoints, "_MAX_CSV_BYTES", 64)
    response = client.post(
        f"/ml/datasets/{live['id']}/predictions",
        content=iter([b"id,prediction\n", b"x" * 80]),
        headers={"Content-Type": "text/csv", "Authorization": "Bearer x"},
    )
    assert response.status_code == 413


def test_real_generation_requires_explicit_source_approval(monkeypatch):
    import generate_dataset_github
    import supabase
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test")
    monkeypatch.setenv("ML_ROUND_MODE", "real")
    monkeypatch.delenv("ML_REAL_ROUNDS_APPROVED", raising=False)
    monkeypatch.setattr(supabase, "create_client", lambda *_args: object())
    assert generate_dataset_github.main() == 1


def test_ml_round_does_not_award_qp_from_legacy_tournament_pool(backend):
    db, _files, client = backend
    live, public = make_round(backend)
    db.rows["tournaments"] = [{"id": live["tournament_id"], "prize_pool_qp": 100}]
    live_row = next(row for row in db.rows["ml_datasets"] if row["kind"] == "live")
    live_row["round_type"] = "prospective"
    live_row["params"] = {
        "data_source": "binance_vision",
        "data_license": "CC BY-NC-SA 4.0",
    }
    live_row["closes_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    csv_data = public[["id", "feature_01"]].rename(
        columns={"feature_01": "prediction"},
    ).to_csv(index=False).encode()
    response = client.post(
        f"/ml/datasets/{live['id']}/predictions", content=csv_data,
        headers={"Content-Type": "text/csv", "Authorization": "Bearer x"},
    )
    assert response.status_code == 409  # la ronda ya cerró

    live_row["closes_at"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    response = client.post(
        f"/ml/datasets/{live['id']}/predictions", content=csv_data,
        headers={"Content-Type": "text/csv", "Authorization": "Bearer x"},
    )
    assert response.status_code == 200
    live_row["closes_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

    assert ml_scheduler.evaluate_ml_rounds(db) == 1
    assert live_row["status"] == "scored"
    submission = db.rows["prediction_submissions"][0]
    assert submission.get("qp_earned", 0) == 0


def test_round_specific_ids_and_hashes(backend):
    first, rows_one = make_round(backend, number=1, seed=11)
    second, rows_two = make_round(backend, number=2, seed=12)
    assert first["version"] != second["version"]
    assert set(rows_one["id"]).isdisjoint(set(rows_two["id"]))


def test_round_scheduler_ignores_recent_legacy_mode_mismatch(backend, monkeypatch):
    db, _files, _client = backend
    now = datetime.now(timezone.utc)
    db.rows["ml_datasets"] = [{
        "id": "legacy-live", "kind": "live", "round_type": "historical",
        "mode": "sintetico", "score_version": "legacy", "status": "ready",
        "created_at": now.isoformat(),
    }]
    monkeypatch.setattr(
        ml_persist, "crear_dataset",
        lambda *_args, **kwargs: {"id": "new-real-live", **kwargs},
    )

    live = ml_scheduler.create_ml_round(
        db, mode="real", round_type="historical", now=now,
        universo=[("crypto", f"TEST{i:02d}USDT") for i in range(30)],
        dias=900, data_source="binance_vision",
    )

    assert live is not None and live["id"] == "new-real-live"
    assert live["mode"] == "real" and live["round_type"] == "historical"


def test_round_scheduler_skips_recent_current_protocol_round(backend, monkeypatch):
    db, _files, _client = backend
    now = datetime.now(timezone.utc)
    db.rows["ml_datasets"] = [{
        "id": "current-live", "kind": "live", "round_type": "historical",
        "mode": "real", "score_version": ml_protocol.SCORE_VERSION,
        "status": "ready", "created_at": now.isoformat(),
    }]
    monkeypatch.setattr(
        ml_persist, "crear_dataset",
        lambda *_args, **kwargs: pytest.fail("no debe duplicar una ronda vigente"),
    )

    assert ml_scheduler.create_ml_round(
        db, mode="real", round_type="historical", now=now,
        universo=[("crypto", f"TEST{i:02d}USDT") for i in range(30)],
        dias=900, data_source="binance_vision",
    ) is None


def test_round_scheduler_does_not_skip_weekly_slot_after_late_job(backend, monkeypatch):
    db, _files, _client = backend
    now = datetime.now(timezone.utc)
    db.rows["ml_datasets"] = [{
        "id": "previous-week-live", "kind": "live", "round_type": "historical",
        "mode": "real", "score_version": ml_protocol.SCORE_VERSION,
        "status": "scored", "created_at": (now - timedelta(days=7, minutes=-2)).isoformat(),
    }]
    monkeypatch.setattr(
        ml_persist, "crear_dataset",
        lambda *_args, **kwargs: {"id": "weekly-live", **kwargs},
    )

    live = ml_scheduler.create_ml_round(
        db, mode="real", round_type="historical", now=now,
        universo=[("crypto", f"TEST{i:02d}USDT") for i in range(30)],
        dias=900, data_source="binance_vision",
    )

    assert live is not None and live["id"] == "weekly-live"


def test_quality_gate_rejects_small_universe():
    panel, cols, _ = builder.generar_mercado_sintetico(n_activos=2, n_eras=60, n_features=10, seed=1)
    _, internal, mapping = builder.obfuscar(panel, cols, salt="test", seed=1)
    with pytest.raises(ValueError, match="activos"):
        ml_protocol.validate_round_parts(builder.partir(internal), mapping["feat_cols"],
                                         min_assets=30, min_test_eras=10)


def test_prospective_target_starts_after_submission_deadline(backend, monkeypatch):
    db, files, client = backend
    as_of = pd.Timestamp(datetime.now(timezone.utc).date()) - pd.Timedelta(days=1)
    dates = pd.date_range(end=as_of, periods=270, freq="D", tz="UTC")
    future = pd.date_range(start=as_of + pd.Timedelta(days=1), periods=10, freq="D", tz="UTC")
    all_dates = dates.append(future)
    universe = [("crypto", f"COIN{i:02d}USDT") for i in range(35)]
    prices = {}
    for index, (_type, symbol) in enumerate(universe):
        rng = np.random.default_rng(index + 100)
        returns = rng.normal(0.0003 + index * 0.00001, 0.01, len(all_dates))
        prices[symbol] = pd.DataFrame({
            "close": 100 * np.exp(np.cumsum(returns)),
            "volume": np.full(len(all_dates), 100000 + index * 1000),
        }, index=all_dates)

    def get_prices(asset_type, symbol, timeframe, start, end, **_kwargs):
        cutoff = pd.Timestamp(end)
        cutoff = cutoff.tz_localize("UTC") if cutoff.tz is None else cutoff.tz_convert("UTC")
        return prices[symbol].loc[prices[symbol].index < cutoff].copy()

    import data_feed
    monkeypatch.setattr(data_feed, "get_ohlcv", get_prices)
    build_at = (as_of + pd.Timedelta(days=1, hours=6)).to_pydatetime()
    deadline = build_at + timedelta(hours=24)
    live = ml_persist.crear_dataset(
        "prospective-tournament", 1, mode="real", round_type="prospective",
        closes_at=deadline.isoformat(), now=build_at,
        universo=universe, fin=build_at, dias=900, data_source="binance_vision",
        timeframe="1d",
    )
    assert live["target_hash"] is None
    assert live["params"]["data_source"] == "binance_vision"
    assert live["params"]["data_license"] == "CC BY-NC-SA 4.0"
    assert live["mapping_path"] in files
    assert "target" not in files[live["bucket_path"]].columns
    listing = client.get("/ml/datasets", params={"tournament_id": "prospective-tournament"})
    live_public = next(item for item in listing.json()["datasets"] if item["kind"] == "live")
    assert live_public["data_attribution"] == "Binance Vision"
    assert live_public["derived_data_license"] == "CC BY-NC-SA 4.0"
    assert "params" not in live_public and "COIN00USDT" not in listing.text
    download = client.get(f"/ml/datasets/{live['id']}/download", params={"kind": "live"})
    assert download.json()["data_license"] == "CC BY-NC-SA 4.0"
    assert download.json()["data_attribution"] == "Binance Vision"

    base_date = pd.Timestamp(deadline.date(), tz="UTC")
    before = (base_date + pd.Timedelta(days=5)).to_pydatetime()
    assert not ml_prospective.resolve_round(db, live, before)
    assert live["target_path"] not in files
    after = (base_date + pd.Timedelta(days=6, hours=1)).to_pydatetime()
    assert ml_prospective.resolve_round(db, live, after)
    resolved = db.rows["ml_datasets"][-1]
    assert resolved["target_hash"] and resolved["status"] == "closed"
    assert files[live["target_path"]]["target"].notna().all()
