"""Tests de integración de la capa de datos REAL (requieren conexión a internet).

Binance (crypto) y Yahoo Finance / yfinance (stock) se consultan en vivo.
Si la red del entorno no es accesible, los tests fallan explícitamente
(con el error real) en lugar de inventar resultados.
"""
import math

import pandas as pd
import pytest

from data_feed import get_ohlcv


def _check_ohlcv(df, min_rows=1):
    assert isinstance(df, pd.DataFrame), "no devolvió un DataFrame"
    assert not df.empty, "DataFrame vacío"
    assert len(df) >= min_rows, f"filas insuficientes: {len(df)}"
    for col in ["open", "high", "low", "close", "volume"]:
        assert col in df.columns, f"falta columna '{col}'"
    assert isinstance(df.index, pd.DatetimeIndex), "el índice no es DatetimeIndex"
    assert (df["close"] > 0).all(), "hay precios close <= 0"


@pytest.mark.external
def test_crypto_binance_btc_real():
    df = get_ohlcv("crypto", "BTCUSDT", "1d", "2023-01-01", "2023-01-10", use_cache=False)
    _check_ohlcv(df, min_rows=5)
    # Enero 2023: BTC cotizaba muy por debajo de 100k.
    assert df["close"].max() < 100_000
    assert df["close"].min() > 1000


@pytest.mark.external
def test_crypto_symbol_normalization():
    # 'BTC' debe normalizarse a 'BTCUSDT' y traer datos reales.
    df = get_ohlcv("crypto", "btc", "1d", "2023-01-01", "2023-01-05", use_cache=False)
    _check_ohlcv(df, min_rows=2)


@pytest.mark.external
def test_stock_yfinance_aapl_real():
    df = get_ohlcv("stock", "AAPL", "1d", "2023-01-01", "2023-01-10", use_cache=False)
    _check_ohlcv(df, min_rows=3)
    # AAPL en enero 2023 cotizaba entre ~100 y ~200 USD.
    assert df["close"].mean() > 100, "precio AAPL fuera de rango realista (muy bajo)"
    assert df["close"].mean() < 300, "precio AAPL fuera de rango realista (muy alto)"
    # Las fechas deben caer en enero 2023.
    assert (df.index.year == 2023).all()
    assert (df.index.month == 1).all()


@pytest.mark.external
def test_invalid_crypto_symbol_raises():
    with pytest.raises(ValueError) as exc:
        get_ohlcv("crypto", "ZZZTOPUSDT", "1d", "2023-01-01", "2023-01-10", use_cache=False)
    assert "Binance" in str(exc.value) or "ZZZTOP" in str(exc.value)


def test_invalid_asset_type_raises():
    with pytest.raises(ValueError):
        get_ohlcv("commodity", "GOLD", "1d", "2023-01-01", "2023-01-10", use_cache=False)
