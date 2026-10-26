"""API HTTP del worker de QuantLab.

Expone el motor de backtest ya validado (engine.run_backtest) vía FastAPI.

Endpoints:
  GET  /health              -> {"status": "ok"}  (sin red, para healthcheck de deploy)
  POST /backtest            -> body = StrategyConfig; devuelve el dict del motor.
  POST /backtest/validate   -> validación ligera de coherencia y seguridad del código.

CORS habilitado para que el frontend Next.js (web/) pueda invocarlo.
"""
from __future__ import annotations

import hmac
import logging
import os
import re
import uuid

from fastapi import FastAPI, Header, Query, Request
from fastapi.responses import JSONResponse

from auth import require_user

import engine
from schemas import StrategyConfig
from tournaments import router as tournaments_router
from comments import router as comments_router
from social import router as social_router
from moderation import router as moderation_router
from ml_endpoints import router as ml_router
from notifications import router as notifications_router
from referrals import router as referrals_router
from badges import router as badges_router
from admin import router as admin_router
import ml_persist
import scheduler as _scheduler  # torneos de codigo (create/evaluate/signals)
import ml_scheduler  # scoring ML y consensus_signals

app = FastAPI(
    title="QuantLab Worker API",
    description="Backtesting OOS con datos reales (Binance / yfinance) vía engine.run_backtest.",
    version="1.0.0",
)

logger = logging.getLogger("quantlab.worker")

# ---------------------------------------------------------------------------
# CORS: por defecto CERRADO. Solo se emite Access-Control-Allow-Origin cuando
# CORS_ORIGINS esta configurado (lista blanca) y el Origin del request esta
# en ella. Si CORS_ORIGINS esta vacio, NO se refleja ningun Origin: el
# navegador bloquea las lecturas cross-origin (fail-closed).
#
# Formato de CORS_ORIGINS: lista separada por comas, p.ej.
#   "http://localhost:3000,https://app.quantlab.io"
#
# Nota importante: el frontend envía `Authorization: Bearer <jwt>` en requests
# autenticados. Cuando una request lleva credenciales, el navegador RECHAZA la
# respuesta si Access-Control-Allow-Origin es "*" genérico o si falta
# Access-Control-Allow-Credentials: true. Por eso:
#   - Origin en la lista blanca → se refleja + credentials=true.
#   - Origin fuera de la lista (o sin lista) → sin headers CORS (cerrado).
# ---------------------------------------------------------------------------
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_env:
    _cors_allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _cors_allow_origins = []  # sin lista blanca: CORS cerrado (no se refleja Origin)


def _is_origin_allowed(origin: str | None) -> bool:
    """True si el Origin está permitido: lista exacta o preview de Vercel.

    Además de la lista blanca exacta de CORS_ORIGINS, acepta cualquier
    origen https://*.vercel.app (sufijo, solo https) para que los preview
    deployments de Vercel no se bloqueen. Nunca refleja "null" ni orígenes
    vacíos; el resto queda cerrado (fail-closed).
    """
    if not origin or origin == "null":
        return False
    if origin in _cors_allow_origins:
        return True
    if origin.startswith("https://"):
        host = origin[len("https://"):]
        if (
            host.endswith(".vercel.app")
            and len(host) > len(".vercel.app")
            and "/" not in host
            and "?" not in host
            and "#" not in host
            and "@" not in host
            and ":" not in host
        ):
            return True
    return False

# Middleware CORS personalizado (fail-closed): sin lista blanca no se emite
# ningun Access-Control-Allow-Origin; el navegador bloquea las lecturas
# cross-origin.
from starlette.middleware.base import BaseHTTPMiddleware

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin")

        # Preflight OPTIONS: responder directamente con los headers correctos.
        if request.method == "OPTIONS":
            from starlette.responses import Response
            resp = Response(status_code=200)
            if _cors_env:
                if _is_origin_allowed(origin):
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Access-Control-Allow-Credentials"] = "true"
            # Sin lista blanca: sin Allow-Origin (CORS cerrado por defecto).
            resp.headers["Access-Control-Allow-Methods"] = "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT"
            resp.headers["Access-Control-Allow-Headers"] = "*"
            resp.headers["Access-Control-Max-Age"] = "600"
            return resp

        response = await call_next(request)

        if _cors_env:
            # Lista blanca o preview https://*.vercel.app: reflejar + credentials.
            if _is_origin_allowed(origin):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
        # Sin lista blanca: no se emite Allow-Origin (CORS cerrado por defecto).

        response.headers.setdefault("Access-Control-Allow-Methods", "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT")
        response.headers.setdefault("Access-Control-Allow-Headers", "*")
        response.headers.setdefault("Access-Control-Max-Age", "600")
        return response

app.add_middleware(DynamicCORSMiddleware)


# ---------------------------------------------------------------------------
# CORS en excepciones NO manejadas: los 500 generados por Starlette saltan el
# middleware y salen SIN headers CORS → el navegador los muestra como
# "Failed to fetch" opaco. Este handler añade los headers a esas respuestas.
# ---------------------------------------------------------------------------
from starlette.exceptions import HTTPException as StarletteHTTPException


def _cors_headers_for(request: Request) -> dict:
    origin = request.headers.get("origin")
    h = {
        "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "600",
    }
    if _cors_env:
        if _is_origin_allowed(origin):
            h["Access-Control-Allow-Origin"] = origin
            h["Access-Control-Allow-Credentials"] = "true"
    # Sin lista blanca: sin Allow-Origin (CORS cerrado por defecto).
    return h


@app.exception_handler(StarletteHTTPException)
async def http_exception_with_cors(request: Request, exc: StarletteHTTPException):
    from starlette.responses import JSONResponse

    return JSONResponse(
        {"detail": exc.detail},
        status_code=exc.status_code,
        headers=_cors_headers_for(request),
    )


@app.exception_handler(Exception)
async def unhandled_exception_with_cors(request: Request, exc: Exception):
    # 500 opaco: el detalle real solo queda en el log, correlacionado por
    # error_id. Nunca se expone el mensaje interno al cliente.
    error_id = uuid.uuid4().hex[:12]
    logger.exception(
        "Unhandled error en %s %s (error_id=%s)",
        request.method,
        request.url.path,
        error_id,
    )

    from starlette.responses import JSONResponse

    return JSONResponse(
        {"error": "Error interno del servidor", "error_id": error_id},
        status_code=500,
        headers=_cors_headers_for(request),
    )

# Router de torneos + marketplace + QP + social (follows / actividad)
app.include_router(tournaments_router)
app.include_router(comments_router)
app.include_router(social_router)
app.include_router(moderation_router)
app.include_router(ml_router)
from weekly_api import router as weekly_router
app.include_router(weekly_router)
from ml_workspace import router as ml_workspace_router
app.include_router(ml_workspace_router)
app.include_router(notifications_router)
app.include_router(referrals_router)
app.include_router(badges_router)
app.include_router(admin_router)

# Timeframes soportados por la fuente de datos (Binance / yfinance).
_ALLOWED_TIMEFRAMES = {
    "1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1M", "1wk", "1mo",
}

# Patrones de código peligrosos que no permitimos en una StrategyConfig.
_DANGEROUS_PATTERNS = [
    "import os",
    "import sys",
    "import subprocess",
    "import pickle",
    "import marshal",
    "import socket",
    "from os",
    "from sys",
    "from subprocess",
    "subprocess",
    "__import__",
    "__class__",
    "__dict__",
    "__bases__",
    "__subclasses__",
    "getattr(",
    "getattr (",
    "eval(",
    "exec(",
    "compile(",
    "os.system",
    "os.",
    "sys.",
    "subprocess.",
    "open(",
    "input(",
]


def validate_strategy(config: StrategyConfig) -> dict:
    """Valida coherencia símbolo/activo y ausencia de código peligroso.

    Devuelve {"valid": bool, "warnings": [...]}.
    'valid' es False solo si hay algo bloqueante (código peligroso o
    asset_type inválido). Las incoherencias de símbolo/timeframe se reportan
    como 'warnings' pero no invalidan la configuración (el motor las tolera).
    """
    warnings: list[str] = []
    valid = True

    # Normalizar espacios (colapsar tabs/saltos/espacios multiples) para que
    # variantes como "from   os   import ..." o "import  os" tambien casen.
    code_lower = (config.code or "").lower()
    code_norm = re.sub(r"\s+", " ", code_lower).strip()
    for pat in _DANGEROUS_PATTERNS:
        if pat in code_norm:
            valid = False
            warnings.append(f"Código peligroso detectado: '{pat}' no está permitido.")

    asset = (config.asset_type or "").lower()
    if asset not in ("crypto", "stock", "etf"):
        valid = False
        warnings.append(
            f"asset_type inválido: '{config.asset_type}'. Usa 'crypto', 'stock' o 'etf'."
        )
    else:
        symbol = (config.symbol or "").strip().upper()
        if asset == "crypto":
            # Se tolera sin 'USDT' porque el motor lo normaliza, pero advertimos.
            if not re.fullmatch(r"[A-Z0-9]+USDT", symbol):
                warnings.append(
                    f"Símbolo crypto '{config.symbol}' no termina en USDT; "
                    "el motor lo normalizará (p.ej. BTC -> BTCUSDT)."
                )
        elif asset in ("stock", "etf"):
            if symbol.endswith("USDT"):
                warnings.append(
                    f"Símbolo de stock '{config.symbol}' termina en USDT; "
                    "probablemente es un par crypto, no una acción."
                )
            if not re.fullmatch(r"[A-Z][A-Z0-9.\-]*", symbol):
                warnings.append(
                    f"Símbolo de stock '{config.symbol}' tiene formato inusual."
                )

    tf = (config.timeframe or "").strip()
    if tf not in _ALLOWED_TIMEFRAMES:
        warnings.append(
            f"timeframe '{config.timeframe}' no está en la lista estándar; "
            "la fuente de datos podría no soportarlo."
        )

    if not (config.start and config.end):
        warnings.append("Faltan las fechas start/end del rango de datos.")

    return {"valid": valid, "warnings": warnings}


def _validate_config(config: StrategyConfig) -> None:
    """Valida la entrada del usuario ANTES de descargar datos.

    Delega en engine._validate_config (única fuente de verdad).
    """
    engine._validate_config(config)


@app.get("/health")
def health() -> dict:
    """Healthcheck sin red, para el deploy."""
    return {"status": "ok"}


def _check_scheduler_key(provided: str | None) -> bool:
    """Verifica X-Scheduler-Key contra SCHEDULER_KEY en tiempo constante."""
    expected = os.environ.get("SCHEDULER_KEY", "")
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


@app.get("/debug/env")
def debug_env(x_scheduler_key: str | None = Header(None)) -> dict:
    """Diagnóstico: verifica que las variables de entorno críticas estén configuradas.
    NO expone secretos: solo confirma presencia y longitud.
    Protegido por X-Scheduler-Key."""
    if not _check_scheduler_key(x_scheduler_key):
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized. Header X-Scheduler-Key inválido o ausente."},
        )
    import os
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    jwks = os.environ.get("SUPABASE_JWKS_URL", "")
    return {
        "SUPABASE_URL_set": bool(url),
        "SUPABASE_URL_prefix": url[:8] if url else "",
        "SUPABASE_SERVICE_ROLE_KEY_set": bool(key),
        "SUPABASE_SERVICE_ROLE_KEY_len": len(key),
        "SUPABASE_JWKS_URL_set": bool(jwks),
        "JWKS_url": _get_jwks_url_safe(),
    }


def _get_jwks_url_safe() -> str:
    """Obtiene la URL del JWKS sin lanzar, para diagnóstico."""
    import os
    jwks = os.environ.get("SUPABASE_JWKS_URL")
    if jwks:
        return jwks
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if url:
        return f"{url}/auth/v1/.well-known/jwks.json"
    return "(no configurada)"


@app.get("/debug/jwks")
def debug_jwks(x_scheduler_key: str | None = Header(None)) -> dict:
    """Diagnóstico: verifica conectividad con el JWKS de Supabase.
    Protegido por X-Scheduler-Key."""
    if not _check_scheduler_key(x_scheduler_key):
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized. Header X-Scheduler-Key inválido o ausente."},
        )
    import os
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    jwks_url = os.environ.get("SUPABASE_JWKS_URL", "") or (f"{url}/auth/v1/.well-known/jwks.json" if url else "")
    
    if not jwks_url:
        return {"ok": False, "error": "SUPABASE_URL no configurada"}
    
    try:
        from auth import _get_jwks_url, _fetch_jwks
        jwks_fetched = _fetch_jwks()
        keys = jwks_fetched.get("keys", [])
        return {
            "ok": True,
            "url": jwks_url,
            "keys_count": len(keys),
            "kids": [k.get("kid") for k in keys[:5]],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}



@app.post("/backtest")
def backtest(config: StrategyConfig, request: Request) -> dict:
    """Ejecuta un backtest OOS real y devuelve el dict del motor.

    Requiere autenticación (JWT Supabase). En caso de error de
    validación/descarga/datos (ValueError) devuelve 400 con {"error": ...}.
    """
    require_user(request)
    try:
        _validate_config(config)
        result = engine.run_backtest(config)
        return result
    except ValueError as exc:
        # Errores de validación, red o datos (Binance, yfinance, símbolo...).
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception:  # noqa: BLE001 - 500 opaco, detalle solo en el log
        error_id = uuid.uuid4().hex[:12]
        logger.exception("Error interno en /backtest (error_id=%s)", error_id)
        return JSONResponse(
            status_code=500,
            content={"error": "Error interno del servidor", "error_id": error_id},
        )


@app.post("/backtest/validate")
def validate(config: StrategyConfig, request: Request) -> dict:
    """Validación ligera de coherencia y seguridad de una StrategyConfig.
    Requiere autenticación (JWT Supabase)."""
    require_user(request)
    return validate_strategy(config)


# ---------------------------------------------------------------------------
# Scheduler endpoint: crea torneo semanal + evalúa cerrados.
# Protegido por X-Scheduler-Key.
# ---------------------------------------------------------------------------
@app.post("/scheduler/run")
async def scheduler_run(
    x_scheduler_key: str | None = Header(None),
    sync: bool = Query(False, description="Si true, ejecuta el trabajo SINCRONO dentro del request (no background). Necesario en Render plan free donde los background tasks no persisten."),
) -> dict:
    """Ejecuta el scheduler de torneos: create + evaluate.

    Header requerido: X-Scheduler-Key
    Variable de entorno: SCHEDULER_KEY
    """
    expected = os.environ.get("SCHEDULER_KEY")
    if not expected:
        return JSONResponse(
            status_code=503,
            content={"error": "Scheduler no configurado (falta SCHEDULER_KEY)."},
        )
    if not _check_scheduler_key(x_scheduler_key):
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized. Header X-Scheduler-Key inválido o ausente."},
        )

    import asyncio
    from datetime import datetime, timezone

    import engine

    # Crear cliente supabase
    import os as _os
    from supabase import create_client

    url = _os.environ.get("SUPABASE_URL")
    key = _os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return JSONResponse(
            status_code=503,
            content={"error": "Supabase no configurado."},
        )
    sb = create_client(url, key)

    now = datetime.now(timezone.utc)

    # Trabajo pesado (generar dataset sintético puede tardar minutos) se ejecuta
    # en un background task para no superar el timeout de gunicorn (120s) y evitar
    # el 502. El endpoint devuelve 200 inmediato. Con ?sync=true se ejecuta
    # dentro del request (plan free de Render, donde los background tasks se
    # pierden al terminar el request).
    async def _do_scheduler_work():
        """Ejecuta create + evaluate + signals + scoring ML. Devuelve resumen."""
        loop = asyncio.get_event_loop()
        # Torneos de código
        tournament = await loop.run_in_executor(
            None, lambda: _scheduler.create_weekly_tournament(sb, now)
        )
        created_id = tournament.get("id") if tournament else None
        evaluated = await loop.run_in_executor(
            None, lambda: _scheduler.evaluate_tournaments(sb, engine, now)
        )
        signals_generated = 0
        try:
            signals_generated = await loop.run_in_executor(
                None, lambda: _scheduler.generate_weekly_signals(sb, now)
            )
        except Exception:  # noqa: BLE001
            logger.exception("generate_weekly_signals falló")

        # Rondas ML: cerrar y puntuar únicamente después del plazo.
        # (la GENERACIÓN de datasets la hace GitHub Actions en ubuntu-latest,
        #  con 7GB de RAM; aquí solo servimos + puntuamos. create_ml_round no
        #  existe en este worker, por lo que no se crea nada aquí.)
        ml_evaluated = 0
        try:
            ml_evaluated = await loop.run_in_executor(
                None, lambda: ml_scheduler.evaluate_ml_rounds(sb, now)
            )
        except Exception:  # noqa: BLE001
            logger.exception("Scheduler ML falló (evaluate)")
        return {
            "created_id": created_id,
            "evaluated": evaluated,
            "signals_generated": signals_generated,
            "ml_evaluated": ml_evaluated,
        }

    async def _run_scheduler():
        try:
            summary = await _do_scheduler_work()
            logger.info(
                f"Scheduler completado: created={summary['created_id']}, "
                f"evaluated={summary['evaluated']}, "
                f"signals={summary['signals_generated']}, "
                f"ml_evaluated={summary['ml_evaluated']}"
            )
        except Exception:
            logger.exception("Error en el scheduler (background)")

    if sync:
        try:
            summary = await _do_scheduler_work()
            return {"status": "ok", "mode": "sync", **summary}
        except Exception:
            error_id = uuid.uuid4().hex[:12]
            logger.exception("Error en el scheduler (sync) (error_id=%s)", error_id)
            return JSONResponse(
                status_code=500,
                content={"error": "Error interno del servidor", "error_id": error_id},
            )

    asyncio.create_task(_run_scheduler())

    return {
        "status": "ok",
        "mode": "background",
        "message": "Scheduler encolado en background. Revisa los logs del worker para el resultado. Usa ?sync=true en plan free de Render.",
    }


@app.post("/scheduler/evaluate")
async def scheduler_evaluate(
    x_scheduler_key: str | None = Header(None),
    sync: bool = Query(False, description="Si true, ejecuta el scoring SINCRONO dentro del request (no background). Necesario en Render plan free donde los background tasks no persisten."), ) -> dict:
    """Finaliza rondas ML cuyo plazo y disponibilidad de targets se cumplieron.

    La generacion de datasets se hace en GitHub Actions (mayor RAM, no se duerme)
    y se sube a Supabase Storage. Este endpoint solo puntua submissions pendientes.

    En Render plan FREE los background tasks (asyncio.create_task) se pierden al
    terminar el request. Usa ?sync=true para forzar ejecucion sincrona: el request
    dura el scoring (max ~120s timeout) y garantiza que se ejecute.
    """
    expected = os.environ.get("SCHEDULER_KEY")
    if not expected:
        return JSONResponse(
            status_code=503,
            content={"error": "Scheduler no configurado (falta SCHEDULER_KEY)."},
        )
    if not _check_scheduler_key(x_scheduler_key):
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized. Header X-Scheduler-Key inválido o ausente."},
        )

    import asyncio
    from datetime import datetime, timezone

    import engine

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return JSONResponse(
            status_code=503,
            content={"error": "Supabase no configurado."},
        )
    from supabase import create_client

    sb = create_client(url, key)
    now = datetime.now(timezone.utc)

    async def _score_and_distribute():
        """Scoring y premios idempotentes de rondas cerradas."""
        loop = asyncio.get_event_loop()
        ml_rounds = await loop.run_in_executor(
            None, lambda: ml_scheduler.evaluate_ml_rounds(sb, now)
        )
        return ml_rounds

    async def _run_eval():
        try:
            ml_rounds = await _score_and_distribute()
            logger.info("Evaluacion ML completada: %s rondas finalizadas", ml_rounds)
        except Exception:  # noqa: BLE001
            logger.exception("Error en la evaluacion ML (background)")

    if sync:
        try:
            ml_rounds = await _score_and_distribute()
            return {
                "status": "ok",
                "mode": "sync",
                "evaluated": ml_rounds,
                "ml_rounds": ml_rounds,
                "message": "Scoring ML ejecutado sincronamente.",
            }
        except Exception:  # noqa: BLE001
            error_id = uuid.uuid4().hex[:12]
            logger.exception("Error en evaluacion ML (sync) (error_id=%s)", error_id)
            return JSONResponse(
                status_code=500,
                content={"error": "Error interno del servidor", "error_id": error_id},
            )

    asyncio.create_task(_run_eval())
    return {
        "status": "ok",
        "mode": "background",
        "message": "Evaluacion encolada en background. Usa ?sync=true en plan free de Render.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
