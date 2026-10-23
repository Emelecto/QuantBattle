# Motor de torneos + tokens + marketplace para QuantLab.
# Endpoints FastAPI que el frontend invoca vía NEXT_PUBLIC_WORKER_URL.

from __future__ import annotations

import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request
from auth import require_user, get_optional_user
from pydantic import BaseModel, Field

# Motor de backtest (datos reales, walk-forward) + esquema de config.
# Import diferido a nivel de módulo: engine solo trae pandas (dependencia central),
# no acopla a red en los tests unitarios. Permite monkear tournaments.run_backtest.
from engine import run_backtest  # noqa: E402
from schemas import StrategyConfig  # noqa: E402
from marketplace_quality import review_reasons

logger = logging.getLogger(__name__)

# Rate-limit en memoria (best-effort) para el endpoint /replicate:
# no re-correr el backtest más de 1 vez por minuto por (estrategia, usuario).
# Clave del dict: f"{strategy_id}:{user_id}".
_replicate_last_run: dict[str, float] = {}

# Umbral de tolerancia del Sello de Replicabilidad (Δ sharpe OOS).
REPLICATE_SHARPE_TOLERANCE = 0.3
_REPLICATE_COOLDOWN_S = 60

router = APIRouter(prefix="", tags=["tournaments"])

# ---------------------------------------------------------------------------
# Cliente Supabase (service_role, server-side)
# ---------------------------------------------------------------------------
_supabase = None


def get_supabase():
    global _supabase
    if _supabase is None:
        import os
        from db_client import create_worker_client
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas")
        _supabase = create_worker_client(url, key)
    return _supabase


# ---------------------------------------------------------------------------
# TORNEOS
# ---------------------------------------------------------------------------

@router.get("/tournament/list")
def tournament_list(type: str | None = None, status: str | None = None):
    sb = get_supabase()
    q = sb.table("tournaments").select("*")
    if type:
        q = q.eq("type", type)
    if status:
        q = q.eq("status", status)
    q = q.order("created_at", desc=True)
    res = q.execute()
    return res.data or []


# NOTA: este /tournament/ml debe ir ANTES de /tournament/{id} (si no, "ml"
# cae como id y Postgres recibe "ml" como UUID -> 500). No duplicar.
@router.get("/tournament/ml")
def tournament_list_ml(status: str | None = None):
    sb = get_supabase()
    q = sb.table("tournaments").select("*").eq("type", "ml")
    if status:
        q = q.eq("status", status)
    q = q.order("created_at", desc=True)
    res = q.execute()
    return res.data or []


@router.get("/tournament/{tournament_id}")
def tournament_detail(tournament_id: str):
    sb = get_supabase()
    res = sb.table("tournaments").select("*").eq("id", tournament_id).execute()
    if not res.data:
        raise HTTPException(404, "Torneo no encontrado")
    return res.data[0]


class SubmitBody(BaseModel):
    tournament_id: str
    code: str
    config: dict
    qp_stake: int = Field(default=0, ge=0)
    replace: bool = False


@router.post("/tournament/submit")
def tournament_submit(body: SubmitBody, request: Request):
    sb = get_supabase()
    uid = require_user(request)

    # 1. Validar torneo existe y está abierto
    t = sb.table("tournaments").select("*").eq("id", body.tournament_id).execute()
    if not t.data:
        raise HTTPException(404, "Torneo no encontrado")
    if t.data[0]["status"] != "open":
        raise HTTPException(400, "El torneo no está abierto a submissions")

    # 2. Submission previa: la tabla tiene UNIQUE(tournament_id, user_id).
    #    Sin `replace` el usuario quedaba bloqueado para siempre en ese torneo.
    existing = (
        sb.table("submissions")
        .select("id,qp_staked")
        .eq("tournament_id", body.tournament_id)
        .eq("user_id", uid)
        .execute()
    )
    if existing.data and not body.replace:
        raise HTTPException(
            400,
            "Ya enviaste una estrategia a este torneo. Puedes reemplazarla por esta nueva.",
        )

    # 3. Validar QP si hay stake
    if body.qp_stake > 0:
        bal = sb.table("tokens").select("balance").eq("user_id", uid).execute()
        balance = bal.data[0]["balance"] if bal.data else 0
        if balance < body.qp_stake:
            raise HTTPException(402, "QP insuficientes para el stake")

    row = {
        "tournament_id": body.tournament_id,
        "user_id": uid,
        "code": body.code,
        "config": body.config,
        "qp_staked": body.qp_stake,
        "status": "pending",
    }

    # 4. Crear o reemplazar la submission
    try:
        if existing.data:
            prev = existing.data[0]
            # Devolver el stake anterior antes de sobrescribirlo.
            prev_stake = int(prev.get("qp_staked") or 0)
            if prev_stake > 0:
                sb.table("token_ledger").insert({
                    "user_id": uid, "amount": prev_stake,
                    "type": "tournament_refund", "ref_id": prev["id"],
                    "memo": f"Devolución de stake al reemplazar submission {prev['id']}",
                }).execute()
                _update_balance(uid, prev_stake)
            sub = (
                sb.table("submissions")
                .update({**row, "metrics": None, "primary_score": None, "rank": None})
                .eq("id", prev["id"])
                .execute()
            )
        else:
            sub = sb.table("submissions").insert(row).execute()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("Error al guardar submission de torneo")
        raise HTTPException(500, f"Error al guardar la submission: {e}")

    if not sub.data:
        raise HTTPException(500, "La submission no se guardó (respuesta vacía).")

    sid = sub.data[0]["id"]

    # 4. Descontar QP del stake
    if body.qp_stake > 0:
        sb.table("token_ledger").insert({
            "user_id": uid, "amount": -body.qp_stake,
            "type": "tournament_entry", "ref_id": sid,
            "memo": f"Stake torneo {body.tournament_id}",
        }).execute()
        _update_balance(uid, -body.qp_stake)

    # 5. Actividad: inscripción al torneo (best-effort, jamás rompe el flujo).
    try:
        from social import log_activity

        log_activity(
            uid,
            "tournament_submission",
            target_type="tournament",
            target_id=body.tournament_id,
        )
    except Exception:  # noqa: BLE001
        pass

    # Verificar badge de primera submission
    _check_first_submission_badge(uid)

    return {"id": sid, "status": "pending"}


def _check_first_submission_badge(user_id: str) -> None:
    """Verifica y otorga el badge de primera submission."""
    try:
        from badges import award_badge
        award_badge(user_id, "first_submission")
    except Exception:
        pass


def _check_referral_badges(user_id: str) -> None:
    """Verifica y otorga badges por cantidad de referidos."""
    try:
        sb = get_supabase()
        refs = sb.table("referrals").select("id").eq("referrer_id", user_id).execute()
        total = len(refs.data or [])

        from badges import award_badge
        if total >= 1:
            award_badge(user_id, "first_referral")
        if total >= 5:
            award_badge(user_id, "five_referrals")
        if total >= 10:
            award_badge(user_id, "ten_referrals")
    except Exception:
        pass


@router.get("/tournament/{tournament_id}/leaderboard")
def tournament_leaderboard(tournament_id: str):
    sb = get_supabase()
    res = (
        sb.table("leaderboard_entries")
        .select("*,profiles(username,display_name,avatar_url)")
        .eq("tournament_id", tournament_id)
        .order("rank")
        .limit(100)
        .execute()
    )
    entries = res.data or []
    if not entries:
        return []
    # Reputation score acumulado por usuario (clave ADITIVA: conserva todas
    # las claves existentes de cada fila).
    rep = _reputation_scores(sb, [e.get("user_id") for e in entries])
    for e in entries:
        e["reputation_score"] = rep.get(e.get("user_id"))
    return entries


@router.get("/tournament/{tournament_id}/round")
def tournament_round(tournament_id: str, request: Request):
    """Ronda actual del torneo con su deadline (lectura pública).

    Devuelve {tournament_id, round_number, closes_at, status} donde status
    es 'open' si closes_at es null o futura, y 'closed' si ya pasó.
    """
    # Auth opcional: el endpoint es público de lectura.
    get_optional_user(request)
    sb = get_supabase()
    res = sb.table("tournaments").select("*").eq("id", tournament_id).execute()
    if not res.data:
        raise HTTPException(404, "Torneo no encontrado")
    t = res.data[0]
    closes_at = t.get("closes_at")
    close_dt = _parse_ts(closes_at)
    status = (
        "closed"
        if close_dt is not None and close_dt <= datetime.now(timezone.utc)
        else "open"
    )
    return {
        "tournament_id": tournament_id,
        "round_number": t.get("round_number") or 1,
        "closes_at": closes_at,
        "status": status,
    }


@router.get("/tournament/{tournament_id}/my-submission")
def tournament_my_submission(tournament_id: str, request: Request):
    sb = get_supabase()
    uid = require_user(request)
    res = (
        sb.table("submissions")
        .select("*")
        .eq("tournament_id", tournament_id)
        .eq("user_id", uid)
        .execute()
    )
    return {"data": res.data[0] if res.data else None}


# ---------------------------------------------------------------------------
# TOKENS (QP)
# ---------------------------------------------------------------------------

@router.get("/tokens/balance")
def tokens_balance(request: Request):
    sb = get_supabase()
    uid = require_user(request)
    res = sb.table("tokens").select("*").eq("user_id", uid).execute()
    return res.data[0] if res.data else {"balance": 0, "lifetime_earned": 0, "lifetime_spent": 0, "tier": "free"}


@router.get("/tokens/ledger")
def tokens_ledger(request: Request):
    sb = get_supabase()
    uid = require_user(request)
    res = (
        sb.table("token_ledger")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


class TransactionBody(BaseModel):
    amount: int
    type: str
    ref_id: str | None = None
    memo: str | None = None


@router.post("/tokens/transaction")
def tokens_transaction(body: TransactionBody, request: Request):
    if body.amount == 0:
        raise HTTPException(400, "El monto debe ser distinto de cero")
    sb = get_supabase()
    uid = require_user(request)
    # Un gasto no puede exceder el balance disponible.
    if body.amount < 0 and _get_balance(uid) + body.amount < 0:
        raise HTTPException(400, "QP insuficientes para esta transacción")
    # Insert ledger entry
    sb.table("token_ledger").insert({
        "user_id": uid, "amount": body.amount, "type": body.type,
        "ref_id": body.ref_id, "memo": body.memo,
    }).execute()
    # Update balance
    _update_balance(uid, body.amount)
    return {"balance": _get_balance(uid)}


# ---------------------------------------------------------------------------
# ENDPOINT INTERNO (scheduler / webhooks de pago)
# ---------------------------------------------------------------------------

class GrantBody(BaseModel):
    user_id: str
    amount: int  # negativo permitido (p.ej. reversiones)
    memo: str | None = None


def _require_scheduler_key(x_scheduler_key: str | None) -> None:
    """Valida el header X-Scheduler-Key contra env SCHEDULER_KEY.

    Comparación en tiempo constante (hmac.compare_digest) para no filtrar
    por timing el valor esperado.
    """
    import os
    expected = os.environ.get("SCHEDULER_KEY")
    if not expected or not x_scheduler_key:
        raise HTTPException(
            401, "Unauthorized. Header X-Scheduler-Key inválido o ausente."
        )
    try:
        ok = hmac.compare_digest(x_scheduler_key, expected)
    except TypeError:
        ok = False
    if not ok:
        raise HTTPException(
            401, "Unauthorized. Header X-Scheduler-Key inválido o ausente."
        )


@router.post("/internal/tokens/grant")
def internal_tokens_grant(body: GrantBody, x_scheduler_key: str | None = Header(None)):
    """Otorga (o retira, si amount<0) QP a un usuario.

    Interno: protegido por X-Scheduler-Key == SCHEDULER_KEY.
    Upsert de tokens + registro en token_ledger.
    """
    _require_scheduler_key(x_scheduler_key)
    sb = get_supabase()

    cur = (
        sb.table("tokens")
        .select("balance,lifetime_earned,lifetime_spent,tier")
        .eq("user_id", body.user_id)
        .execute()
    )
    if cur.data:
        row = cur.data[0]
        balance = int(row["balance"]) + body.amount
        earned = int(row.get("lifetime_earned") or 0) + (body.amount if body.amount > 0 else 0)
        spent = int(row.get("lifetime_spent") or 0) + (-body.amount if body.amount < 0 else 0)
        sb.table("tokens").update({
            "balance": balance, "lifetime_earned": earned, "lifetime_spent": spent,
        }).eq("user_id", body.user_id).execute()
    else:
        balance = body.amount if body.amount > 0 else 0
        sb.table("tokens").insert({
            "user_id": body.user_id,
            "balance": balance,
            "lifetime_earned": max(0, body.amount),
            "lifetime_spent": max(0, -body.amount),
            "tier": "free",
        }).execute()

    ledger_type = (
        "stripe_purchase"
        if body.memo and body.memo.startswith("Compra Stripe")
        else "admin_grant"
    )
    sb.table("token_ledger").insert({
        "user_id": body.user_id, "amount": body.amount,
        "type": ledger_type, "memo": body.memo,
    }).execute()

    return {"user_id": body.user_id, "balance": balance}


# ---------------------------------------------------------------------------
# MARKETPLACE
# ---------------------------------------------------------------------------

@router.get("/marketplace")
@router.get("/marketplace/list")
def marketplace_list(asset_type: str | None = None, symbol: str | None = None):
    sb = get_supabase()
    q = sb.table("marketplace_strategies").select("*,profiles(username,display_name,avatar_url)").eq("status", "published")
    if asset_type:
        q = q.eq("asset_type", asset_type)
    if symbol:
        q = q.eq("symbol", symbol)
    q = q.order("subscribers", desc=True)
    return [row for row in q.execute().data or [] if not review_reasons(row)]


# ---------------------------------------------------------------------------
# Señal viva del meta-modelo comunitario (item 5 del rediseño)
# ---------------------------------------------------------------------------
@router.get("/marketplace/consensus-signal")
def marketplace_consensus_signal(tournament_id: str | None = None, round_number: int | None = None):
    """Devuelve la señal viva del meta-modelo comunitario de los torneos ML.

    Lee la fila mas reciente de consensus_signals (filtra por tournament_id /
    round_number si vienen). Si no hay ninguna, 404 claro.
    """
    sb = get_supabase()
    q = (
        sb.table("consensus_signals")
        .select("tournament_id,round_number,dataset_id,signal_json,created_at")
        .order("created_at", desc=True)
        .limit(1)
    )
    if tournament_id:
        q = q.eq("tournament_id", tournament_id)
    if round_number is not None:
        q = q.eq("round_number", round_number)
    res = q.execute()
    if not res.data:
        raise HTTPException(
            404,
            "No hay senal de meta-modelo comunitario disponible para esos filtros",
        )
    row = res.data[0]
    signal = row.get("signal_json") or {}
    return {
        "tournament_id": row.get("tournament_id"),
        "round_number": row.get("round_number"),
        "dataset_id": row.get("dataset_id"),
        "n_signals": len(signal),
        "signal": signal,
        "created_at": row.get("created_at"),
        "source": "meta-modelo comunitario",
    }


class PublishBody(BaseModel):
    title: str
    description: str | None = None
    tags: list[str] | None = None
    asset_type: str
    symbol: str
    timeframe: str
    code: str | None = None
    is_public_code: bool = False
    config: dict
    price_qp_week: int = 0


@router.post("/marketplace/publish")
def marketplace_publish(body: PublishBody, request: Request):
    sb = get_supabase()
    uid = require_user(request)
    slug = _unique_slug(sb, body.title, uid)
    res = sb.table("marketplace_strategies").insert({
        "author_id": uid,
        "title": body.title,
        "slug": slug,
        "description": body.description,
        "tags": body.tags or [],
        "asset_type": body.asset_type,
        "symbol": body.symbol,
        "timeframe": body.timeframe,
        "code": body.code,
        "is_public_code": body.is_public_code,
        "config": body.config,
        "price_qp_week": body.price_qp_week,
        "status": "needs_review",
        "published_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # -----------------------------------------------------------------------
    # SELLO DE INTEGRIDAD REAL (item 1 del rediseño del marketplace).
    # Corre el backtest OOS con datos REALES y escribe los campos de sello en
    # la fila recién insertada. Si el backtest falla, publica igual pero deja
    # backtest_metrics=None (sin anunciar una publicación válida).
    # -----------------------------------------------------------------------
    strategy_id = res.data[0]["id"]
    publication_status = "needs_review"
    try:
        # Construir StrategyConfig desde body.config + metadatos del marketplace.
        cfg = dict(body.config) if isinstance(body.config, dict) else {}
        cfg.setdefault("code", body.code or "fast={fast},slow={slow}".format(
            fast=cfg.get("fast", 20), slow=cfg.get("slow", 50)))
        cfg["symbol"] = body.symbol
        cfg["asset_type"] = body.asset_type
        cfg["timeframe"] = body.timeframe
        sc = StrategyConfig(**cfg)

        bt = run_backtest(sc)

        seal = {
            "backtest_metrics": bt.get("metrics"),
            "backtest_equity": bt.get("equity_curve"),
            "integrity_label": bt.get("integrity_label"),
            "method": "walk-forward " + str(bt.get("folds_used")) + "-fold, slippage por rango/volumen",
            "data_hash": bt.get("data_hash"),
            "replicable": False,
        }
        publication_status = "published" if not review_reasons({"title": body.title, **seal}) else "needs_review"
        seal["status"] = publication_status

        # Benchmarks vs estrategias naive (buy&hold y media móvil simple 20).
        try:
            from data_feed import get_ohlcv
            df = get_ohlcv(sc.asset_type, sc.symbol, sc.timeframe, sc.start, sc.end)
            if df is not None and not df.empty and "close" in df.columns:
                close = df["close"].astype(float)
                bh_ret = float((1.0 + close.pct_change().dropna()).prod() - 1.0)
                ma_ret = float((1.0 + close.rolling(20).mean().pct_change().dropna()).prod() - 1.0)
                strat_ret = float((bt.get("metrics") or {}).get("ret_total") or 0.0)
                seal["bench_buyhold"] = (strat_ret - bh_ret) * 100.0
                seal["bench_ma"] = (strat_ret - ma_ret) * 100.0
            else:
                seal["bench_buyhold"] = None
                seal["bench_ma"] = None
        except Exception as bench_exc:  # noqa: BLE001
            logger.warning("Sello: cálculo de benchmarks falló (se deja None): %s", bench_exc)
            seal["bench_buyhold"] = None
            seal["bench_ma"] = None

        try:
            sb.table("marketplace_strategies").update(seal).eq("id", strategy_id).execute()
        except Exception:
            # La columna data_hash aún no existe en DB (migración 0021
            # pendiente de aplicar): reintentar el sello sin ella, best-effort.
            logger.warning("Sello: columna data_hash ausente, se reintenta sin ella")
            seal_sin_hash = {k: v for k, v in seal.items() if k != "data_hash"}
            seal_sin_hash["status"] = "needs_review"
            publication_status = "needs_review"
            sb.table("marketplace_strategies").update(seal_sin_hash).eq("id", strategy_id).execute()
    except Exception as seal_exc:  # noqa: BLE001
        publication_status = "needs_review"
        logger.warning(
            "Sello de Integridad falló; se conserva pendiente de revisión: %s",
            seal_exc,
        )
        # Conserva el registro con el sello en estado 'sin datos' y no replicable.
        try:
            sb.table("marketplace_strategies").update(
                {"backtest_metrics": None, "replicable": False, "status": "needs_review"}
            ).eq("id", strategy_id).execute()
        except Exception:  # noqa: BLE001
            pass

    if publication_status == "published":
        # Actividad: estrategia publicada (best-effort, jamás rompe el flujo).
        try:
            from social import log_activity

            log_activity(
                uid,
                "published_strategy",
                target_type="marketplace_strategy",
                target_id=res.data[0]["id"],
                meta={"title": body.title},
            )
        except Exception:  # noqa: BLE001
            pass
    return {"id": strategy_id, "status": publication_status}


@router.get("/marketplace/{strategy_id}/replicate")
def marketplace_replicate(strategy_id: str, request: Request = None):  # noqa: RUF013 - None mantiene compat con llamadas directas en tests
    """VERIFICACIÓN / SELLO DE REPLICABILIDAD (item 2 del rediseño).

    Corre el backtest OTRA VEZ con datos frescos (mismo config) y compara el
    sharpe OOS con el guardado al publicar. Si |Δ| <= 0.3 y ambos > 0, marca la
    estrategia como `replicable=True` (Sello de Integridad confirmado). Si el
    hash de datos cambió, avisa que se evaluó sobre una ventana distinta.

    Requiere auth (evita cómputo anónimo costoso) y rate-limit en memoria
    (best-effort) de 1 corrida por minuto por (estrategia, usuario), para no
    re-bajar la API de datos en cada click.
    """
    import time

    uid = require_user(request)

    now = time.time()
    rl_key = f"{strategy_id}:{uid}"
    last = _replicate_last_run.get(rl_key)
    if last is not None and (now - last) < _REPLICATE_COOLDOWN_S:
        raise HTTPException(
            429,
            f"Replicar solo se puede correr 1 vez por minuto por estrategia "
            f"(espera {int(_REPLICATE_COOLDOWN_S - (now - last))}s).",
        )
    _replicate_last_run[rl_key] = now

    sb = get_supabase()
    s = sb.table("marketplace_strategies").select("*").eq("id", strategy_id).execute()
    if not s.data:
        raise HTTPException(404, "Estrategia no encontrada")
    row = s.data[0]

    # Reconstruir StrategyConfig desde la fila (config + metadatos de respaldo).
    base = row.get("config") or {}
    cfg = dict(base) if isinstance(base, dict) else {}
    if "symbol" not in cfg and row.get("symbol"):
        cfg["symbol"] = row["symbol"]
    if "asset_type" not in cfg and row.get("asset_type"):
        cfg["asset_type"] = row["asset_type"]
    if "timeframe" not in cfg and row.get("timeframe"):
        cfg["timeframe"] = row["timeframe"]
    if "code" not in cfg:
        cfg["code"] = row.get("code") or "fast={fast},slow={slow}".format(
            fast=cfg.get("fast", 20), slow=cfg.get("slow", 50))
    sc = StrategyConfig(**cfg)

    try:
        bt = run_backtest(sc)
    except Exception as rep_exc:  # noqa: BLE001
        logger.warning("Replicar falló al correr backtest: %s", rep_exc)
        return {
            "replicable": False,
            "error": str(rep_exc),
            "sharpe_original": None,
            "sharpe_replica": None,
            "delta": None,
        }

    new_sharpe = float((bt.get("metrics") or {}).get("sharpe_oos") or 0.0)
    old_metrics = row.get("backtest_metrics") or {}
    old_sharpe = old_metrics.get("sharpe_oos") if isinstance(old_metrics, dict) else None
    if old_sharpe is not None:
        old_sharpe = float(old_sharpe)
    old_data_hash = row.get("data_hash")
    data_hash_changed = bt.get("data_hash") != old_data_hash
    delta = (new_sharpe - old_sharpe) if old_sharpe is not None else None

    replicable = False
    note = None
    if old_sharpe is None:
        note = "Sin métricas previas para comparar (sharpe_oos original no disponible)."
    elif abs(new_sharpe - old_sharpe) <= REPLICATE_SHARPE_TOLERANCE and new_sharpe > 0 and old_sharpe > 0:
        replicable = True
    else:
        note = (
            f"Sharpe OOS no se mantuvo dentro del umbral "
            f"(|Δ|={abs(delta):.3f} > {REPLICATE_SHARPE_TOLERANCE} o alguno <= 0). "
            f"Estrategia NO replicable."
        )

    # Persistir el veredicto + el hash fresco (best-effort: la columna
    # data_hash aún no existe en DB —migración 0021 pendiente—, se reintenta
    # sin ella antes de rendirse).
    try:
        sb.table("marketplace_strategies").update(
            {"replicable": replicable, "data_hash": bt.get("data_hash")}
        ).eq("id", strategy_id).execute()
    except Exception:  # noqa: BLE001
        try:
            sb.table("marketplace_strategies").update(
                {"replicable": replicable}
            ).eq("id", strategy_id).execute()
        except Exception:  # noqa: BLE001
            pass

    result = {
        "replicable": replicable,
        "sharpe_original": old_sharpe,
        "sharpe_replica": new_sharpe,
        "delta": delta,
        "data_hash_changed": data_hash_changed,
    }
    if note:
        result["note"] = note
    if data_hash_changed:
        result["window_note"] = (
            "El hash de datos cambió: se evaluó sobre una ventana/distribución "
            "distinta a la de la publicación original."
        )
    return result


@router.post("/marketplace/{strategy_id}/subscribe")
def marketplace_subscribe(strategy_id: str, request: Request):
    sb = get_supabase()
    uid = require_user(request)
    # Verificar que no esté ya suscrito
    existing = sb.table("strategy_subscriptions").select("id").eq("strategy_id", strategy_id).eq("subscriber_id", uid).execute()
    if existing.data:
        raise HTTPException(400, "Ya estás suscrito a esta estrategia")
    s = sb.table("marketplace_strategies").select("price_qp_week,author_id,status,title,backtest_metrics,data_hash").eq("id", strategy_id).execute()
    if not s.data:
        raise HTTPException(404, "Estrategia no encontrada")
    if s.data[0].get("status") != "published" or review_reasons(s.data[0]):
        raise HTTPException(409, "La estrategia no está disponible para nuevas suscripciones")
    price = s.data[0]["price_qp_week"]
    # Cobrar si hay precio
    if price > 0:
        bal = _get_balance(uid)
        if bal < price:
            raise HTTPException(402, "QP insuficientes")
        sb.table("token_ledger").insert({
            "user_id": uid, "amount": -price, "type": "copy_cost",
            "ref_id": strategy_id, "memo": f"Suscripción a {strategy_id}",
        }).execute()
        _update_balance(uid, -price)
        # Pagar al autor
        sb.table("token_ledger").insert({
            "user_id": s.data[0]["author_id"], "amount": price, "type": "copy_income",
            "ref_id": strategy_id, "memo": f"Copy de {uid}",
        }).execute()
        _update_balance(s.data[0]["author_id"], price)
    sub = sb.table("strategy_subscriptions").insert({
        "strategy_id": strategy_id, "subscriber_id": uid, "status": "active",
    }).execute()
    return {"id": sub.data[0]["id"], "status": "active"}


@router.post("/marketplace/{strategy_id}/unsubscribe")
def marketplace_unsubscribe(strategy_id: str, request: Request):
    sb = get_supabase()
    uid = require_user(request)
    sb.table("strategy_subscriptions").update({"status": "cancelled"}).eq("strategy_id", strategy_id).eq("subscriber_id", uid).execute()
    return {"status": "cancelled"}


@router.get("/marketplace/my-subscriptions")
def marketplace_my_subscriptions(request: Request):
    sb = get_supabase()
    uid = require_user(request)
    res = (
        sb.table("strategy_subscriptions")
        .select("*,marketplace_strategies!inner(*)")
        .eq("subscriber_id", uid)
        .eq("status", "active")
        .execute()
    )
    return res.data or []


@router.get("/signals/{strategy_id}")
def signals_list(strategy_id: str):
    sb = get_supabase()
    res = (
        sb.table("signals")
        .select("*")
        .eq("strategy_id", strategy_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []


@router.get("/marketplace/{strategy_id}/signals")
def marketplace_signals(strategy_id: str, request: Request = None, limit: int = 20):  # noqa: RUF013
    """Señales de una estrategia del marketplace.

    Gratis (price_qp_week=0): públicas, sin auth. De pago: exigen suscripción
    activa a la estrategia (o ser su autor); si no, 403.
    """
    limit = max(1, min(limit, 100))
    sb = get_supabase()
    exists = (
        sb.table("marketplace_strategies")
        .select("id,price_qp_week,author_id")
        .eq("id", strategy_id)
        .execute()
    )
    if not exists.data:
        raise HTTPException(404, "Estrategia no encontrada")
    price = exists.data[0].get("price_qp_week") or 0
    if price > 0:
        uid = require_user(request)
        if uid != exists.data[0].get("author_id"):
            sub = (
                sb.table("strategy_subscriptions")
                .select("id")
                .eq("strategy_id", strategy_id)
                .eq("subscriber_id", uid)
                .eq("status", "active")
                .execute()
            )
            if not sub.data:
                raise HTTPException(
                    403,
                    "Estas señales son de pago: necesitas una suscripción activa "
                    "a la estrategia para verlas.",
                )
    res = (
        sb.table("signals")
        .select("*")
        .eq("strategy_id", strategy_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


@router.get("/marketplace/{strategy_id}")
def marketplace_detail(strategy_id: str, request: Request = None):  # noqa: RUF013
    """Detalle de una estrategia del marketplace (lectura, sin auth).

    Devuelve la fila completa (`*` incluye backtest_metrics, backtest_equity,
    is_public_code y, tras la migración 0012, delivers/replicable/bench_*).
    Trae también el perfil del autor vía join para el Sello de Integridad y
    la zona de autor de la página de detalle.

    Privacidad del código: si `is_public_code` es false y el lector no es el
    autor, el campo `code` se omite de la respuesta.
    """
    sb = get_supabase()
    res = (
        sb.table("marketplace_strategies")
        .select("*,profiles(username,display_name,avatar_url)")
        .eq("id", strategy_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Estrategia no encontrada")
    row = res.data[0]
    reader = get_optional_user(request) if request is not None else None
    row["catalog_available"] = row.get("status") == "published" and not review_reasons(row)
    if row.get("status") != "published" or review_reasons(row):
        if reader != row.get("author_id"):
            subscriptions = sb.table("strategy_subscriptions").select("id").eq("strategy_id", strategy_id).eq("subscriber_id", reader).in_("status", ["active", "paused"]).execute().data if reader else []
            if not subscriptions:
                raise HTTPException(404, "Estrategia no disponible en el catálogo público")
    if not row.get("is_public_code"):
        if reader != row.get("author_id"):
            row = {k: v for k, v in row.items() if k != "code"}
    return row


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------




def _parse_ts(value) -> datetime | None:
    """Parsea un timestamp (str ISO de Supabase o datetime) a datetime aware UTC.

    Devuelve None si es null/vacío/no parseable.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip()
    if not s:
        return None
    try:
        if s.endswith(("Z", "z")):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
    except ValueError:
        logger.warning(f"Timestamp no parseable para ronda de torneo: {value!r}")
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _reputation_scores(sb, user_ids) -> dict[str, float | None]:
    """Reputation score por usuario: promedio del primary_score de sus últimas
    5 submissions (submitted_at DESC).

    Nombres reales verificados en supabase/migrations/0002_tournaments_marketplace.sql:
    la tabla es `submissions` (no tournament_submissions); no existen columnas
    deflated_sharpe_oos ni sharpe_oos — el evaluador guarda en `primary_score`
    la métrica primaria del torneo (deflated_sharpe_oos por defecto) y el
    orden temporal vive en `submitted_at` (no hay created_at).
    Sin submissions (o sin puntajes evaluados) -> None.
    """
    out: dict[str, float | None] = {}
    seen: set[str] = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        try:
            res = (
                sb.table("submissions")
                .select("user_id,primary_score")
                .eq("user_id", uid)
                .order("submitted_at", desc=True)
                .limit(5)
                .execute()
            )
            scores = [
                r["primary_score"]
                for r in (res.data or [])
                if r.get("primary_score") is not None
            ]
            out[uid] = round(sum(scores) / len(scores), 6) if scores else None
        except Exception as e:
            logger.warning(f"No se pudo calcular reputación de {uid}: {e}")
            out[uid] = None
    return out


def _get_balance(uid: str) -> int:
    sb = get_supabase()
    res = sb.table("tokens").select("balance").eq("user_id", uid).execute()
    return res.data[0]["balance"] if res.data else 0


def _update_balance(uid: str, delta: int):
    """Aplica `delta` al balance manteniendo lifetime_earned/spent y tier.

    Misma aritmética que `internal_tokens_grant` (referencia): el alta y el
    gasto acumulados se mueven en el MISMO upsert que el balance, para no
    perderlos con on_conflict="user_id".
    """
    sb = get_supabase()
    cur = (
        sb.table("tokens")
        .select("balance,lifetime_earned,lifetime_spent,tier")
        .eq("user_id", uid)
        .execute()
    )
    if cur.data:
        row = cur.data[0]
        bal = int(row.get("balance") or 0) + delta
        earned = int(row.get("lifetime_earned") or 0) + (delta if delta > 0 else 0)
        spent = int(row.get("lifetime_spent") or 0) + (-delta if delta < 0 else 0)
        sb.table("tokens").upsert({
            "user_id": uid, "balance": bal,
            "lifetime_earned": earned, "lifetime_spent": spent,
            "tier": row.get("tier") or "free",
        }, on_conflict="user_id").execute()
    else:
        sb.table("tokens").upsert({
            "user_id": uid,
            "balance": delta if delta > 0 else 0,
            "lifetime_earned": max(0, delta),
            "lifetime_spent": max(0, -delta),
            "tier": "free",
        }, on_conflict="user_id").execute()


def _slugify(s: str) -> str:
    import re
    s = s.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s]+", "-", s)
    return s[:50]


def _unique_slug(sb, title: str, author_id: str) -> str:
    """Slug único: base + sufijo corto si ya existe.

    marketplace_strategies.slug tiene constraint UNIQUE; sin esto, publicar dos
    veces una estrategia con el mismo título (ej: 'BTCUSDT · 1d') revienta 500.

    El bucle está ACOTADO a propósito: la versión anterior usaba `while True`,
    y si la consulta devolvía siempre datos (mock en tests, o un fallo raro de
    la DB) el request se colgaba para siempre. Tras los intentos se cae a un
    sufijo largo aleatorio, que en la práctica no colisiona.
    """
    import secrets

    base = _slugify(title) or "estrategia"
    slug = f"{base}-{author_id[:8]}"

    def libre(candidato: str) -> bool:
        try:
            res = (
                sb.table("marketplace_strategies")
                .select("id")
                .eq("slug", candidato)
                .limit(1)
                .execute()
            )
            return not res.data
        except Exception as e:  # noqa: BLE001 - ante duda, seguimos probando
            logger.warning(f"No se pudo comprobar el slug '{candidato}': {e}")
            return False

    if libre(slug):
        return slug

    for _ in range(5):
        candidate = f"{base}-{secrets.token_hex(2)}"
        if libre(candidate):
            return candidate

    # Salida garantizada: sufijo de 8 hex (32 bits) — colisión despreciable.
    return f"{base}-{secrets.token_hex(4)}"


# ---------------------------------------------------------------------------
# API KEYS (acceso programático / MCP — claves qlk_... sin expiración)
# ---------------------------------------------------------------------------

import hashlib
import secrets
from datetime import datetime, timezone


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.post("/account/api-keys")
def create_api_key(request: Request, body: dict):
    """Crea una clave de API para el usuario autenticado (JWT requerido).
    Body: { name: str }. Devuelve la clave en claro UNA sola vez."""
    uid = require_user(request)
    name = str(body.get("name") or "Mi clave").strip()[:50]
    sb = get_supabase()

    # Límite de 10 claves activas por usuario.
    existing = (
        sb.table("api_keys")
        .select("id")
        .eq("user_id", uid)
        .is_("revoked_at", "null")
        .execute()
    )
    if len(existing.data or []) >= 10:
        raise HTTPException(400, "Límite de 10 claves activas alcanzado. Revoca alguna primero.")

    key = "qlk_" + secrets.token_hex(24)  # 48 hex chars
    sb.table("api_keys").insert(
        {"user_id": uid, "name": name, "key_hash": _hash_key(key)}
    ).execute()
    return {"key": key, "name": name}


@router.get("/account/api-keys")
def list_api_keys(request: Request):
    """Lista las claves del usuario autenticado (sin revelar el secreto)."""
    uid = require_user(request)
    sb = get_supabase()
    res = (
        sb.table("api_keys")
        .select("id, name, created_at, last_used_at, revoked_at")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.delete("/account/api-keys/{key_id}")
def revoke_api_key(key_id: str, request: Request):
    """Revoca una clave del usuario autenticado."""
    uid = require_user(request)
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    res = (
        sb.table("api_keys")
        .update({"revoked_at": now})
        .eq("id", key_id)
        .eq("user_id", uid)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Clave no encontrada")
    return {"ok": True}
