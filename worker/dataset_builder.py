"""Generador de datasets para los torneos ML de QuantLab.

Dos modos:
  - "sintetico": mercado artificial con estructura de factores, regimenes,
    volatilidad con clustering y colas gruesas. Anonimato total por
    construccion, universo del tamaño que queramos y señal CONOCIDA (podemos
    garantizar que el torneo es ganable).
  - "real": panel derivado de datos reales (Binance/yfinance) obfuscado con
    las 6 capas anti-de-anonimizacion validadas.

En ambos casos lo que se publica son features normalizadas POR ERA y
discretizadas: no hay precios, ni fechas, ni tickers.
"""
from __future__ import annotations

import hashlib
import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

N_BINS = 5
N_FACTORES = 5
P_PERSISTENCIA_REGIMEN = 0.90   # medido: recorre los 3 regimenes (~24 cambios/350 eras)


# --------------------------------------------------------------------------
# Modo sintetico
# --------------------------------------------------------------------------

def generar_mercado_sintetico(
    n_activos: int = 600,
    n_eras: int = 350,
    n_features: int = 50,
    n_features_utiles: int = 12,
    ic_objetivo: float = 0.05,
    n_regimenes: int = 3,
    seed: int | None = None,
) -> tuple[pd.DataFrame, list[str], dict]:
    """Genera un panel sintetico con propiedades de mercado.

    - Factores latentes con cargas persistentes por activo.
    - Premios de factor que cambian por regimen (lo que funciona deja de
      funcionar: penaliza el sobreajuste).
    - Volatilidad AR(1) en log (clustering) y ruido t-Student df=4 (colas).
    - `ic_objetivo` fija cuanta señal real hay: controla la dificultad.
    - Features "trampa" (ruido puro) indistinguibles de las utiles.
    """
    rng = np.random.default_rng(seed)

    cargas = rng.normal(size=(n_activos, N_FACTORES))
    premios = rng.normal(scale=1.0, size=(n_regimenes, N_FACTORES))

    regimen = np.empty(n_eras, dtype=int)
    regimen[0] = rng.integers(n_regimenes)
    for t in range(1, n_eras):
        regimen[t] = (
            regimen[t - 1]
            if rng.random() < P_PERSISTENCIA_REGIMEN
            else rng.integers(n_regimenes)
        )

    log_vol = np.zeros(n_eras)
    for t in range(1, n_eras):
        log_vol[t] = 0.95 * log_vol[t - 1] + rng.normal(scale=0.15)
    vol = np.exp(log_vol) * 0.02

    n_utiles = min(n_features_utiles, n_features)
    mapa = rng.integers(0, N_FACTORES, size=n_utiles)
    ruido_obs = rng.uniform(0.8, 2.5, size=n_utiles)

    filas = []
    for t in range(n_eras):
        senal = cargas @ premios[regimen[t]]
        senal = (senal - senal.mean()) / (senal.std() + 1e-9)

        idio = rng.standard_t(df=4, size=n_activos)
        idio = idio / np.sqrt(4 / (4 - 2))

        w = ic_objetivo
        target = (w * senal + np.sqrt(max(0.0, 1 - w**2)) * idio) * vol[t]

        fila = {"era_idx": t, "activo_idx": np.arange(n_activos)}
        for k in range(n_utiles):
            fila[f"u{k}"] = cargas[:, mapa[k]] + rng.normal(
                scale=ruido_obs[k], size=n_activos
            )
        for k in range(n_features - n_utiles):
            fila[f"n{k}"] = rng.normal(size=n_activos)
        fila["target_raw"] = target
        filas.append(pd.DataFrame(fila))

    panel = pd.concat(filas, ignore_index=True)
    cols = [c for c in panel.columns if c[0] in "un" and c not in ("era_idx",)]
    meta = {
        "modo": "sintetico",
        "regimen": regimen.tolist(),
        "n_regimenes_vistos": int(len(set(regimen.tolist()))),
        "n_cambios_regimen": int((np.diff(regimen) != 0).sum()),
        "ic_objetivo": ic_objetivo,
        "n_features_utiles": n_utiles,
    }
    return panel, cols, meta


# --------------------------------------------------------------------------
# Modo real (datos de mercado obfuscados)
# --------------------------------------------------------------------------

def generar_panel_real(
    universo: list[tuple[str, str]],
    dias: int = 900,
    timeframe: str = "1d",
    *,
    fin=None,
    ini=None,
    keep_unlabeled: bool = False,
    strict_universe: bool = False,
) -> tuple[pd.DataFrame, list[str], dict]:
    """Panel derivado de datos REALES, con las fugas ya cerradas.

    Cierra los 4 vectores de de-anonimizacion detectados:
      - calendario COMUN (mismos dias para todos): sin huecos de fin de
        semana que delaten cripto vs accion.
      - solo fechas con el universo COMPLETO: nº de filas por era constante.
      - normalizacion por era (en `obfuscar`): la escala no delata la clase.
      - eras permutadas (en `obfuscar`): el numero no revela el orden.

    Reproducibilidad: `fin`/`ini` fijan la ventana (por defecto, últimos
    `dias` hasta ahora). Para pinnear una versión exacta del dataset, pasar
    `fin`/`ini` explícitos + leer desde el caché de Storage (que evita
    re-descargar Binance/yfinance): mismos bytes cacheados => misma versión.
    """
    from datetime import datetime, timedelta, timezone

    import data_feed

    _fin = pd.Timestamp(fin) if fin is not None else datetime.now(timezone.utc)
    if getattr(_fin, "tzinfo", None) is None:
        _fin = pd.Timestamp(_fin).tz_localize("UTC")
    if ini is not None:
        _ini = pd.Timestamp(ini)
        if getattr(_ini, "tzinfo", None) is None:
            _ini = pd.Timestamp(_ini).tz_localize("UTC")
    else:
        _ini = _fin - timedelta(days=dias)
    fin, ini = _fin, _ini

    series: dict[str, pd.DataFrame] = {}
    asset_types: dict[str, str] = {}
    for asset_type, symbol in universo:
        try:
            df = data_feed.get_ohlcv(
                asset_type, symbol, timeframe, ini, fin,
                adjusted_close=asset_type in ("stock", "etf"),
            )
            df = df[["close", "volume"]].copy()
            idx = pd.to_datetime(df.index)
            # Cripto llega tz-aware y las acciones tz-naive: normalizar o
            # concat revienta con "Cannot compare tz-naive and tz-aware".
            idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
            df.index = idx.normalize()
            if len(df) > 120:
                series[symbol] = df
                asset_types[symbol] = asset_type
        except Exception as e:  # noqa: BLE001 - un activo caido no rompe la ronda
            logger.warning(f"[dataset] {symbol} descartado: {e}")

    if strict_universe and len(series) != len(universo):
        raise ValueError("Faltan activos del universo configurado")
    if len(series) < 2:
        raise ValueError("Universo insuficiente: menos de 2 activos con datos.")

    fechas_comunes = None
    for df in series.values():
        s = set(df.index)
        fechas_comunes = s if fechas_comunes is None else fechas_comunes.intersection(s)
    fechas_comunes = sorted(fechas_comunes)

    filas = []
    for i, (symbol, df) in enumerate(series.items()):
        g = df.loc[df.index.isin(fechas_comunes)].sort_index().copy()
        c = g["close"]
        up = c.diff().clip(lower=0).rolling(14).mean()
        dn = (-c.diff().clip(upper=0)).rolling(14).mean()
        g["u0"] = c.pct_change(5)
        g["u1"] = c.pct_change(20)
        g["u2"] = c.pct_change(60)
        g["u3"] = c.pct_change().rolling(20).std()
        g["u4"] = 100 - 100 / (1 + up / dn.replace(0, np.nan))
        g["u5"] = c / c.rolling(50).mean() - 1
        g["u6"] = g["volume"] / g["volume"].rolling(20).mean()
        g["u7"] = c.pct_change(10)
        g["u8"] = c / c.rolling(200).mean() - 1
        g["u9"] = c.pct_change().rolling(60).std()
        g["target_raw"] = c.pct_change(5).shift(-5)
        g["activo_idx"] = i
        filas.append(g.reset_index(names="fecha"))

    panel = pd.concat(filas, ignore_index=True)
    cols = [c for c in panel.columns if c.startswith("u")]

    # Solo fechas con el universo COMPLETO -> filas por era constantes.
    required = cols if keep_unlabeled else cols + ["target_raw"]
    completas = panel.dropna(subset=required).groupby("fecha").size()
    completas = completas[completas == len(series)].index
    panel = panel[panel["fecha"].isin(completas)].dropna(subset=required).copy()

    fechas = sorted(panel["fecha"].unique())
    panel["era_idx"] = panel["fecha"].map({f: i for i, f in enumerate(fechas)})
    if not keep_unlabeled:
        panel = panel.drop(columns=["fecha"])

    meta = {
        "modo": "real",
        "n_activos": len(series),
        "n_eras": len(fechas),
        "filas_por_era": int(len(series)),
        "asset_map": {
            i: {"asset_type": asset_types[symbol], "symbol": symbol}
            for i, symbol in enumerate(series)
        },
    }
    return panel, cols, meta


# --------------------------------------------------------------------------
# Obfuscacion (comun a ambos modos)
# --------------------------------------------------------------------------

def obfuscar(
    panel: pd.DataFrame,
    cols_feat: list[str],
    salt: str,
    n_bins: int = N_BINS,
    seed: int | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Convierte el panel en dataset publicable.

    Devuelve (publico, interno, mapeos):
      - publico: lo que descarga el participante (sin era_idx ni target del holdout)
      - interno: incluye era_idx -> SERVER-SIDE, para split temporal y scoring
      - mapeos: renombrado de features y etiquetas de era (nunca se publica)
    """
    rng = np.random.default_rng(seed)
    d = panel.copy()

    # Normalizacion POR ERA + binning: destruye escala y precio absoluto.
    def rank_bin(s: pd.Series) -> pd.Series:
        return np.floor(s.rank(pct=True) * n_bins).clip(0, n_bins - 1) / (n_bins - 1)

    for c in cols_feat:
        d[c] = d.groupby("era_idx")[c].transform(rank_bin)
    d["target"] = d.groupby("era_idx")["target_raw"].transform(rank_bin)

    # Eras permutadas: era_0001 NO es la mas antigua.
    eras = np.sort(d["era_idx"].unique())
    perm = rng.permutation(len(eras))
    mapa_eras = {int(e): f"era_{perm[i] + 1:04d}" for i, e in enumerate(eras)}
    d["era"] = d["era_idx"].map(mapa_eras)

    # Features renombradas en orden aleatorio: utiles y trampa indistinguibles.
    orden = list(cols_feat)
    rng.shuffle(orden)
    ren = {c: f"feature_{i + 1:02d}" for i, c in enumerate(orden)}
    feat_pub = [ren[c] for c in orden]

    # id irreversible sin la sal (server-side).
    d["id"] = [
        hashlib.sha256(f"{salt}|{e}|{a}".encode()).hexdigest()[:16]
        for e, a in zip(d["era"], d["activo_idx"])
    ]

    d = d.rename(columns=ren)
    publico = d[["id", "era"] + feat_pub + ["target"]].sample(
        frac=1, random_state=1
    ).reset_index(drop=True)
    interno = d[["id", "era", "era_idx"] + feat_pub + ["target"]].copy()

    return publico, interno, {"features": ren, "eras": mapa_eras, "feat_cols": feat_pub}


def partir(interno: pd.DataFrame, pct_train=0.6, pct_val=0.2,
           purge_eras: int = 0) -> dict:
    """Split TEMPORAL por era_idx (no por etiqueta, que esta permutada).

    `purge_eras` elimina las últimas etiquetas de train y validation cuyos
    retornos futuros podrían alcanzar la partición siguiente.
    """
    n = int(interno["era_idx"].max()) + 1
    lim_tr = int(n * pct_train)
    lim_va = int(n * (pct_train + pct_val))
    if purge_eras < 0 or lim_tr <= purge_eras or lim_va - lim_tr <= purge_eras:
        raise ValueError("purge_eras deja train o validation sin datos")
    return {
        "train": interno[interno["era_idx"] < lim_tr - purge_eras],
        "validation": interno[
            (interno["era_idx"] >= lim_tr) & (interno["era_idx"] < lim_va - purge_eras)
        ],
        "live": interno[interno["era_idx"] >= lim_va],
    }
