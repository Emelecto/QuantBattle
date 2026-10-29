"""Piloto técnico REAL de API/Storage/DB, con una cuenta y ronda sintéticas.

No envía correos, no usa cuentas de participantes y no altera la ronda semanal.
Prepare crea una ronda separada; finalize espera su cierre real antes de puntuar.
Credenciales: variables de entorno o worker/.env y web/.env.local (nunca se imprimen).
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))

import pandas as pd
import requests
from dotenv import load_dotenv


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def setup():
    load_dotenv(ROOT / "worker/.env")
    load_dotenv(ROOT / "web/.env.local")
    if os.getenv("TESTING") or os.getenv("ALLOW_TEST_AUTH"):
        raise RuntimeError("Este piloto exige autenticación real; retirar TESTING/ALLOW_TEST_AUTH")
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    service = create_client(url, os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    public_key = os.environ.get("SUPABASE_ANON_KEY") or os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    worker = os.environ.get("WORKER_URL") or os.environ["NEXT_PUBLIC_WORKER_URL"]
    return service, url, public_key, worker.rstrip("/")


def public_frame(worker, row):
    response = requests.get(f"{worker}/ml/datasets/{row['id']}/download", params={"kind": row["kind"]}, timeout=60)
    response.raise_for_status()
    content = requests.get(response.json()["url"], timeout=60)
    content.raise_for_status()
    frame = pd.read_parquet(io.BytesIO(content.content))
    from ml_persist import verify_frame_hash
    if not verify_frame_hash(frame, row["data_hash"]):
        raise AssertionError("Archivo público no coincide con su hash")
    return frame


def prepare(args):
    sb, url, public_key, worker = setup()
    if args.manifest.exists():
        raise RuntimeError("El manifiesto ya existe; use finalize o una ruta nueva para otro piloto")
    from supabase import create_client
    import ml_persist
    from research_benchmark import train_reference

    # Cuenta identificada como técnica; admin.create_user con email_confirm no envía correo.
    email, password = "technical-demo@quantbattle.example", secrets.token_urlsafe(32)
    user = next((u for u in sb.auth.admin.list_users(page=1, per_page=1000) if u.email == email), None)
    if user is None:
        user = sb.auth.admin.create_user({
            "email": email, "password": password, "email_confirm": True,
            "user_metadata": {"username": "ql_technical_demo", "display_name": "Cuenta técnica · demostración sintética"},
        }).user
    else:
        sb.auth.admin.update_user_by_id(user.id, {"password": password})
    session = create_client(url, public_key).auth.sign_in_with_password({"email": email, "password": password})
    headers = {"Authorization": f"Bearer {session.session.access_token}", "Content-Type": "text/csv"}
    now = datetime.now(timezone.utc)
    closes = (now + timedelta(minutes=args.minutes)).isoformat()
    existing = sb.table("tournaments").select("id").eq("slug", "ml-judges-synthetic").execute().data
    fields = {
        "name": "Demostración técnica · ML sintético", "slug": "ml-judges-synthetic",
        "type": "ml", "status": "open", "asset_type": "synthetic", "symbols": [],
        "timeframe": "1d", "data_start": str(now.date()), "data_end": str(now.date()),
        "eval_end": str(now.date()), "submission_deadline": closes, "prize_pool_qp": 0,
        "primary_metric": "spearman_era_v1", "min_trades": 0, "max_slippage_pct": 0.005,
        "rules_text": "Demostración técnica con mercado artificial y una cuenta de prueba del proyecto. No representa usuarios externos, rentabilidad ni una predicción de mercado real. Solo el último CSV válido antes del cierre compite; Spearman medio por era después del cierre; sin premios QP.",
    }
    if existing:
        tid = existing[0]["id"]
        sb.table("tournaments").update(fields).eq("id", tid).execute()
    else:
        tid = sb.table("tournaments").insert(fields).execute().data[0]["id"]
    last = sb.table("ml_datasets").select("round_number").eq("tournament_id", tid).order("round_number", desc=True).limit(1).execute().data
    number = last[0]["round_number"] + 1 if last else 1
    live_row = ml_persist.crear_dataset(
        tid, number, mode="sintetico", round_type="practice", now=now, closes_at=closes,
        n_activos=160, n_eras=100, n_features=20, n_features_utiles=6,
        ic_objetivo=0.08, seed=20261019,
    )
    manifest = {
        "tournament_id": tid, "dataset_id": live_row["id"], "user_id": user.id,
        "round_number": number, "version": live_row["version"], "closes_at": closes,
        "worker_url": worker, "prepared_at": now.isoformat(), "checks": {},
        "synthetic": True, "external_participants": 0,
        "generator": {"seed": 20261019, "n_assets": 160, "n_eras": 100, "n_features": 20, "ic_objetivo": 0.08},
    }
    save(args.manifest, manifest)  # permite recuperar el cierre si falla una comprobación
    rows = sb.table("ml_datasets").select("id,kind,data_hash,row_count").eq("tournament_id", tid).eq("round_number", number).execute().data
    frames = {row["kind"]: public_frame(worker, row) for row in rows}
    live = frames["live"]
    assert "target" not in live and "target" in frames["train"] and "target" in frames["validation"]
    checks = manifest["checks"]
    checks["public_downloads_and_hashes"] = True
    checks["live_without_target"] = True
    endpoint = f"{worker}/ml/datasets/{live_row['id']}/predictions"
    unauth = requests.post(endpoint, data=b"id,prediction\na,0.5\n", timeout=60)
    assert unauth.status_code == 401, unauth.status_code
    checks["authentication_required"] = True
    invalid = requests.post(endpoint, headers=headers, data=b"id,prediction\na,inf\n", timeout=60)
    assert invalid.status_code == 422, invalid.text
    checks["invalid_csv_rejected"] = True
    first = live[["id", "feature_01"]].rename(columns={"feature_01": "prediction"})
    response = requests.post(endpoint, headers=headers, data=first.to_csv(index=False).encode(), timeout=60)
    response.raise_for_status()
    first_id = response.json()["submission"]["id"]
    predictions, model = train_reference(frames["train"], frames["validation"], live)
    payload = predictions.to_csv(index=False).encode()
    response = requests.post(endpoint, headers=headers, data=payload, timeout=60)
    response.raise_for_status()
    receipt = response.json()["submission"]
    assert receipt["status"] == "validated" and receipt["is_selected"]
    assert receipt["file_sha256"] == hashlib.sha256(payload).hexdigest()
    prior = sb.table("prediction_submissions").select("is_selected").eq("id", first_id).execute().data[0]
    assert prior["is_selected"] is False
    checks["last_valid_submission_selected"] = True
    checks["submission_hash_receipt"] = True
    ranking = requests.get(f"{worker}/ml/leaderboard", params={"dataset_id": live_row["id"]}, timeout=60)
    ranking.raise_for_status()
    assert ranking.json()["leaderboard"] == []
    current = requests.get(f"{worker}/ml/predictions/mine", params={"dataset_id": live_row["id"]}, headers=headers, timeout=60)
    current.raise_for_status()
    assert current.json()["submission"]["score"] is None
    checks["no_score_before_close"] = True
    target_url = f"{url}/storage/v1/object/public/tournament-targets/{live_row['target_path']}"
    assert requests.get(target_url, timeout=30).status_code >= 400
    checks["private_target_not_publicly_downloadable"] = True
    anon = requests.get(f"{url}/rest/v1/ml_datasets", params={"select": "target_path", "id": f"eq.{live_row['id']}"}, headers={"apikey": public_key, "Authorization": f"Bearer {public_key}"}, timeout=30)
    assert anon.status_code in (401, 403), anon.status_code
    checks["private_metadata_not_readable_anonymously"] = True
    manifest.update({"model": model, "selected_submission_id": receipt["id"], "row_counts": {k: len(f) for k, f in frames.items()}, "checks": checks})
    save(args.manifest, manifest)
    args.manifest.with_name("predictions.csv").write_bytes(payload)
    print(json.dumps({"prepared": True, "dataset_id": live_row["id"], "closes_at": closes, "checks_passed": len(checks)}, ensure_ascii=False))


def finalize(args):
    sb, auth_url, public_key, worker = setup()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    ds = sb.table("ml_datasets").select("*").eq("id", manifest["dataset_id"]).execute().data[0]
    if datetime.now(timezone.utc) <= datetime.fromisoformat(ds["closes_at"]):
        raise RuntimeError(f"El plazo sigue abierto hasta {ds['closes_at']}; no se modifica para acelerar resultados")
    import ml_scheduler, ml_storage, ml_persist
    from ml_protocol import score_predictions
    from research_benchmark import random_reference
    if ds["status"] != "scored":
        assert ml_scheduler._finalize_v1_round(sb, ds, datetime.now(timezone.utc))
    scored = sb.table("prediction_submissions").select("status,score,file_path,file_sha256,is_selected").eq("id", manifest["selected_submission_id"]).execute().data[0]
    assert scored["status"] == "scored" and scored["is_selected"]
    live = public_frame(worker, {"id": ds["id"], "kind": "live", "data_hash": ds["data_hash"]})
    targets = ml_storage.download_private_parquet(ds["target_path"])
    payload = ml_storage.download_csv(scored["file_path"], expected_sha256=scored["file_sha256"])
    invalid_auth = requests.post(f"{worker}/ml/datasets/{ds['id']}/predictions", headers={"Content-Type": "text/csv", "Authorization": "Bearer invalid-test-token"}, data=payload, timeout=60)
    assert invalid_auth.status_code == 401
    manifest["checks"]["invalid_bearer_rejected"] = True
    result = score_predictions(pd.read_csv(io.BytesIO(payload), dtype={"id": str}), targets, min_eras=10)
    assert abs(result["score"] - scored["score"]) < 1e-12
    random_score = score_predictions(random_reference(live, ds["version"]), targets, min_eras=10)
    feature_score = score_predictions(live[["id", "feature_01"]].rename(columns={"feature_01": "prediction"}), targets, min_eras=10)
    ranking = requests.get(f"{worker}/ml/leaderboard", params={"dataset_id": ds["id"]}, timeout=60)
    ranking.raise_for_status()
    assert any(row["user_id"] == manifest["user_id"] for row in ranking.json()["leaderboard"])
    from supabase import create_client
    password = secrets.token_urlsafe(32)
    sb.auth.admin.update_user_by_id(manifest["user_id"], {"password": password})
    session = create_client(auth_url, public_key).auth.sign_in_with_password({"email": "technical-demo@quantbattle.example", "password": password})
    closed = requests.post(f"{worker}/ml/datasets/{ds['id']}/predictions", headers={"Content-Type": "text/csv", "Authorization": f"Bearer {session.session.access_token}"}, data=payload, timeout=60)
    assert closed.status_code == 409, closed.status_code
    fresh = sb.table("ml_datasets").select("*").eq("id", ds["id"]).execute().data[0]
    assert abs(fresh["benchmarks"]["random"] - random_score["score"]) < 1e-12
    assert abs(fresh["benchmarks"]["feature_01"] - feature_score["score"]) < 1e-12
    assert ml_scheduler._finalize_v1_round(sb, fresh, datetime.now(timezone.utc)) is False
    manifest["checks"].update({"score_after_real_deadline": True, "score_reproduced_exactly": True, "public_ranking_after_close": True, "late_submission_rejected": True, "idempotent_finalization": True})
    import sklearn, numpy, scipy, pyarrow
    manifest.update({
        "completed_at": datetime.now(timezone.utc).isoformat(), "status": "completed",
        "results": {"model": result, "random_reference": random_score, "feature_reference": feature_score},
        "public_frame_hashes": {row["kind"]: row["data_hash"] for row in sb.table("ml_datasets").select("kind,data_hash").eq("tournament_id", ds["tournament_id"]).eq("round_number", ds["round_number"]).execute().data},
        "target_hash_after_close": ds["target_hash"],
        "versions": {"python": sys.version.split()[0], "pandas": pd.__version__, "numpy": numpy.__version__, "scipy": scipy.__version__, "pyarrow": pyarrow.__version__, "scikit_learn": sklearn.__version__},
        "limitations": ["Mercado totalmente artificial: no demuestra capacidad de pronosticar mercados reales.", "Una ronda y una cuenta técnica: no es validación con usuarios externos.", "Spearman mide orden relativo; no incluye ejecución, costos ni rentabilidad.", "La selección del modelo usó validation; live se puntuó únicamente tras el cierre."],
    })
    save(args.manifest, manifest)
    public_report = {k: v for k, v in manifest.items() if k not in ("user_id", "selected_submission_id")}
    save(ROOT / "web/public/research/judge-pilot.json", public_report)
    print(json.dumps({"completed": True, "checks_passed": len(manifest["checks"]), "model_score": result["score"], "random_score": random_score["score"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "finalize"))
    parser.add_argument("--manifest", type=Path, default=ROOT / "artifacts/judge-pilot/manifest.json")
    parser.add_argument("--minutes", type=int, default=8)
    args = parser.parse_args()
    if not 2 <= args.minutes <= 60:
        parser.error("--minutes debe estar entre 2 y 60")
    (prepare if args.action == "prepare" else finalize)(args)
