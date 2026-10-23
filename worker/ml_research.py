"""Fichas privadas e inmutables ligadas a los bytes de cada envío ML."""
import base64
import json
from datetime import datetime, timezone

from fastapi import HTTPException
import ml_storage as store


def parse_experiment_header(header: str | None) -> dict | None:
    if header is None:
        return None
    try:
        if len(header) > 6000:
            raise ValueError()
        raw = base64.b64decode(header, validate=True)
        if len(raw) > 4096:
            raise ValueError()
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict) or set(value) - {"model_name", "parameters", "seed", "note"}:
            raise ValueError()
        name = value.get("model_name", "").strip()
        note = value.get("note", "").strip()
        params = value.get("parameters", {})
        seed = value.get("seed")
        if not isinstance(name, str) or not 1 <= len(name) <= 100 or any(ord(c) < 32 for c in name):
            raise ValueError()
        if not isinstance(note, str) or len(note) > 1000 or not isinstance(params, dict):
            raise ValueError()
        if len(json.dumps(params, allow_nan=False).encode()) > 2048:
            raise ValueError()
        if seed is not None and (type(seed) is not int or not 0 <= seed <= 4294967295):
            raise ValueError()
        return {"model_name": name, "parameters": params, "seed": seed, "note": note}
    except (ValueError, TypeError, AttributeError, UnicodeError, RecursionError):
        raise HTTPException(422, "Ficha inválida: indica modelo (máx. 100 caracteres), parámetros JSON (2 KB), semilla entera opcional y nota (máx. 1000 caracteres).") from None


def save_experiment(path: str, submission_id: str, dataset: dict, digest: str, metadata: dict | None) -> None:
    if metadata is None:
        return
    document = {"schema_version": 1, "submission_id": submission_id,
                "dataset_id": dataset["id"], "dataset_version": dataset["version"],
                "file_sha256": digest, "created_at": datetime.now(timezone.utc).isoformat(),
                "experiment": metadata}
    store.upload_experiment(document, path + ".experiment.json")


def enrich_experiment(row: dict, dataset: dict, tournament: dict) -> dict:
    """Nunca devuelve rutas privadas ni scores de una ronda que no esté puntuada."""
    result = {k: row.get(k) for k in (
        "id", "dataset_id", "submitted_at", "status", "row_count", "is_selected",
        "file_sha256", "dataset_version",
    )}
    result["score"] = row.get("score") if dataset.get("status") == "scored" else None
    result["round"] = {k: dataset.get(k) for k in ("tournament_id", "round_number", "mode", "status", "closes_at", "version", "score_version")}
    result["round"]["name"] = tournament.get("name", "Ronda ML")
    result["round"]["benchmarks"] = dataset.get("benchmarks") if dataset.get("status") == "scored" else None
    result["experiment"] = None
    result["metadata_status"] = "legacy"
    path = row.get("file_path")
    if path and path.endswith(".experiment.csv"):
        try:
            document = store.download_experiment(path + ".experiment.json")
            if document is not None:
                if any(document.get(key) != row.get(key) for key in ("dataset_id", "dataset_version", "file_sha256")) or document.get("submission_id") != row["id"]:
                    raise ValueError("La ficha no corresponde al comprobante")
                result["experiment"] = document["experiment"]
                result["metadata_status"] = "ready"
        except Exception:
            result["metadata_status"] = "unavailable"
    return result
