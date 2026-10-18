"""Tests del generador de datasets.

Lo critico aqui es la ANONIMIZACION: cada test corresponde a un vector de
de-anonimizacion que se comprobo explotable en un diseño ingenuo.
"""
import numpy as np
import pandas as pd
import pytest

import dataset_builder as db

SALT = "test-salt-no-produccion"


@pytest.fixture(scope="module")
def sintetico():
    panel, cols, meta = db.generar_mercado_sintetico(
        n_activos=120, n_eras=80, n_features=20, n_features_utiles=6,
        ic_objetivo=0.05, seed=7,
    )
    pub, interno, mapeos = db.obfuscar(panel, cols, salt=SALT, seed=7)
    return panel, cols, meta, pub, interno, mapeos


def test_estructura_del_panel(sintetico):
    panel, cols, meta, pub, interno, mapeos = sintetico
    assert len(panel) == 120 * 80
    assert len(cols) == 20
    assert meta["modo"] == "sintetico"
    assert "target_raw" in panel.columns


def test_regimenes_se_recorren(sintetico):
    """p_stay=0.90: la cadena debe visitar los 3 regimenes y cambiar varias veces."""
    _, _, meta, *_ = sintetico
    assert meta["n_regimenes_vistos"] >= 2
    assert meta["n_cambios_regimen"] >= 3


# --- ANONIMIZACION: un test por vector de ataque -------------------------

def test_publico_no_expone_columnas_internas(sintetico):
    """Sin era_idx, activo_idx, target_raw ni fechas."""
    *_, pub, _, _ = sintetico
    prohibidas = {"era_idx", "activo_idx", "target_raw", "fecha", "date", "sym", "symbol"}
    assert not (set(pub.columns) & prohibidas)


def test_features_discretizadas(sintetico):
    """Solo N_BINS valores posibles: no se puede reconstruir el precio."""
    *_, pub, _, mapeos = sintetico
    feat = mapeos["feat_cols"]
    valores = pd.unique(pub[feat].values.ravel())
    assert len(valores) <= db.N_BINS
    assert pub[feat].min().min() >= 0.0
    assert pub[feat].max().max() <= 1.0


def test_eras_permutadas_no_revelan_orden(sintetico):
    """ATAQUE 1: era_0001 no debe ser la mas antigua."""
    *_, interno, _ = sintetico
    orden = interno.groupby("era")["era_idx"].first().sort_index()
    assert list(orden.values) != sorted(orden.values), "el orden temporal se filtra"


def test_filas_por_era_constantes(sintetico):
    """ATAQUE 4: una era con menos filas delataria un subconjunto de activos."""
    *_, pub, _, _ = sintetico
    tamanos = pub.groupby("era").size().unique()
    assert len(tamanos) == 1


def test_ids_unicos_y_opacos(sintetico):
    *_, pub, _, _ = sintetico
    assert pub["id"].is_unique
    assert pub["id"].str.len().nunique() == 1
    # No debe contener el indice de activo en claro
    assert not pub["id"].str.contains("_0_|_1_").any()


def test_id_depende_de_la_sal(sintetico):
    """Sin la sal (server-side) los ids no son reproducibles por el usuario."""
    panel, cols, *_ = sintetico
    a, _, _ = db.obfuscar(panel, cols, salt="sal-A", seed=7)
    b, _, _ = db.obfuscar(panel, cols, salt="sal-B", seed=7)
    assert set(a["id"]) != set(b["id"])


def test_nombres_de_features_no_distinguen_utiles(sintetico):
    """Las features trampa se renombran mezcladas con las utiles."""
    _, cols, _, _, _, mapeos = sintetico
    ren = mapeos["features"]
    utiles = [ren[c] for c in cols if c.startswith("u")]
    # Si el renombrado preservara el orden, todas las utiles serian las primeras.
    primeras = {f"feature_{i+1:02d}" for i in range(len(utiles))}
    assert set(utiles) != primeras


# --- SPLIT ---------------------------------------------------------------

def test_split_temporal_correcto(sintetico):
    *_, interno, _ = sintetico
    partes = db.partir(interno)
    assert set(partes) == {"train", "validation", "live"}
    max_tr = partes["train"]["era_idx"].max()
    min_va = partes["validation"]["era_idx"].min()
    max_va = partes["validation"]["era_idx"].max()
    min_li = partes["live"]["era_idx"].min()
    assert max_tr < min_va, "train se solapa con validation"
    assert max_va < min_li, "validation se solapa con live"


def test_split_purga_horizonte_futuro(sintetico):
    *_, interno, _ = sintetico
    partes = db.partir(interno, purge_eras=5)
    assert partes["train"]["era_idx"].max() + 5 < partes["validation"]["era_idx"].min()
    assert partes["validation"]["era_idx"].max() + 5 < partes["live"]["era_idx"].min()


def test_sin_solape_de_ids_entre_particiones(sintetico):
    *_, interno, _ = sintetico
    p = db.partir(interno)
    assert not (set(p["train"]["id"]) & set(p["live"]["id"]))


def test_reproducible_con_misma_semilla():
    a, ca, _ = db.generar_mercado_sintetico(
        n_activos=40, n_eras=15, n_features=8, n_features_utiles=3, seed=99)
    b, cb, _ = db.generar_mercado_sintetico(
        n_activos=40, n_eras=15, n_features=8, n_features_utiles=3, seed=99)
    assert a.equals(b)
    pa, _, _ = db.obfuscar(a, ca, salt=SALT, seed=99)
    pb, _, _ = db.obfuscar(b, cb, salt=SALT, seed=99)
    assert pa.equals(pb)


def test_semillas_distintas_dan_datasets_distintos():
    a, ca, _ = db.generar_mercado_sintetico(
        n_activos=40, n_eras=15, n_features=8, n_features_utiles=3, seed=1)
    b, cb, _ = db.generar_mercado_sintetico(
        n_activos=40, n_eras=15, n_features=8, n_features_utiles=3, seed=2)
    assert not a["target_raw"].equals(b["target_raw"])


def test_dataset_es_entrenable(sintetico):
    """El torneo debe ser GANABLE: un modelo simple debe batir al azar en live."""
    from sklearn.ensemble import HistGradientBoostingRegressor
    import scoring_ml as sc

    *_, interno, mapeos = sintetico
    feat = mapeos["feat_cols"]
    p = db.partir(interno)
    tr, live = p["train"], p["live"].copy()

    m = HistGradientBoostingRegressor(max_iter=120, learning_rate=0.08,
                                      max_depth=4, random_state=0)
    m.fit(tr[feat], tr["target"])
    live["pred"] = m.predict(live[feat])
    rng = np.random.default_rng(0)
    live["azar"] = rng.random(len(live))

    corr = sc.numerai_corr(live[["pred", "azar"]], live["target"])
    assert corr["pred"] > corr["azar"], "el dataset no es entrenable"


def test_ic_objetivo_controla_dificultad():
    """A mayor ic_objetivo, mas señal recuperable: permite calibrar el torneo."""
    import scoring_ml as sc

    res = {}
    for ic in (0.02, 0.15):
        panel, cols, _ = db.generar_mercado_sintetico(
            n_activos=200, n_eras=60, n_features=12, n_features_utiles=6,
            ic_objetivo=ic, seed=5,
        )
        _, interno, mapeos = db.obfuscar(panel, cols, salt=SALT, seed=5)
        feat = mapeos["feat_cols"]
        # Oraculo: usa las features utiles reales (cota superior de señal)
        interno = interno.copy()
        interno["oraculo"] = interno[feat].mean(axis=1)
        res[ic] = abs(sc.numerai_corr(interno[["oraculo"]], interno["target"])["oraculo"])
    assert res[0.15] > res[0.02], f"ic_objetivo no controla la dificultad: {res}"
