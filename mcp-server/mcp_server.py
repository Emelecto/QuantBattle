"""QuantBattle MCP: descubre torneos ML, prepara datasets y registra predicciones."""
from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer


WORKER = (
    os.environ.get("QUANTBATTLE_WORKER_URL")
    or os.environ.get("QUANTLAB_WORKER_URL")
    or "https://quantlab2.onrender.com"
).rstrip("/")
TOKEN = (os.environ.get("QUANTBATTLE_TOKEN") or os.environ.get("QUANTLAB_TOKEN", "")).strip()
TIMEOUT = httpx.Timeout(60.0, connect=15.0)
MAX_CSV_BYTES = 10 * 1024 * 1024

mcp = MCPServer(
    name="quantbattle",
    instructions=(
        "Ayudas a empezar y participar en los torneos de predicción ML de QuantBattle. "
        "Hay dos protocolos distintos: la práctica ML usa Spearman por era y predicciones "
        "entre 0 y 1; el torneo semanal diario usa retornos decimales entre -1 y 10, cuatro "
        "rondas y puntuación MAE frente a cero. Primero descubre torneos y descarga sus "
        "datasets; live no contiene respuestas. Nunca inventes scores ni resultados. "
        "Enviar predicciones o consultar envíos propios requiere QUANTBATTLE_TOKEN (clave qbt_)."
    ),
)


class QuantBattleError(RuntimeError):
    pass


def _request(method: str, path: str, *, auth: bool = False, **kwargs: Any) -> Any:
    headers = dict(kwargs.pop("headers", {}))
    if auth:
        if not TOKEN:
            raise QuantBattleError(
                "Falta QUANTBATTLE_TOKEN. Crea una clave API en QuantBattle, en /app/api-keys, "
                "y configúrala como variable de entorno del servidor MCP."
            )
        headers["Authorization"] = f"Bearer {TOKEN}"
    try:
        response = httpx.request(
            method, f"{WORKER}{path}", headers=headers, timeout=TIMEOUT, **kwargs
        )
    except httpx.HTTPError as exc:
        raise QuantBattleError(
            f"No se pudo conectar al worker de QuantBattle ({WORKER}): {exc}"
        ) from exc
    if response.is_error:
        try:
            body = response.json()
            detail = body.get("detail") or body.get("error") or body
        except ValueError:
            detail = response.text[:500]
        if response.status_code == 401:
            detail = "QUANTBATTLE_TOKEN inválido o revocado. Crea una clave nueva en /app/api-keys."
        raise QuantBattleError(f"QuantBattle respondió HTTP {response.status_code}: {detail}")
    if not response.content:
        return None
    return response.json()


def _text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def _experiment_header(experiment_json: str | None) -> str | None:
    if not experiment_json:
        return None
    try:
        value = json.loads(experiment_json)
    except json.JSONDecodeError as exc:
        raise QuantBattleError(f"experiment_json no es JSON válido: {exc}") from exc
    if not isinstance(value, dict):
        raise QuantBattleError("experiment_json debe ser un objeto JSON")
    encoded = base64.b64encode(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    if len(encoded) > 6000:
        raise QuantBattleError("La ficha experimental codificada supera el límite de 6000 caracteres")
    return encoded


def _read_csv(path: str) -> tuple[bytes, list[dict[str, str]]]:
    file_path = Path(path).expanduser()
    try:
        content = file_path.read_bytes()
    except OSError as exc:
        raise QuantBattleError(f"No se pudo leer el CSV {file_path}: {exc}") from exc
    if len(content) > MAX_CSV_BYTES:
        raise QuantBattleError("El CSV supera el límite de 10 MB de QuantBattle")
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        if reader.fieldnames != ["id", "prediction"]:
            raise QuantBattleError("La cabecera debe ser exactamente: id,prediction")
        rows = list(reader)
    except UnicodeDecodeError as exc:
        raise QuantBattleError("El CSV debe estar codificado en UTF-8") from exc
    if not rows:
        raise QuantBattleError("El CSV debe contener al menos una predicción")
    seen: set[str] = set()
    for number, row in enumerate(rows, start=2):
        identity = (row.get("id") or "").strip()
        raw = (row.get("prediction") or "").strip()
        if not identity:
            raise QuantBattleError(f"Fila {number}: id vacío")
        if identity in seen:
            raise QuantBattleError(f"Fila {number}: id duplicado ({identity})")
        seen.add(identity)
        try:
            number_value = float(raw)
        except ValueError as exc:
            raise QuantBattleError(f"Fila {number}: prediction no es numérico ({raw!r})") from exc
        if not math.isfinite(number_value):
            raise QuantBattleError(f"Fila {number}: prediction debe ser finito")
        row["id"] = identity
        row["prediction"] = raw
    return content, rows


@mcp.tool()
def quantbattle_status() -> str:
    """Comprueba la conexión con el worker configurado y describe los módulos ML."""
    try:
        health = _request("GET", "/health")
        weeks = _request("GET", "/ml/return-tournaments")
        datasets = _request("GET", "/ml/datasets")
        practice = _request("GET", "/tournament/ml")
        return _text({
            "connected": True,
            "worker": WORKER,
            "health": health,
            "weekly_return_tournaments": len(weeks.get("tournaments", [])),
            "published_practice_ml_datasets": len(datasets.get("datasets", [])),
            "practice_ml_tournaments": len(practice),
            "authentication_configured": bool(TOKEN),
        })
    except QuantBattleError as exc:
        return _text({"connected": False, "worker": WORKER, "error": str(exc)})


@mcp.tool()
def list_ml_tournaments(include_closed: bool = False) -> str:
    """Lista las semanas del torneo ML de retornos y las rondas ML de práctica publicadas, con estado y plazos."""
    try:
        weeks_data = _request("GET", "/ml/return-tournaments")
        practice = _request("GET", "/tournament/ml")
        datasets = _request("GET", "/ml/datasets")
        live_by_round: dict[tuple[str, int], dict] = {}
        for dataset in datasets.get("datasets", []):
            if dataset.get("kind") == "live":
                live_by_round[(dataset.get("tournament_id"), dataset.get("round_number"))] = dataset

        weekly = []
        for week in weeks_data.get("tournaments", []):
            rounds = []
            for round_info in week.get("rounds", []):
                dataset = round_info.get("dataset") or {}
                rounds.append({
                    "ordinal": round_info.get("ordinal"),
                    "round_id": round_info.get("id"),
                    "status": round_info.get("status"),
                    "submission_day": round_info.get("submission_day"),
                    "target_day": round_info.get("target_day"),
                    "opens_at": round_info.get("opens_at"),
                    "closes_at": round_info.get("closes_at"),
                    "version": round_info.get("version"),
                    "files": dataset.get("files"),
                })
            item = {k: week.get(k) for k in (
                "id", "name", "protocol", "week_start", "timezone", "asset_count",
                "status", "release_at", "results_released", "rules",
            )}
            item["rounds"] = rounds
            weekly.append(item)

        practice_items = []
        for tournament in practice:
            rounds = []
            for (tournament_id, round_number), dataset in live_by_round.items():
                if tournament_id == tournament.get("id"):
                    rounds.append({
                        "round_number": round_number,
                        "live_dataset_id": dataset.get("id"),
                        "status": dataset.get("status"),
                        "round_type": dataset.get("round_type"),
                        "closes_at": dataset.get("closes_at"),
                        "version": dataset.get("version"),
                        "rows": dataset.get("row_count"),
                        "features": dataset.get("feature_cols"),
                    })
            if rounds or include_closed:
                # Do not label stale tournament rows as currently open just because
                # their historic database status still says "open".
                active_rounds = [r for r in rounds if r.get("status") == "ready"]
                practice_items.append({
                    "id": tournament.get("id"), "name": tournament.get("name"),
                    "status": "open" if active_rounds else "closed",
                    "active_rounds": active_rounds,
                    "database_status": tournament.get("status"),
                    "round_type": tournament.get("round_type"),
                    "submission_deadline": tournament.get("submission_deadline"),
                    "primary_metric": tournament.get("primary_metric"),
                    "rules_text": tournament.get("rules_text"), "rounds": rounds,
                })
        return _text({"weekly_return_tournaments": weekly, "practice_ml_tournaments": practice_items})
    except QuantBattleError as exc:
        return f"Error al listar torneos ML: {exc}"


@mcp.tool()
def get_weekly_tournament(week_id: str) -> str:
    """Obtiene reglas, calendario, datasets publicados y estado de resultados de una semana de retornos."""
    try:
        return _text(_request("GET", f"/ml/return-tournaments/{week_id}"))
    except QuantBattleError as exc:
        return f"Error al consultar la semana: {exc}"


@mcp.tool()
def list_practice_datasets(tournament_id: str = "", round_number: int = 0) -> str:
    """Lista datasets del torneo ML de práctica; devuelve IDs, protocolo, filas y enlaces de descarga."""
    params: dict[str, Any] = {}
    if tournament_id:
        params["tournament_id"] = tournament_id
    if round_number > 0:
        params["round_number"] = round_number
    try:
        return _text(_request("GET", "/ml/datasets", params=params))
    except QuantBattleError as exc:
        return f"Error al consultar datasets: {exc}"


@mcp.tool()
def get_practice_dataset_download(dataset_id: str, kind: str) -> str:
    """Obtiene el enlace público de train, validation o live de una ronda de práctica ML."""
    if kind not in ("train", "validation", "live"):
        return "kind debe ser train, validation o live"
    try:
        return _text(_request("GET", f"/ml/datasets/{dataset_id}/download", params={"kind": kind}))
    except QuantBattleError as exc:
        return f"Error al obtener el enlace: {exc}"


@mcp.tool()
def get_weekly_dataset_download(round_id: str, kind: str) -> str:
    """Obtiene el enlace público de train, validation o live de una ronda semanal de retornos."""
    if kind not in ("train", "validation", "live"):
        return "kind debe ser train, validation o live"
    try:
        return _text(_request("GET", f"/ml/return-rounds/{round_id}/download/{kind}"))
    except QuantBattleError as exc:
        return f"Error al obtener el enlace: {exc}"


@mcp.tool()
def get_weekly_live_ids(round_id: str) -> str:
    """Devuelve IDs públicos del live para crear un CSV completo; el live no contiene retornos objetivo."""
    try:
        result = _request("GET", f"/ml/return-rounds/{round_id}/rows")
        return _text({"round_id": result.get("round_id"), "version": result.get("version"), "ids": result.get("ids")})
    except QuantBattleError as exc:
        return f"Error al obtener IDs live: {exc}"


@mcp.tool()
def validate_prediction_csv(csv_path: str, protocol: str, dataset_id: str = "", round_id: str = "") -> str:
    """Valida localmente un CSV antes del envío. protocol: practice_spearman o daily_return_mae. daily_return_mae requiere round_id y comprueba el conjunto exacto de IDs."""
    if protocol not in ("practice_spearman", "daily_return_mae"):
        return "protocol debe ser practice_spearman o daily_return_mae"
    try:
        _, rows = _read_csv(csv_path)
        values = [float(row["prediction"]) for row in rows]
        minimum, maximum = (0.0, 1.0) if protocol == "practice_spearman" else (-1.0, 10.0)
        outside = [value for value in values if not minimum <= value <= maximum]
        if outside:
            return f"CSV inválido: prediction debe estar entre {minimum} y {maximum}; {len(outside)} valor(es) fuera del rango."
        if protocol == "practice_spearman" and not dataset_id:
            return "Falta dataset_id para validar que están todos los IDs de live."
        expected_ids: set[str] | None = None
        version = None
        if protocol == "practice_spearman":
            index = _request("GET", f"/ml/datasets/{dataset_id}/rows")
            expected_ids = {str(row[0]) for row in index.get("rows", [])}
            version = index.get("version")
        else:
            if not round_id:
                return "Falta round_id para validar que están todos los IDs live."
            index = _request("GET", f"/ml/return-rounds/{round_id}/rows")
            expected_ids = {str(identity) for identity in index.get("ids", [])}
            version = index.get("version")
        actual_ids = {row["id"] for row in rows}
        missing = expected_ids - actual_ids
        extra = actual_ids - expected_ids
        if missing or extra or len(rows) != len(expected_ids):
            return _text({"valid": False, "rows": len(rows), "expected_rows": len(expected_ids),
                          "missing_ids": list(sorted(missing))[:20], "extra_ids": list(sorted(extra))[:20],
                          "missing_count": len(missing), "extra_count": len(extra), "reason": "El CSV debe tener todos los IDs live exactamente una vez."})
        era_variation: dict[str, set[float]] = {}
        if protocol == "practice_spearman":
            for identity, era in index.get("rows", []):
                era_variation.setdefault(str(era), set())
            by_id = {row["id"]: float(row["prediction"]) for row in rows}
            for identity, era in index.get("rows", []):
                era_variation[str(era)].add(by_id[str(identity)])
            flat_eras = [era for era, values in era_variation.items() if len(values) < 2]
            if flat_eras:
                return _text({"valid": False, "reason": "Cada era necesita predicciones con valores distintos.",
                              "flat_era_count": len(flat_eras), "sample_eras": flat_eras[:10]})
        return _text({"valid": True, "protocol": protocol, "rows": len(rows), "version": version,
                      "prediction_min": min(values), "prediction_max": max(values),
                      "sha256": hashlib.sha256(Path(csv_path).expanduser().read_bytes()).hexdigest()})
    except (QuantBattleError, OSError) as exc:
        return f"No se pudo validar el CSV: {exc}"


@mcp.tool()
def submit_practice_predictions(dataset_id: str, csv_path: str, experiment_json: str) -> str:
    """Envía CSV id,prediction a una ronda de práctica ML. Requiere QUANTBATTLE_TOKEN y ficha JSON con model_name, parameters opcional, seed opcional y note opcional."""
    try:
        content, _ = _read_csv(csv_path)
        encoded = _experiment_header(experiment_json)
        validation = validate_prediction_csv(csv_path, "practice_spearman", dataset_id=dataset_id)
        if json.loads(validation).get("valid") is not True:
            return f"CSV no enviado porque no pasó la validación local: {validation}"
        response = _request("POST", f"/ml/datasets/{dataset_id}/predictions", auth=True,
                            content=content, headers={"Content-Type": "text/csv", "X-QuantBattle-Experiment": encoded or ""})
        return _text(response)
    except QuantBattleError as exc:
        return f"No se confirmó el envío de práctica: {exc}"


@mcp.tool()
def submit_weekly_predictions(round_id: str, csv_path: str, experiment_json: str) -> str:
    """Envía CSV id,prediction a una ronda semanal abierta. Requiere QUANTBATTLE_TOKEN y ficha JSON con model_name, parameters opcional, seed opcional y note opcional."""
    try:
        content, _ = _read_csv(csv_path)
        encoded = _experiment_header(experiment_json)
        validation = validate_prediction_csv(csv_path, "daily_return_mae", round_id=round_id)
        if json.loads(validation).get("valid") is not True:
            return f"CSV no enviado porque no pasó la validación local: {validation}"
        response = _request("POST", f"/ml/return-rounds/{round_id}/predictions", auth=True,
                            content=content, headers={"Content-Type": "text/csv", "X-QuantBattle-Experiment": encoded or ""})
        return _text(response)
    except QuantBattleError as exc:
        return f"No se confirmó el envío semanal: {exc}"


@mcp.tool()
def get_my_practice_submission(dataset_id: str) -> str:
    """Consulta el comprobante seleccionado del usuario para un dataset de práctica ML. Requiere QUANTBATTLE_TOKEN."""
    try:
        return _text(_request("GET", "/ml/predictions/mine", auth=True, params={"dataset_id": dataset_id}))
    except QuantBattleError as exc:
        return f"Error al consultar el envío: {exc}"


@mcp.tool()
def get_my_weekly_submissions(round_id: str) -> str:
    """Consulta intentos y comprobantes propios de una ronda semanal. Requiere QUANTBATTLE_TOKEN."""
    try:
        return _text(_request("GET", f"/ml/return-rounds/{round_id}/mine", auth=True))
    except QuantBattleError as exc:
        return f"Error al consultar comprobantes: {exc}"


@mcp.tool()
def get_ml_leaderboard(dataset_id: str) -> str:
    """Consulta el leaderboard público de práctica cuando la ronda ya esté puntuada."""
    try:
        return _text(_request("GET", "/ml/leaderboard", params={"dataset_id": dataset_id}))
    except QuantBattleError as exc:
        return f"Error al consultar leaderboard: {exc}"


@mcp.tool()
def get_weekly_results(week_id: str) -> str:
    """Consulta ranking y evidencia del torneo semanal; QuantBattle mantiene los resultados ocultos hasta el cierre de las cuatro rondas."""
    try:
        return _text(_request("GET", f"/ml/return-tournaments/{week_id}/results"))
    except QuantBattleError as exc:
        return f"Resultados no disponibles: {exc}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
