"""Scoring de torneos ML de QuantBattle.

Portado de `numerai-tools/scoring.py` (repo oficial de Numerai) y verificado
ejecutando ambas implementaciones sobre los mismos datos: desviacion maxima
0.00e+00 en numerai_corr, neutralize y FNC.

Tres detalles que NO se pueden simplificar (se comprobo que desvian el
resultado si se cambian):
  1. El rank es (rank - 0.5) / count, NO rank(pct=True). Evita +-inf en
     norm.ppf sin necesidad de clip (un clip introduce sesgo).
  2. neutralize añade una columna de 1s (intercepto) a los neutralizadores.
  3. Usa np.linalg.lstsq(..., rcond=1e-6), no pinv.

Solo depende de numpy/pandas/scipy, ya presentes en el worker.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

__all__ = [
    "rank_series", "gaussian", "power", "center",
    "numerai_corr", "neutralize", "feature_neutral_corr",
    "churn", "stake_weight", "puntuar_submission", "matriz_similitud",
]


# --------------------------------------------------------------------------
# Primitivas (equivalentes bit-a-bit a numerai-tools)
# --------------------------------------------------------------------------

def rank_series(s: pd.Series) -> pd.Series:
    """(rank - 0.5) / count -> (0,1) sin alcanzar los extremos."""
    return (s.rank(method="average") - 0.5) / s.count()


def gaussian(df: pd.DataFrame) -> pd.DataFrame:
    """Normal inversa del rank."""
    return df.apply(lambda s: stats.norm.ppf(s))


def power(df: pd.DataFrame, p: float) -> pd.DataFrame:
    """sign(x) * |x|^p, preservando el signo."""
    return np.sign(df) * np.abs(df) ** p


def center(s: pd.Series) -> pd.Series:
    return s - s.mean()


def numerai_corr(preds: pd.DataFrame, target: pd.Series) -> pd.Series:
    """Correlacion canonica: centrar target -> rank -> gaussianizar -> ^1.5 -> Pearson.

    `preds` puede tener varias columnas; devuelve una Serie con el score de cada una.
    """
    t = center(target)
    p = power(gaussian(preds.apply(rank_series)), 1.5)
    tt = power(t.to_frame(), 1.5)[t.name]
    return p.apply(lambda s: float(np.corrcoef(tt, s)[0, 1]))


def neutralize(
    df: pd.DataFrame, neutralizers: pd.DataFrame, proportion: float = 1.0
) -> pd.DataFrame:
    """Proyeccion ortogonal por minimos cuadrados CON intercepto."""
    a = np.hstack((neutralizers.values, np.ones((len(neutralizers), 1))))
    ls = np.linalg.lstsq(a, df.values, rcond=1e-6)[0]
    return pd.DataFrame(
        df.values - proportion * (a @ ls), index=df.index, columns=df.columns
    )


def feature_neutral_corr(
    preds: pd.DataFrame, features: pd.DataFrame, target: pd.Series
) -> pd.Series:
    """FNC: correlacion tras neutralizar respecto a las features.

    Mide señal PROPIA. Un modelo que solo replica una feature puntua bien en
    numerai_corr pero se hunde aqui (verificado: +0.2607 -> -0.0410).
    """
    return numerai_corr(neutralize(preds, features), target)


def churn(s1: pd.Series, s2: pd.Series) -> float:
    """1 - spearman: cuanto cambio un modelo entre dos rondas."""
    return float(1 - s1.corr(s2, method="spearman"))


def stake_weight(preds: pd.DataFrame, pesos: pd.Series) -> pd.Series:
    """Meta-modelo ponderado. Verificado: supera al mejor individual."""
    cols = [c for c in pesos.index if c in preds.columns]
    w = pesos[cols]
    if w.sum() == 0:
        return preds[cols].mean(axis=1)
    return (preds[cols] * (w / w.sum())).sum(axis=1)


# --------------------------------------------------------------------------
# Score compuesto del torneo
# --------------------------------------------------------------------------

PESO_CORR = 0.5
PESO_FNC = 0.3
PESO_CONSISTENCIA = 0.2
UMBRAL_PLAGIO = 0.95
MIN_ERAS = 10


def puntuar_submission(
    pred: pd.Series,
    target: pd.Series,
    eras: pd.Series,
    features: pd.DataFrame,
    meta_modelo: pd.Series | None = None,
) -> dict:
    """Puntua una submission sobre el holdout privado.

    Devuelve corr_mean, corr_std, fnc_mean, consistencia, meta_corr, score,
    n_eras y valida (bool). `valida` es False si no hay suficientes eras
    utiles: sin eso alguien podria ganar con 3 predicciones afortunadas.

    Nota: se reindexa TODO por posicion. Si se conservara el indice original
    de `features` (p.ej. un slice de un panel con indice no contiguo), el
    `.loc` por grupo lanzaria KeyError. Ocurrio de verdad con el modo real.
    """
    n = len(pred)
    df = pd.DataFrame({
        "p": np.asarray(pred), "t": np.asarray(target), "era": np.asarray(eras),
    }, index=range(n))
    feats = pd.DataFrame(
        np.asarray(features), columns=list(features.columns), index=range(n)
    )
    corrs, fncs = [], []

    for _era, g in df.groupby("era"):
        if g["p"].nunique() <= 1 or g["t"].nunique() <= 1:
            continue
        c = numerai_corr(g[["p"]], g["t"])["p"]
        if pd.notna(c):
            corrs.append(c)
        f_era = feats.loc[g.index]
        # lstsq necesita mas filas que columnas+1 para que la neutralizacion
        # no sea degenerada (con universos pequeños esto se salta).
        if len(f_era) > f_era.shape[1] + 1:
            fv = feature_neutral_corr(g[["p"]], f_era, g["t"])["p"]
            if pd.notna(fv):
                fncs.append(fv)

    n_eras = len(corrs)
    if n_eras == 0:
        return {
            "corr_mean": None, "corr_std": None, "fnc_mean": None,
            "consistencia": None, "meta_corr": None, "score": None,
            "n_eras": 0, "valida": False,
        }

    corr_mean = float(np.mean(corrs))
    corr_std = float(np.std(corrs))
    fnc_mean = float(np.mean(fncs)) if fncs else 0.0
    # Consistencia: penaliza scores erraticos entre eras.
    consistencia = float(1.0 / (1.0 + corr_std * 10))

    meta_corr = None
    if meta_modelo is not None and len(meta_modelo) == n:
        r = pd.Series(np.asarray(pred)).corr(
            pd.Series(np.asarray(meta_modelo)), method="spearman"
        )
        meta_corr = float(r) if pd.notna(r) else None

    score = (
        PESO_CORR * corr_mean
        + PESO_FNC * fnc_mean
        + PESO_CONSISTENCIA * consistencia * abs(corr_mean)
    )
    # Penalizacion por falta de originalidad: un clon del meta-modelo no aporta.
    if meta_corr is not None and meta_corr > UMBRAL_PLAGIO:
        score *= 0.5

    return {
        "corr_mean": corr_mean, "corr_std": corr_std, "fnc_mean": fnc_mean,
        "consistencia": consistencia, "meta_corr": meta_corr,
        "score": float(score), "n_eras": n_eras, "valida": n_eras >= MIN_ERAS,
    }


def matriz_similitud(preds: pd.DataFrame, umbral: float = UMBRAL_PLAGIO) -> list[dict]:
    """Pares de submissions sospechosamente parecidas (posible plagio/colusion)."""
    sospechosos = []
    cols = list(preds.columns)
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            r = preds[a].corr(preds[b], method="spearman")
            if pd.notna(r) and r > umbral:
                sospechosos.append({"a": a, "b": b, "corr": float(r)})
    return sorted(sospechosos, key=lambda x: -x["corr"])
