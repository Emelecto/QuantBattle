"""Persistencia de datasets y submissions de torneos ML.

Funciones server-side (service_role). El holdout (dataset_targets) se escribe
aquí y NUNCA se expone al cliente (ver RLS en la migración 0011).
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import random
import time
from datetime import datetime, timezone

import pandas as pd

import ml_storage as store
import dataset_builder as db
import scoring_ml as sc
import ml_protocol as protocol

logger = logging.getLogger(__name__)

_SALT = os.environ.get("DATASET_SALT") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY", ""
)[:32]

# Reintento con backoff para operaciones de DB/Storage (igual política que
# ml_storage: exponencial + jitter, 4 intentos por defecto).
_DB_RETRY_ATTEMPTS = 4
_DB_RETRY_BASE_DELAY = 0.5
BINANCE_VISION_LICENSE = "CC BY-NC-SA 4.0"
BINANCE_VISION_ATTRIBUTION = "Binance Vision"
BINANCE_VISION_ATTRIBUTION_URL = "https://data.binance.vision/"
BINANCE_VISION_TERMS_URL = (
    "https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md"
)


def _with_retry(fn, *, op: str):
    """Reintenta `fn()` con backoff exponencial + jitter."""
    last_exc: Exception | None = None
    for attempt in range(1, _DB_RETRY_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if attempt >= _DB_RETRY_ATTEMPTS:
                break
            delay = _DB_RETRY_BASE_DELAY * (2 ** (attempt - 1)) + random.uniform(0, _DB_RETRY_BASE_DELAY)
            logger.warning("%s: intento %d/%d falló (%s); reintento en %.2fs",
                           op, attempt, _DB_RETRY_ATTEMPTS, exc, delay)
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


# ---------------------------------------------------------------------------
# Versionado determinista del dataset (misma versión = mismo resultado)
# ---------------------------------------------------------------------------
def frame_hash(df: pd.DataFrame) -> str:
    """Checksum SHA-256 estable del contenido de un frame publicado."""
    try:
        return store.sha256_df(df)
    except Exception:
        # Fallback sin pyarrow: CSV ordenado (nunca debe fallar el versionado).
        ordered = df.sort_values(by=list(df.columns)).reset_index(drop=True)
        return hashlib.sha256(ordered.to_csv(index=False).encode("utf-8")).hexdigest()


def verify_frame_hash(df: pd.DataFrame, expected: str) -> bool:
    """True si el contenido del frame coincide con el hash esperado."""
    try:
        import hmac
        return hmac.compare_digest(frame_hash(df), expected)
    except Exception:
        return False


def compute_dataset_version(*, mode: str, seed_obfuscar, seed_gen,
                            salt_hash: str, feature_cols: list,
                            frames: dict, row_counts: dict,
                            n_activos: int, n_eras: int,
                            ic_objetivo=None, data_source=None,
                            data_license=None, round_type=None, timeframe=None,
                            target_horizon_eras=None,
                            target_base_delay_eras=None) -> dict:
    """Huella determinista del dataset.

    `frames`: {kind: sha256 del frame publicado} (train/validation/live).
    Devuelve {"version": "v1-<12hex>", "data_hash": "<64hex>"}.
    Mismos inputs (mismo seed, sal, features y contenido) => misma versión,
    de modo que el paper es reproducible: fijar `version` fija el resultado.
    """
    canonical = json.dumps({
        "mode": mode,
        "seed_obfuscar": seed_obfuscar,
        "seed_gen": seed_gen,
        "salt_hash": salt_hash,
        "feature_cols": list(feature_cols),
        "frames": {k: frames[k] for k in sorted(frames)},
        "row_counts": {k: int(row_counts[k]) for k in sorted(row_counts)},
        "n_activos": int(n_activos),
        "n_eras": int(n_eras),
        "ic_objetivo": ic_objetivo,
        "data_source": data_source,
        "data_license": data_license,
        "round_type": round_type,
        "timeframe": timeframe,
        "target_horizon_eras": target_horizon_eras,
        "target_base_delay_eras": target_base_delay_eras,
    }, sort_keys=True, separators=(",", ":"))
    data_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {"version": f"v1-{data_hash[:12]}", "data_hash": data_hash}


# ---------------------------------------------------------------------------
# Generación de una ronda (cron / scheduler)
# ---------------------------------------------------------------------------
def crear_dataset(tournament_id: str, round_number: int, mode: str = "sintetico",
                  closes_at=None, now=None, round_type: str | None = None,
                  **gen_kwargs) -> dict:
    """Genera una ronda histórica o de práctica con holdout privado.

    Para 'real' se requiere `universo` (lista de (tipo, simbolo)).

    Reproducibilidad: los registros de `ml_datasets` llevan `version`,
    `data_hash` (checksum global), `seed` y `params`. Mismos inputs (mismo
    seed, sal, features y contenido) => misma `version`; el paper fija la
    versión y obtiene siempre el mismo resultado. La subida a Storage usa
    reintento con backoff + sidecar SHA-256 (ver `ml_storage`).
    """
    from datetime import datetime, timezone
    now = now or datetime.now(timezone.utc)
    round_salt = hashlib.sha256(
        f"{_SALT}|{tournament_id}|{round_number}".encode("utf-8")
    ).hexdigest()
    seed_obf = int(round_salt[:8], 16)
    round_type = round_type or ("practice" if mode == "sintetico" else "historical")
    if round_type not in ("practice", "historical", "prospective"):
        raise ValueError("tipo de ronda desconocido")
    if (mode == "sintetico") != (round_type == "practice"):
        raise ValueError("práctica debe ser sintética y rondas reales deben usar mercado")
    data_source = gen_kwargs.get("data_source")
    if mode == "real":
        if os.environ.get("ML_REAL_ROUNDS_APPROVED", "").lower() != "true":
            raise ValueError("Publicación real desactivada hasta aprobar la fuente y su distribución")
        if data_source != "binance_vision":
            raise ValueError("Las rondas ML reales deben usar Binance Vision.")
        universo = gen_kwargs.get("universo") or []
        if len(universo) < 30 or any(asset_type != "crypto" for asset_type, _ in universo):
            raise ValueError("Binance Vision requiere al menos 30 pares crypto spot.")
        if gen_kwargs.get("timeframe", "1d") != "1d":
            raise ValueError("Los torneos Binance Vision usan velas diarias (1d).")
    if mode == "sintetico" and gen_kwargs.get("seed") is None:
        gen_kwargs["seed"] = int(round_salt[8:16], 16)
    if mode == "sintetico":
        panel, cols, meta = db.generar_mercado_sintetico(**gen_kwargs)
    elif mode == "real":
        if "universo" not in gen_kwargs:
            raise ValueError("modo 'real' requiere 'universo'")
        panel, cols, meta = db.generar_panel_real(
            **gen_kwargs, keep_unlabeled=round_type == "prospective",
            strict_universe=round_type == "prospective",
        )
    else:
        raise ValueError(f"mode desconocido: {mode}")

    _publico, interna, mapeos = db.obfuscar(panel, cols, salt=round_salt, seed=seed_obf)
    # El target real es un retorno a cinco eras; purgar etiquetas que miran
    # dentro de la siguiente partición evita fuga temporal entre conjuntos.
    if round_type == "prospective":
        latest = int(interna["era_idx"].max())
        available = sorted(int(x) for x in interna.loc[
            interna["target"].notna() & (interna["era_idx"] < latest), "era_idx"
        ].unique())
        if len(available) < 50:
            raise ValueError("Historia etiquetada insuficiente para prospectivo")
        cut = int(len(available) * 0.75)
        partes = {
            "train": interna[interna["era_idx"] < available[cut - 5]],
            "validation": interna[(interna["era_idx"] >= available[cut]) &
                                  (interna["era_idx"] <= available[-1])],
            "live": interna[interna["era_idx"] == latest],
        }
        if partes["live"]["target"].notna().any():
            raise ValueError("El prospectivo no puede publicar una era con target conocido")
    else:
        partes = db.partir(interna, purge_eras=5 if mode == "real" else 0)
    quality = protocol.validate_round_parts(
        partes, mapeos["feat_cols"], min_assets=30,
        min_test_eras=1 if round_type == "prospective" else 10,
        live_target_required=round_type != "prospective",
    )

    # Metadatos derivados del panel (no dependen de claves del meta del generador)
    n_activos = int(interna["activo_idx"].nunique()) if "activo_idx" in interna else int(panel["activo_idx"].nunique())
    n_eras = int(interna["era_idx"].nunique())

    from tournaments import get_supabase
    supabase = get_supabase()

    base = f"{mode}/{tournament_id[:8]}/r{round_number:03d}"
    salt_hash = hashlib.sha256(round_salt.encode()).hexdigest()[:16]
    # Semilla efectiva de la obfuscación (la que fija los ids/features) y
    # semilla pedida al generador (informativa; el generador no siempre la
    # devuelve en `meta`). Ambas entran al versionado.
    _sg = gen_kwargs.get("seed", meta.get("seed", 0))
    try:
        seed_gen = int(_sg) if _sg is not None else None
    except (TypeError, ValueError):
        seed_gen = None
    params = {
        "n_activos": n_activos,
        "n_eras": n_eras,
        "n_features": gen_kwargs.get("n_features", len(mapeos["feat_cols"])),
        "n_features_utiles": gen_kwargs.get("n_features_utiles"),
        "ic_objetivo": meta.get("ic_objetivo"),
        "seed_gen": seed_gen,
        "seed_obfuscar": seed_obf,
        "dias": gen_kwargs.get("dias"),
        "timeframe": gen_kwargs.get("timeframe"),
        "target_horizon_eras": 5 if mode == "real" else None,
        "target_base_delay_eras": 1 if round_type == "prospective" else None,
        "data_source": data_source,
    }
    if data_source == "binance_vision":
        params.update({
            "data_license": BINANCE_VISION_LICENSE,
            "data_attribution": BINANCE_VISION_ATTRIBUTION,
            "data_attribution_url": BINANCE_VISION_ATTRIBUTION_URL,
            "data_terms_url": BINANCE_VISION_TERMS_URL,
            "derived_data_license": BINANCE_VISION_LICENSE,
            "commercial_use_allowed": False,
        })
    # ml_datasets es de lectura pública: nunca guardar símbolos allí.
    if "universo" in gen_kwargs:
        params["universe_size"] = len(gen_kwargs["universo"])
    params = {k: v for k, v in params.items() if v is not None}

    # Train y validation necesitan etiquetas para que el participante pueda
    # entrenar y validar. Solo el target de live es un holdout privado.
    _DROP_INTERNAL = ["era_idx", "activo_idx", "target_raw"]
    frame_hashes: dict[str, str] = {}
    row_counts: dict[str, int] = {}
    recs = []
    for kind, df in (("train", partes["train"]), ("validation", partes["validation"])):
        path = f"{base}/{kind}.parquet"
        df_pub = df.drop(columns=_DROP_INTERNAL, errors="ignore").sample(
            frac=1, random_state=seed_obf
        ).reset_index(drop=True)
        store.upload_parquet(df_pub, path)  # reintento + sidecar SHA-256 internos
        frame_hashes[kind] = frame_hash(df_pub)
        row_counts[kind] = len(df)
        recs.append({
            "tournament_id": tournament_id,
            "round_number": round_number,
            "mode": mode,
            "kind": kind,
            "status": "building",
            "n_assets": n_activos,
            "n_eras": int(df["era_idx"].nunique()),
            "n_features": len(mapeos["feat_cols"]),
            "feature_cols": mapeos["feat_cols"],
            "bucket_path": path,
            "row_count": len(df),
            "salt_hash": salt_hash,
            "ic_objetivo": meta.get("ic_objetivo"),
            "closes_at": closes_at,
            "created_at": now.isoformat(),
            "data_hash": frame_hashes[kind],
            "seed": seed_gen,
            "params": params,
            "round_type": round_type,
            "score_version": protocol.SCORE_VERSION,
            "quality_report": quality,
        })

    # El live público contiene ids y features, pero nunca sus etiquetas.
    live = partes["live"]
    live_pub = live.drop(columns=_DROP_INTERNAL + ["target"], errors="ignore").sample(
        frac=1, random_state=seed_obf
    ).reset_index(drop=True)
    live_path = f"{base}/live.parquet"
    store.upload_parquet(live_pub, live_path)
    frame_hashes["live"] = frame_hash(live_pub)
    row_counts["live"] = len(live)
    target_path = f"{base}/targets.parquet"
    mapping_path = None
    mapping_hash = None
    target_hash = None
    if round_type == "prospective":
        latest = int(live["era_idx"].iloc[0])
        label = mapeos["eras"][latest]
        source = panel[panel["era_idx"] == latest].copy()
        asset_map = meta["asset_map"]
        mapping = pd.DataFrame({
            "row_id": [hashlib.sha256(
                f"{round_salt}|{label}|{int(asset)}".encode("utf-8")
            ).hexdigest()[:16] for asset in source["activo_idx"]],
            "era": label,
            "asset_type": [asset_map[int(asset)]["asset_type"] for asset in source["activo_idx"]],
            "symbol": [asset_map[int(asset)]["symbol"] for asset in source["activo_idx"]],
            "as_of_date": [pd.Timestamp(date).date().isoformat() for date in source["fecha"]],
            "as_of_close": source["close"].astype(float).to_numpy(),
        })
        mapping_path = f"{base}/mapping.parquet"
        mapping_hash = frame_hash(mapping)
        frame_hashes["mapping"] = mapping_hash
        store.upload_private_parquet(mapping, mapping_path)
        if not verify_frame_hash(store.download_private_parquet(mapping_path), mapping_hash):
            raise ValueError("El mapa privado almacenado no coincide con su hash")
    else:
        targets = live[["id", "target", "era"]].rename(columns={"id": "row_id"})
        target_hash = frame_hash(targets)
        frame_hashes["targets"] = target_hash
        store.upload_private_parquet(targets, target_path)
        if not verify_frame_hash(store.download_private_parquet(target_path), target_hash):
            raise ValueError("El holdout almacenado no coincide con su hash")
    ver = compute_dataset_version(
        mode=mode, seed_obfuscar=seed_obf, seed_gen=seed_gen,
        salt_hash=salt_hash, feature_cols=mapeos["feat_cols"],
        frames=frame_hashes, row_counts=row_counts,
        n_activos=n_activos, n_eras=n_eras, ic_objetivo=meta.get("ic_objetivo"),
        data_source=data_source,
        data_license=params.get("data_license"),
        round_type=round_type,
        timeframe=gen_kwargs.get("timeframe"),
        target_horizon_eras=params.get("target_horizon_eras"),
        target_base_delay_eras=params.get("target_base_delay_eras"),
    )
    for r in recs:
        r["version"] = ver["version"]

    # Insertar los tres tipos de partición.
    inserted = []
    for r in recs:
        res = _with_retry(
            lambda r=r: supabase.table("ml_datasets").insert(r).execute(),
            op=f"insert ml_datasets {r['kind']}",
        )
        inserted.append(res.data[0])

    # El target de live permanece privado en la base de datos.
    live_rec = {
        "tournament_id": tournament_id,
        "round_number": round_number,
        "mode": mode,
        "kind": "live",
        "status": "building",
        "n_assets": n_activos,
        "n_eras": int(live["era_idx"].nunique()),
        "n_features": len(mapeos["feat_cols"]),
        "feature_cols": mapeos["feat_cols"],
        "bucket_path": live_path,
        "row_count": len(live),
        "salt_hash": salt_hash,
        "ic_objetivo": meta.get("ic_objetivo"),
        "closes_at": closes_at,
        "created_at": now.isoformat(),
        "data_hash": frame_hashes["live"],
        "version": ver["version"],
        "seed": seed_gen,
        "params": params,
        "round_type": round_type,
        "score_version": protocol.SCORE_VERSION,
        "quality_report": quality,
        "target_path": target_path,
        "target_hash": target_hash,
        "mapping_path": mapping_path,
        "mapping_hash": mapping_hash,
    }
    res = _with_retry(
        lambda: supabase.table("ml_datasets").insert(live_rec).execute(),
        op="insert ml_datasets live",
    )
    live_dataset = res.data[0]
    inserted.append(live_dataset)
    ids = [item["id"] for item in inserted]
    published_at = datetime.now(timezone.utc).isoformat()
    _with_retry(
        lambda: supabase.table("ml_datasets").update({
            "status": "ready", "published_at": published_at,
        }).in_("id", ids).execute(), op="publish ml_datasets",
    )
    live_dataset["status"] = "ready"
    live_dataset["published_at"] = published_at

    logger.info("Ronda %s #%s publicada: %s filas de competición (%s)",
                mode, round_number, len(live), round_type)
    return live_dataset


# ---------------------------------------------------------------------------
# Scoring de una submission
# ---------------------------------------------------------------------------
def puntuar_submission_en_bd(submission_id: str, meta_modelo=None) -> dict:
    """Carga la submission + el holdout privado, puntúa y guarda el resultado.

    Si `meta_modelo` (Serie de predicciones del meta-modelo comunitario) se
    pasa, se usa para penalizar falta de originalidad (meta_corr > UMBRAL_PLAGIO).
    """
    from tournaments import get_supabase
    supabase = get_supabase()

    sub = supabase.table("prediction_submissions").select("*").eq("id", submission_id).execute()
    if not sub.data:
        raise ValueError("submission no encontrada")
    sub = sub.data[0]
    ahora_iso = datetime.now(timezone.utc).isoformat()

    ds = supabase.table("ml_datasets").select("*").eq("id", sub["dataset_id"]).execute()
    if ds.data and ds.data[0].get("score_version") == protocol.SCORE_VERSION:
        return _score_submission_v1(supabase, sub, ds.data[0])
    feat_cols = (ds.data[0].get("feature_cols") or []) if ds.data else []

    # Descargar el CSV de predicciones del usuario desde Storage (o leer del campo).
    preds = _leer_predicciones(sub)
    if preds is None or len(preds) == 0:
        supabase.table("prediction_submissions").update({
            "status": "disqualified", "is_valid": False,
            "eval_error": "sin predicciones", "scored_at": ahora_iso,
        }).eq("id", submission_id).execute()
        return {"status": "disqualified", "motivo": "sin predicciones"}

    # Holdout privado (incluye features para el FNC)
    # OJO: PostgREST capa a 1000 filas por query (db-max-rows). Sin paginar,
    # solo se puntuaban ~1000 filas del holdout -> n_eras ~2 -> todas las
    # submissions quedaban is_valid=false. Se pagina con offset+limit.
    cols = "row_id,target,era" + ("," + ",".join(feat_cols) if feat_cols else "")
    targets = []
    _off = 0
    while True:
        _page = supabase.table("dataset_targets").select(cols).eq(
            "dataset_id", sub["dataset_id"]
        ).offset(_off).limit(1000).execute()
        targets.extend(_page.data or [])
        if len(_page.data or []) < 1000:
            break
        _off += len(_page.data or [])
    tdf = pd.DataFrame(targets)
    # Puntuar solo entregas completas: una selección de filas/eras permitiría
    # optimizar el score fuera del protocolo del torneo.
    ids_pred = preds["id"].astype(str) if "id" in preds else pd.Series(dtype=str)
    ids_live = tdf["row_id"].astype(str) if "row_id" in tdf else pd.Series(dtype=str)
    if (len(ids_pred) != len(ids_live) or ids_pred.duplicated().any()
            or set(ids_pred) != set(ids_live)):
        supabase.table("prediction_submissions").update({
            "status": "disqualified", "is_valid": False,
            "eval_error": "la entrega debe incluir exactamente todos los ids del live",
            "scored_at": ahora_iso,
        }).eq("id", submission_id).execute()
        return {"status": "disqualified", "motivo": "ids incompletos o duplicados"}
    merged = preds.merge(tdf, left_on="id", right_on="row_id", how="inner")
    if len(merged) == 0:
        supabase.table("prediction_submissions").update({
            "status": "disqualified", "is_valid": False,
            "eval_error": "ids de prediccion no coinciden con el dataset",
            "scored_at": ahora_iso,
        }).eq("id", submission_id).execute()
        return {"status": "disqualified", "motivo": "ids de prediccion no coinciden con el dataset"}
    if len(merged) < sc.MIN_ERAS:
        supabase.table("prediction_submissions").update({
            "status": "disqualified", "is_valid": False,
            "eval_error": "filas insuficientes", "scored_at": ahora_iso,
        }).eq("id", submission_id).execute()
        return {"status": "disqualified", "motivo": "filas insuficientes"}

    res = sc.puntuar_submission(
        merged["prediction"], merged["target"], merged["era"],
        merged[feat_cols] if feat_cols else merged.drop(columns=["id", "prediction", "target", "era", "row_id"]),
        meta_modelo=meta_modelo,
    )

    # Anti-plagio: comparar con otras submissions del mismo dataset
    otras = supabase.table("prediction_submissions").select("id").eq(
        "dataset_id", sub["dataset_id"]
    ).neq("id", submission_id).eq("is_valid", True).execute()
    plagio = False
    if otras.data:
        dfp = pd.DataFrame({"base": merged["prediction"].values})
        for s in otras.data:
            op = _leer_predicciones(s)
            if op is None or len(op) == 0:
                continue
            dfp[len(dfp.columns)] = op.iloc[:, 1].values
        if dfp.shape[1] > 1:
            pares = sc.matriz_similitud(dfp)
            # Sospechoso si el "base" (col 0) se parece a otra submission
            if any(p["a"] == "base" or p["b"] == "base" for p in pares):
                plagio = True

    supabase.table("prediction_submissions").update({
        "status": "scored", "is_valid": res["valida"], "plagio_flag": plagio,
        "score": res["score"], "corr_mean": res["corr_mean"], "fnc_mean": res["fnc_mean"],
        "consistencia": res["consistencia"], "meta_corr": res["meta_corr"],
        "scored_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", submission_id).execute()
    return res


def _score_submission_v1(supabase, sub: dict, ds: dict) -> dict:
    """Puntúa solo rondas cerradas y reclamadas por el scheduler."""
    now = datetime.now(timezone.utc)
    if ds.get("status") != "scoring":
        raise ValueError("El score de esta ronda aún no está habilitado")
    closes_at = ds.get("closes_at")
    if not closes_at or datetime.fromisoformat(closes_at.replace("Z", "+00:00")) > now:
        raise ValueError("La ronda sigue abierta")
    available_at = ds.get("target_available_at")
    if available_at and datetime.fromisoformat(available_at.replace("Z", "+00:00")) > now:
        raise ValueError("Las etiquetas aún no han madurado")
    if sub.get("status") not in ("validated", "scoring", "scored") or not sub.get("is_selected", True):
        raise ValueError("Envío no seleccionado o no validado")
    if sub.get("dataset_version") and sub["dataset_version"] != ds.get("version"):
        raise ValueError("Versión del dataset distinta a la del envío")
    path = ds.get("target_path")
    if not path or not ds.get("target_hash"):
        raise ValueError("Holdout privado no configurado")
    targets = store.download_private_parquet(path)
    if not verify_frame_hash(targets, ds["target_hash"]):
        raise ValueError("El hash del holdout no coincide")
    predictions = _leer_predicciones(sub)
    if predictions is None:
        raise ValueError("No se pudo leer el envío")
    min_eras = 1 if ds.get("round_type") == "prospective" else 10
    result = protocol.score_predictions(predictions, targets, min_eras=min_eras)
    supabase.table("prediction_submissions").update({
        "status": "scored", "is_valid": True, "eval_error": None,
        "score": result["score"], "corr_mean": result["corr_mean"],
        "consistencia": sum(corr > 0 for corr in result["per_era"]) / result["n_eras"],
        "fnc_mean": None, "meta_corr": None,
        "scored_at": now.isoformat(),
    }).eq("id", sub["id"]).execute()
    return result


def _leer_predicciones(sub: dict) -> pd.DataFrame | None:
    """Lee un intento inmutable privado y verifica su hash.

    Solo reconstruye la ruta pública antigua para envíos anteriores a v1.
    """
    if sub.get("_predicciones_df") is not None:
        return sub["_predicciones_df"]
    path = sub.get("file_path")
    if not path:
        path = f"submissions/{str(sub.get('dataset_id',''))[:8]}/{sub.get('user_id')}.csv"
    if not path:
        return None
    try:
        # Intentar CSV primero, luego parquet (ambos en el bucket de predicciones)
        try:
            data = store.download_csv(
                path, expected_sha256=sub.get("file_sha256"),
                allow_legacy_fallback=not bool(sub.get("file_path")),
            )
            return pd.read_csv(io.BytesIO(data), dtype={"id": str})
        except Exception:
            if sub.get("file_path"):
                raise
            return store.download_parquet(path, bucket=store.SUBMISSIONS_BUCKET)
    except Exception as e:
        logger.warning(f"No se pudo leer predicciones desde {path}: {e}")
        return None


def cargar_predicciones_validas(supabase, dataset_id) -> pd.DataFrame:
    """Trae las predicciones de subs is_valid=True del dataset y arma un DataFrame.

    Índice = row_id (columna `id` del CSV de la submission), columnas = submission
    id, valores = prediction. Devuelve un DataFrame vacío si no hay subs válidas.
    """
    subs = (
        supabase.table("prediction_submissions")
        .select("id,dataset_id,user_id,status,is_valid,plagio_flag")
        .eq("dataset_id", dataset_id)
        .eq("is_valid", True)
        .execute()
    )
    if not subs.data:
        return pd.DataFrame()
    series = {}
    for sub in subs.data:
        preds = _leer_predicciones(sub)
        if preds is None or len(preds) == 0:
            continue
        s = preds.set_index("id")["prediction"]
        s.name = sub["id"]
        series[sub["id"]] = s
    if not series:
        return pd.DataFrame()
    return pd.concat(series, axis=1)


# ---------------------------------------------------------------------------
# Scoring programado de submissions pendientes (cron / scheduler)
# ---------------------------------------------------------------------------
def evaluate_ml_rounds(supabase, now=None) -> int:
    """Alias de compatibilidad: solo el scheduler controla el cierre."""
    import ml_scheduler
    if supabase is None:
        from tournaments import get_supabase
        supabase = get_supabase()
    return ml_scheduler.evaluate_ml_rounds(supabase, now)

