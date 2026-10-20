"""Tests de integración de la capa de datos REAL (requieren conexión a internet).

Binance (crypto) y Yahoo Finance / yfinance (stock) se consultan en vivo.
Si la red del entorno no es accesible, los tests fallan explícitamente
(con el error real) en lugar de inventar resultados.
"""
import math
from types import SimpleNamespace

import pandas as pd
import pytest

import data_feed
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


def test_adjusted_close_has_separate_cache_and_uses_it(monkeypatch):
    raw_path = data_feed._cache_path("stock", "AAPL", "1d")
    adjusted_path = data_feed._cache_path("stock", "AAPL", "1d", adjusted_close=True)
    assert raw_path != adjusted_path
    assert "adjusted" in adjusted_path

    cached = pd.DataFrame(
        {"open": [100.0], "high": [101.0], "low": [99.0], "close": [100.5], "volume": [10]},
        index=pd.DatetimeIndex(["2026-10-16"], name="timestamp", tz="UTC"),
    )
    seen = {}

    def read_cache(*args, **kwargs):
        seen["adjusted_close"] = kwargs.get("adjusted_close")
        return cached

    def unexpected_download(*_args, **_kwargs):
        raise AssertionError("la caché ajustada debería evitar otra descarga")

    monkeypatch.setattr(data_feed, "read_from_cache", read_cache)
    monkeypatch.setattr(data_feed, "_download_live", unexpected_download)
    result = get_ohlcv(
        "stock", "AAPL", "1d", "2026-10-15", "2026-10-18",
        adjusted_close=True,
    )
    assert seen["adjusted_close"] is True
    assert result.equals(cached)


def test_binance_vision_uses_isolated_cache_path():
    standard = data_feed._cache_path("crypto", "BTCUSDT", "1d")
    vision = data_feed._cache_path(
        "crypto", "BTCUSDT", "1d", source="binance_vision",
    )
    assert standard != vision
    assert "binance-vision" in vision


def test_binance_vision_requests_official_endpoint_and_drops_open_candle(monkeypatch):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    today = pd.Timestamp(now.date(), tz="UTC")
    yesterday = today - pd.Timedelta(days=1)
    rows = [
        [int(yesterday.timestamp() * 1000), "100", "103", "99", "102", "500",
         int(today.timestamp() * 1000) - 1],
        [int(today.timestamp() * 1000), "102", "104", "101", "103", "250",
         int((today + pd.Timedelta(days=1)).timestamp() * 1000) - 1],
    ]
    seen = {}

    def fetch(symbol, interval, start_ms, end_ms, **kwargs):
        seen.update(symbol=symbol, interval=interval, **kwargs)
        return rows

    monkeypatch.setattr(data_feed, "_fetch_binance", fetch)
    frame = data_feed._download_live(
        "crypto", "btc", "1d", yesterday, today + pd.Timedelta(days=1),
        source="binance_vision",
    )

    assert seen["symbol"] == "BTCUSDT"
    assert seen["endpoint"] == data_feed.BINANCE_VISION_KLINES
    assert seen["provider"] == "Binance Vision"
    assert len(frame) == 1
    assert frame.index[0] == yesterday


def test_binance_vision_rejects_non_spot_requests():
    with pytest.raises(ValueError, match="crypto spot"):
        data_feed._download_live(
            "stock", "AAPL", "1d", "2026-01-01", "2026-02-01",
            source="binance_vision",
        )
    with pytest.raises(ValueError, match="velas diarias"):
        data_feed._download_live(
            "crypto", "BTC", "1h", "2026-01-01", "2026-02-01",
            source="binance_vision",
        )


def test_binance_vision_universe_keeps_only_active_usdt_spot(monkeypatch):
    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"symbols": [
                {"symbol": "BTCUSDT", "status": "TRADING", "quoteAsset": "USDT", "isSpotTradingAllowed": True},
                {"symbol": "OLDUSDT", "status": "BREAK", "quoteAsset": "USDT", "isSpotTradingAllowed": True},
                {"symbol": "BTCUSD", "status": "TRADING", "quoteAsset": "USD", "isSpotTradingAllowed": True},
                {"symbol": "ETHUSDT", "status": "TRADING", "quoteAsset": "USDT", "isSpotTradingAllowed": False},
            ]}

    def get(url, *, params, op):
        assert url == data_feed.BINANCE_VISION_EXCHANGE_INFO
        assert params == {}
        assert op == "Binance Vision exchangeInfo"
        return Response()

    monkeypatch.setattr(data_feed, "_http_get", get)
    result = data_feed.filter_binance_vision_spot_universe([
        ("crypto", "BTC"), ("crypto", "OLDUSDT"), ("crypto", "BTCUSD"),
        ("crypto", "ETHUSDT"), ("stock", "AAPL"),
    ])
    assert result == [("crypto", "BTCUSDT")]


def test_adjusted_daily_cache_accepts_recent_market_close(monkeypatch):
    cached = pd.DataFrame(
        {"close": [99.0, 100.0, 101.0]},
        index=pd.DatetimeIndex(
            ["2026-10-14", "2026-10-15", "2026-10-16"],
            name="timestamp", tz="UTC",
        ),
    )

    class FakeStorage:
        def from_(self, _bucket):
            return self

        def download(self, path):
            if path.endswith(".sha256"):
                raise FileNotFoundError(path)
            return b"cached-parquet"

    class FakeClient:
        storage = FakeStorage()

    monkeypatch.setattr(data_feed, "_cache_client", lambda: FakeClient())
    monkeypatch.setattr(data_feed, "_df_from_bytes", lambda _data, _path: cached)

    sunday_close = data_feed.read_from_cache(
        "stock", "AAPL", "1d", "2026-10-14", "2026-10-18", adjusted_close=True,
    )
    stale_week = data_feed.read_from_cache(
        "stock", "AAPL", "1d", "2026-10-14", "2026-10-25", adjusted_close=True,
    )
    assert sunday_close is not None and sunday_close.index.max().day == 16
    assert stale_week is None


def test_missing_storage_cache_object_is_not_retried(monkeypatch):
    attempts = []

    class FakeStorage:
        def from_(self, _bucket):
            return self

        def download(self, path):
            attempts.append(path)
            error = RuntimeError("object not found")
            error.status = 404
            raise error

    class FakeClient:
        storage = FakeStorage()

    monkeypatch.setattr(data_feed, "_cache_client", lambda: FakeClient())
    result = data_feed.read_from_cache(
        "stock", "AAPL", "1d", "2026-10-14", "2026-10-18",
    )

    assert result is None
    assert len(attempts) == 1


def test_yfinance_honors_configured_request_interval(monkeypatch):
    sleeps = []

    class FakeYFinance:
        @staticmethod
        def download(*_args, **_kwargs):
            return pd.DataFrame({"Close": [100.0]})

    monkeypatch.setenv("YFINANCE_MIN_REQUEST_INTERVAL_SECONDS", "7")
    monkeypatch.setattr(data_feed, "yf", FakeYFinance)
    monkeypatch.setattr(data_feed, "_YF_LAST_REQUEST_AT", 100.0)
    monkeypatch.setattr(
        data_feed, "time",
        SimpleNamespace(monotonic=lambda: 103.0, sleep=sleeps.append),
    )

    result = data_feed._fetch_yfinance("AAPL", "1d", "2026-01-01", "2026-02-01")
    assert not result.empty
    assert sleeps == [4.0]
