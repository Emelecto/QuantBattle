"""Capa de datos REALES para QuantLab worker.

Descarga series OHLCV reales desde fuentes públicas:
  - crypto: Binance public REST klines (sin API key).
    Las rondas ML fuerzan Binance Vision y solo consumen Spot 1d.
  - stock: Yahoo Finance vía yfinance.

Toda función devuelve un pandas.DataFrame con columnas
[open, high, low, close, volume] y un DatetimeIndex (nombre 'timestamp').
No se generan datos simulados bajo ninguna circunstancia: si la fuente
no responde o el símbolo no existe, se lanza una excepción clara.

CACHE (opcional, best-effort):
  get_ohlcv(..., use_cache=True) intenta primero leer desde Supabase Storage
  (bucket 'market-data', ruta '{asset_type}/{symbol}/{timeframe}.parquet';
  Binance Vision añade un sufijo de proveedor para aislar las cachés).
  Si el archivo existe y cubre el rango pedido, lo devuelve sin tocar la API.
  Si no, descarga de la fuente en vivo y (opcionalmente) escribe a cache.
  Cualquier fallo de cache es SILENCIOSO y cae siempre a la descarga directa,
  de modo que el comportamiento de red nunca se rompe por culpa del cache.

RESILIENCIA:
  - Lecturas de red (Binance/Bybit/yfinance) y operaciones de cache usan
    reintento con backoff exponencial + jitter. Los errores deterministas
    (símbolo inexistente HTTP 400, columnas faltantes) NO se reintentan.
  - Cada objeto de cache lleva un sidecar '<ruta>.sha256'; si el checksum no
    coincide, el cache se trata como MISS y se descarga en vivo.
"""
from __future__ import annotations

import hashlib
import io
import logging
import os
import random
import threading
import time
from datetime import datetime, timezone
from typing import Union

import pandas as pd
import requests

try:  # yfinance es pesado; lo importamos de forma diferida en get_ohlcv.
    import yfinance as yf
except Exception:  # pragma: no cover - sólo para entornos sin yfinance
    yf = None

# ¿pyarrow disponible? Si no, el cache usa JSON en lugar de Parquet.
try:
    import pyarrow  # noqa: F401

    _HAS_PARQUET = True
except Exception:  # pragma: no cover
    _HAS_PARQUET = False

BINANCE_KLINES = "https://api.binance.com/api/v3/klines"
BINANCE_VISION_KLINES = "https://data-api.binance.vision/api/v3/klines"
BINANCE_VISION_EXCHANGE_INFO = "https://data-api.binance.vision/api/v3/exchangeInfo"
_BINANCE_LIMIT = 1000  # máximo por petición según API de Binance
_REQUEST_TIMEOUT = 30

# Bybit v5 (fuente alternativa de crypto, sin geo-bloqueo de EE.UU.)
BYBIT_KLINES = "https://api.bybit.com/v5/market/kline"
_BYBIT_LIMIT = 1000

# Orden de fuentes crypto: Bybit primero (sin 451), Binance como fallback.
_CRYPTO_SOURCES = ("bybit", "binance")

# Bucket de Supabase Storage donde se guarda el cache de mercado.
_CACHE_BUCKET = "market-data"

logger = logging.getLogger(__name__)

# Mapeo timeframe -> intervalo de Binance (soportados por la API).
_BINANCE_INTERVALS = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "8h": "8h", "12h": "12h",
    "1d": "1d", "3d": "3d", "1w": "1w", "1M": "1M",
}

# Cliente Supabase cacheado en memoria (lazy). None = sin credenciales/indisponible.
_CACHE_CLIENT = None

# El scheduler puede solicitar un universo completo de acciones. Yahoo
# Finance limita ráfagas de consultas desde IPs compartidas; el intervalo se
# configura solo en ese job, para no hacer más lentos los backtests normales.
_YF_REQUEST_LOCK = threading.Lock()
_YF_LAST_REQUEST_AT = 0.0

# Reintento con backoff exponencial + jitter (solo errores transitorios).
_RETRY_ATTEMPTS = 4
_RETRY_BASE_DELAY = 0.5
_CACHE_RETRY_ATTEMPTS = 3
_SIDECAR_SUFFIX = ".sha256"


def _with_retry(fn, *, op: str, attempts: int = _RETRY_ATTEMPTS,
                base_delay: float = _RETRY_BASE_DELAY, should_retry=None):
    """Reintenta `fn()` ante errores transitorios; los ValueError (errores
    deterministas: símbolo inexistente, columnas faltantes) NO se reintentan."""
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except ValueError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt >= attempts or (should_retry is not None and not should_retry(exc)):
                break
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, base_delay)
            logger.warning("%s: intento %d/%d falló (%s); reintento en %.2fs",
                           op, attempt, attempts, exc, delay)
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def _storage_status_code(exc: Exception) -> int | None:
    """Extrae el status HTTP de errores de Storage de Supabase."""
    for candidate in (getattr(exc, "status", None),
                      getattr(exc, "status_code", None),
                      getattr(exc, "statusCode", None)):
        try:
            if candidate is not None:
                return int(candidate)
        except (TypeError, ValueError):
            continue
    response = getattr(exc, "response", None)
    try:
        return int(response.status_code) if response is not None else None
    except (AttributeError, TypeError, ValueError):
        return None


def _retry_cache_error(exc: Exception) -> bool:
    """Reintenta errores de red y HTTP transitorios, no rechazos deterministas."""
    status = _storage_status_code(exc)
    return status is None or _is_retryable_http(status)


def _is_retryable_http(status: int | None) -> bool:
    """HTTP 429 y 5xx son transitorios; 400/404 son deterministas."""
    return status == 429 or (isinstance(status, int) and 500 <= status < 600)


def _http_get(url: str, params: dict, op: str):
    """GET con reintento ante fallos de red y HTTP transitorios (429/5xx)."""

    def _do():
        resp = requests.get(url, params=params, timeout=_REQUEST_TIMEOUT)
        if _is_retryable_http(resp.status_code):
            raise requests.HTTPError(f"{op}: HTTP {resp.status_code} transitorio")
        return resp

    return _with_retry(_do, op=op)


# ---------------------------------------------------------------------------
# Cache en Supabase Storage (best-effort, no bloquea la descarga directa)
# ---------------------------------------------------------------------------
def cache_file_ext() -> str:
    """Extensión del archivo de cache según la disponibilidad de pyarrow."""
    return ".parquet" if _HAS_PARQUET else ".json"


def _cache_path(
    asset_type: str, symbol: str, timeframe: str, *, adjusted_close: bool = False,
    source: str | None = None,
) -> str:
    """Ruta privada separada para cada símbolo, intervalo y ajuste de cierre."""
    asset_type = (asset_type or "").lower()
    sym = (symbol or "").strip().upper()
    adjusted_suffix = "-adjusted" if adjusted_close else ""
    source_suffix = "-binance-vision" if source == "binance_vision" else ""
    return f"{asset_type}/{sym}/{timeframe}{adjusted_suffix}{source_suffix}{cache_file_ext()}"


def _cache_client():
    """Devuelve un cliente de Supabase o None si no hay credenciales/disponible.

    Lee SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY desde el entorno (.env cargado
    por python-dotenv si existe). Nunca lanza; en fallo devuelve None para que
    el llamador caiga a la descarga directa.
    """
    global _CACHE_CLIENT
    if _CACHE_CLIENT is not None:
        return _CACHE_CLIENT
    try:
        from dotenv import load_dotenv
        from supabase import create_client

        load_dotenv()  # no-op si no hay .env
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            logger.warning("Cache Supabase desactivado: faltan SUPABASE_URL/KEY.")
            _CACHE_CLIENT = False  # marca negativa para no reintentar
            return None
        _CACHE_CLIENT = create_client(url, key)
    except Exception as exc:  # pragma: no cover - entorno sin supabase
        logger.warning("No se pudo inicializar el cliente Supabase: %s", exc)
        _CACHE_CLIENT = False
        return None
    return _CACHE_CLIENT


def ensure_cache_bucket() -> bool:
    """Crea el bucket 'market-data' (privado) si no existe. Idempotente."""
    client = _cache_client()
    if client is None:
        return False
    try:
        client.storage.create_bucket(_CACHE_BUCKET, options={"public": False})
        logger.info("Bucket '%s' listo (privado).", _CACHE_BUCKET)
    except Exception as exc:
        # Ya existe o no hay permiso para crearlo; lo ignoramos.
        logger.info("Bucket '%s' ya existente o sin permiso de creación: %s",
                    _CACHE_BUCKET, exc)
    return True


def _df_to_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    if _HAS_PARQUET:
        df.to_parquet(buf)
    else:
        # JSON: serializamos el índice 'timestamp' como columna ISO.
        tmp = df.reset_index()
        tmp.to_json(buf, orient="records", date_format="iso")
    return buf.getvalue()


def _df_from_bytes(data: bytes, path: str) -> pd.DataFrame:
    if path.endswith(".parquet"):
        df = pd.read_parquet(io.BytesIO(data))
    else:
        tmp = pd.read_json(io.BytesIO(data), orient="records")
        tmp["timestamp"] = pd.to_datetime(tmp["timestamp"])
        tmp = tmp.set_index("timestamp")
    df.index.name = "timestamp"
    return df


def _as_utc(value: Union[str, datetime, pd.Timestamp]) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts


def read_from_cache(
    asset_type: str,
    symbol: str,
    timeframe: str,
    start: Union[str, datetime, pd.Timestamp],
    end: Union[str, datetime, pd.Timestamp],
    *,
    adjusted_close: bool = False,
    source: str | None = None,
) -> Union[pd.DataFrame, None]:
    """Lee desde Supabase Storage si el archivo cubre el rango solicitado.

    Devuelve el DataFrame recortado al rango, o None si no aplica.
    Cualquier fallo (red, credenciales, archivo ausente) -> None.
    """
    client = _cache_client()
    if client is None:
        return None
    path = _cache_path(
        asset_type, symbol, timeframe, adjusted_close=adjusted_close, source=source,
    )
    try:
        data = _with_retry(
            lambda: client.storage.from_(_CACHE_BUCKET).download(path),
            op=f"cache read {path}", attempts=_CACHE_RETRY_ATTEMPTS,
            should_retry=_retry_cache_error,
        )
    except Exception as exc:
        logger.info("Cache miss para %s: %s", path, exc)
        return None
    # Verificar checksum contra el sidecar (si existe; los caches viejos no lo
    # tienen y se aceptan por compatibilidad). Mismatch -> MISS.
    try:
        sidecar = client.storage.from_(_CACHE_BUCKET).download(path + _SIDECAR_SUFFIX)
        expected = sidecar.decode("utf-8").strip() if isinstance(sidecar, (bytes, bytearray)) else str(sidecar).strip()
        if expected and hashlib.sha256(data).hexdigest() != expected:
            logger.warning("Cache corrupto para %s (checksum no coincide); se ignora.", path)
            return None
    except Exception:
        pass  # sin sidecar: se acepta el cache (compatibilidad hacia atrás)
    try:
        df = _df_from_bytes(data, path)
    except Exception as exc:
        logger.warning("Cache ilegible para %s: %s", path, exc)
        return None
    # Normaliza el índice a UTC para comparar rangos de forma uniforme.
    idx = df.index
    if getattr(idx, "tz", None) is None:
        idx = idx.tz_localize("UTC")
        df = df.copy()
        df.index = idx
    s = _as_utc(start)
    e = _as_utc(end)
    covers_end = idx.max() >= e
    if source == "binance_vision" and timeframe == "1d":
        # Binance Vision bars are indexed by their UTC open date. The latest
        # complete candle is therefore yesterday's index at any time today.
        covers_end = idx.max().normalize() >= e.normalize() - pd.Timedelta(days=1)
    if adjusted_close and asset_type.lower() in ("stock", "etf") and timeframe == "1d":
        # Las barras diarias se indexan a medianoche y la fecha `end` suele
        # ser la hora actual. Acepta el último cierre de mercado reciente
        # (hasta 5 días) para que los jobs del domingo reutilicen el cierre
        # del viernes; una caché de la semana anterior sigue siendo MISS.
        covers_end = idx.max().normalize() >= e.normalize() - pd.Timedelta(days=5)
    if idx.min() <= s and covers_end:
        if source == "binance_vision":
            return df.loc[(df.index >= s) & (df.index < e)]
        return df.loc[s:e]
    logger.info("Cache %s no cubre el rango pedido; se descarga en vivo.", path)
    return None


def write_to_cache(
    asset_type: str,
    symbol: str,
    timeframe: str,
    df: pd.DataFrame,
    *,
    adjusted_close: bool = False,
    source: str | None = None,
) -> bool:
    """Escribe el DataFrame completo al bucket de Supabase Storage (upsert)."""
    client = _cache_client()
    if client is None:
        return False
    path = _cache_path(
        asset_type, symbol, timeframe, adjusted_close=adjusted_close, source=source,
    )
    data = _df_to_bytes(df)
    digest = hashlib.sha256(data).hexdigest()
    content_type = "application/octet-stream"
    try:
        _with_retry(
            lambda: client.storage.from_(_CACHE_BUCKET).upload(
                path,
                data,
                file_options={"upsert": "true", "content-type": content_type},
            ),
            op=f"cache write {path}", attempts=_CACHE_RETRY_ATTEMPTS,
            should_retry=_retry_cache_error,
        )
        logger.info("Cache escrito: %s (%d bytes).", path, len(data))
        try:  # sidecar de checksum (best-effort, nunca rompe el write)
            client.storage.from_(_CACHE_BUCKET).upload(
                path + _SIDECAR_SUFFIX,
                digest.encode("utf-8"),
                file_options={"upsert": "true", "content-type": "text/plain"},
            )
        except Exception as exc:
            logger.debug("sidecar de cache no escrito %s: %s", path, exc)
        return True
    except Exception as exc:
        logger.warning("No se pudo escribir cache %s: %s", path, exc)
        return False


# ---------------------------------------------------------------------------
# Descarga directa (red real)
# ---------------------------------------------------------------------------
def _normalize_symbol(asset_type: str, symbol: str) -> str:
    """Normaliza el símbolo.

    crypto: mayúsculas y se le añade 'USDT' si no lo trae ya (BTC -> BTCUSDT).
    stock : mayúsculas, tal cual.
    """
    symbol = (symbol or "").strip().upper()
    if asset_type == "crypto":
        if not symbol.endswith("USDT"):
            symbol = symbol + "USDT"
    return symbol


def _binance_interval(timeframe: str) -> str:
    return _BINANCE_INTERVALS.get(timeframe, "1d")


def _bybit_interval(timeframe: str) -> str:
    """Mapea timeframes de QuantLab a los códigos de Bybit v5.

    Bybit usa: 1 3 5 15 30 60 120 240 360 720 D W M (sin prefijo '1').
    """
    mapping = {
        "1m": "1", "5m": "5", "15m": "15", "30m": "30",
        "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
        "1d": "D", "3d": "D", "1w": "W", "1wk": "W", "1M": "M", "1mo": "M",
    }
    return mapping.get(timeframe, "D")


def _to_ms(value: Union[str, datetime, pd.Timestamp, int, float]) -> int:
    """Convierte fecha/hora a milisegundos epoch UTC."""
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        value = pd.Timestamp(value)
    if isinstance(value, pd.Timestamp):
        if value.tzinfo is None:
            value = value.tz_localize("UTC")
        return int(value.timestamp() * 1000)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    raise ValueError(f"Tipo de fecha no soportado: {type(value)}")


def _fetch_binance(
    symbol: str, interval: str, start_ms: int, end_ms: int, *,
    endpoint: str = BINANCE_KLINES, provider: str = "Binance",
) -> list:
    """Descarga klines de Binance paginando de 1000 en 1000 velas."""
    rows: list = []
    cursor = start_ms
    while True:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": cursor,
            "endTime": end_ms,
            "limit": _BINANCE_LIMIT,
        }
        try:
            resp = _http_get(endpoint, params=params, op=f"{provider} {symbol}")
        except requests.RequestException as exc:
            raise ValueError(
                f"{provider}: fallo de red al consultar '{symbol}' ({interval}): {exc}"
            ) from exc

        if resp.status_code != 200:
            # Binance responde 400 para símbolos inexistentes.
            msg = ""
            try:
                msg = resp.json().get("msg", "")
            except Exception:
                msg = resp.text
            raise ValueError(
                f"{provider}: no se pudo obtener '{symbol}' ({interval}). "
                f"HTTP {resp.status_code} - {msg}"
            )
        try:
            data = resp.json()
        except ValueError as exc:
            raise ValueError(
                f"{provider}: respuesta no JSON para '{symbol}': {resp.text[:200]}"
            ) from exc

        if not data:
            break
        rows.extend(data)
        if len(data) < _BINANCE_LIMIT:
            break
        last_open = int(data[-1][0])
        if last_open >= end_ms:
            break
        cursor = last_open + 1
        time.sleep(0.05)  # cortesía con la API pública
    return rows


def filter_binance_vision_spot_universe(universe: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Conserva pares USDT spot activos en Binance Vision."""
    try:
        response = _http_get(
            BINANCE_VISION_EXCHANGE_INFO, params={}, op="Binance Vision exchangeInfo",
        )
    except requests.RequestException as exc:
        raise ValueError(f"Binance Vision: fallo al consultar el universo spot: {exc}") from exc
    if response.status_code != 200:
        raise ValueError(
            f"Binance Vision: exchangeInfo respondió HTTP {response.status_code}."
        )
    try:
        payload = response.json()
        active = {
            item["symbol"] for item in payload.get("symbols", [])
            if item.get("status") == "TRADING"
            and item.get("quoteAsset") == "USDT"
            and item.get("isSpotTradingAllowed", True)
        }
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise ValueError("Binance Vision: exchangeInfo tiene un formato inválido.") from exc
    return [
        (asset_type, _normalize_symbol("crypto", symbol))
        for asset_type, symbol in universe
        if asset_type == "crypto" and _normalize_symbol("crypto", symbol) in active
    ]


def _fetch_bybit(symbol: str, interval: str, start_ms: int, end_ms: int) -> list:
    """Descarga klines de Bybit v5 (spot) paginando de 1000 en 1000.

    Respuesta: {"retCode": 0, "result": {"list": [[start, open, high, low,
    close, volume, turnover], ...]}} — la lista viene en orden DESCENDENTE.
    """
    rows: list = []
    cursor = end_ms  # Bybit pagina hacia atrás desde `end`
    while True:
        params = {
            "category": "spot",
            "symbol": symbol,
            "interval": interval,
            "start": start_ms,
            "end": cursor,
            "limit": _BYBIT_LIMIT,
        }
        try:
            resp = _http_get(BYBIT_KLINES, params=params, op=f"Bybit {symbol}")
        except requests.RequestException as exc:
            raise ValueError(
                f"Bybit: fallo de red al consultar '{symbol}' ({interval}): {exc}"
            ) from exc

        if resp.status_code != 200:
            raise ValueError(
                f"Bybit: no se pudo obtener '{symbol}' ({interval}). "
                f"HTTP {resp.status_code} - {resp.text[:200]}"
            )
        try:
            payload = resp.json()
        except ValueError as exc:
            raise ValueError(
                f"Bybit: respuesta no JSON para '{symbol}': {resp.text[:200]}"
            ) from exc

        if payload.get("retCode") != 0:
            raise ValueError(
                f"Bybit: error {payload.get('retCode')} para '{symbol}': "
                f"{payload.get('retMsg', '')[:200]}"
            )

        batch = (payload.get("result") or {}).get("list") or []
        if not batch:
            break
        # Bybit devuelve [startMs, open, high, low, close, volume, turnover]
        # en orden descendente; normalizamos a ascendente como Binance.
        rows.extend(reversed(batch))
        oldest_open = int(batch[-1][0])
        if len(batch) < _BYBIT_LIMIT or oldest_open <= start_ms:
            break
        cursor = oldest_open
        time.sleep(0.05)

    return rows


def _rows_to_df(rows: list) -> pd.DataFrame:
    """Convierte filas kline (Binance/Bybit) a DataFrame OHLCV estándar."""
    df = pd.DataFrame(rows)
    idx = pd.to_datetime(df[0].astype(float), unit="ms", utc=True)
    out = pd.DataFrame(
        {
            "open": df[1].astype(float).values,
            "high": df[2].astype(float).values,
            "low": df[3].astype(float).values,
            "close": df[4].astype(float).values,
            "volume": df[5].astype(float).values,
        },
        index=idx,
    )
    out.index.name = "timestamp"
    return out.sort_index()


def _fetch_yfinance(symbol: str, interval: str, start, end) -> pd.DataFrame:
    if yf is None:
        raise ValueError(
            "yfinance no está instalado; no se pueden descargar datos de stock."
        )
    # yfinance sólo garantiza '1d' de forma fiable; forzamos 1d para stock.
    yf_interval = "1d" if interval not in ("1d", "1wk", "1mo") else interval
    try:
        min_interval = max(0.0, float(os.environ.get("YFINANCE_MIN_REQUEST_INTERVAL_SECONDS", "0")))
    except (TypeError, ValueError):
        min_interval = 0.0
    if min_interval:
        global _YF_LAST_REQUEST_AT
        with _YF_REQUEST_LOCK:
            wait = min_interval - (time.monotonic() - _YF_LAST_REQUEST_AT)
            if wait > 0:
                time.sleep(wait)
            _YF_LAST_REQUEST_AT = time.monotonic()
    try:
        df = _with_retry(
            lambda: yf.download(
                symbol,
                start=start,
                end=end,
                interval=yf_interval,
                auto_adjust=False,
                progress=False,
                threads=False,
            ),
            op=f"yfinance {symbol}",
        )
    except Exception as exc:  # yfinance lanza excepciones variadas en fallos de red
        raise ValueError(
            f"yfinance: fallo al descargar '{symbol}' ({yf_interval}): {exc}"
        ) from exc

    if df is None or df.empty:
        raise ValueError(
            f"yfinance: no se obtuvieron datos para '{symbol}'? Símbolo "
            f"inexistente o sin cotizaciones en el rango solicitado."
        )
    # yfinance 1.6+ devuelve MultiIndex (Price, Ticker); aplanamos al nivel campo.
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _download_live(
    asset_type: str,
    symbol: str,
    timeframe: str,
    start: Union[str, datetime, pd.Timestamp],
    end: Union[str, datetime, pd.Timestamp],
    adjusted_close: bool = False,
    source: str | None = None,
) -> pd.DataFrame:
    """Descarga OHLCV REALES desde la fuente (sin cache)."""
    asset_type = asset_type.lower()
    timeframe = timeframe or "1d"

    if source == "binance_vision":
        if asset_type != "crypto":
            raise ValueError("Binance Vision solo admite activos crypto spot.")
        if timeframe != "1d":
            raise ValueError("Binance Vision para torneos requiere velas diarias (1d).")
        sym = _normalize_symbol("crypto", symbol)
        start_ms = _to_ms(start)
        end_ms = _to_ms(end)
        rows = _fetch_binance(
            sym, "1d", start_ms, end_ms, endpoint=BINANCE_VISION_KLINES,
            provider="Binance Vision",
        )
        if not rows:
            raise ValueError(f"Binance Vision: no se obtuvieron velas para '{sym}'.")
        # Spot REST puede incluir la vela UTC aún abierta. Excluirla usando
        # close_time (campo 6) para impedir que el dataset use información parcial.
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        complete = [row for row in rows if int(row[6]) < now_ms]
        if not complete:
            raise ValueError(f"Binance Vision: no hay velas diarias cerradas para '{sym}'.")
        frame = _rows_to_df(complete)
        start_ts, end_ts = _as_utc(start), _as_utc(end)
        return frame.loc[(frame.index >= start_ts) & (frame.index < end_ts)]

    if asset_type == "crypto":
        sym = _normalize_symbol("crypto", symbol)
        interval = _binance_interval(timeframe)
        start_ms = _to_ms(start)
        end_ms = _to_ms(end)

        errors: list[str] = []
        last_rows: list = []
        for source in _CRYPTO_SOURCES:
            try:
                if source == "bybit":
                    rows = _fetch_bybit(sym, interval, start_ms, end_ms)
                    if not rows:
                        raise ValueError("sin velas en el rango pedido.")
                else:  # binance
                    rows = _fetch_binance(sym, interval, start_ms, end_ms)
                    if not rows:
                        raise ValueError("sin velas para el rango pedido.")
                last_rows = rows
                break  # esta fuente funcionó
            except ValueError as exc:
                errors.append(f"{source}: {exc}")
                continue

        if not last_rows:
            raise ValueError(
                f"No se pudo obtener '{sym}' ({interval}) de ninguna fuente. "
                + " | ".join(errors)
            )

        return _rows_to_df(last_rows)

    if asset_type == "stock":
        sym = _normalize_symbol("stock", symbol)
        raw = _fetch_yfinance(sym, timeframe, start, end)
        price_column = "Adj Close" if adjusted_close else "Close"
        wanted = ["Open", "High", "Low", price_column, "Volume"]
        missing = [c for c in wanted if c not in raw.columns]
        if missing:
            raise ValueError(
                f"yfinance: faltan columnas {missing} en la respuesta de '{sym}'."
            )
        out = pd.DataFrame(
            {
                "open": raw["Open"].astype(float),
                "high": raw["High"].astype(float),
                "low": raw["Low"].astype(float),
                "close": raw[price_column].astype(float),
                "volume": raw["Volume"].astype(float),
            }
        )
        out.index = pd.to_datetime(out.index)
        out.index.name = "timestamp"
        return out.sort_index()

    if asset_type == "etf":
        # Los ETFs cotizan en Yahoo igual que las acciones (SPY, QQQ, VTI...).
        sym = _normalize_symbol("stock", symbol)
        raw = _fetch_yfinance(sym, timeframe, start, end)
        price_column = "Adj Close" if adjusted_close else "Close"
        wanted = ["Open", "High", "Low", price_column, "Volume"]
        missing = [c for c in wanted if c not in raw.columns]
        if missing:
            raise ValueError(
                f"yfinance: faltan columnas {missing} en la respuesta de '{sym}'."
            )
        out = pd.DataFrame(
            {
                "open": raw["Open"].astype(float),
                "high": raw["High"].astype(float),
                "low": raw["Low"].astype(float),
                "close": raw[price_column].astype(float),
                "volume": raw["Volume"].astype(float),
            }
        )
        out.index = pd.to_datetime(out.index)
        out.index.name = "timestamp"
        return out.sort_index()

    raise ValueError(
        f"asset_type no soportado: '{asset_type}' (usa 'crypto', 'stock' o 'etf')."
    )


def get_ohlcv(
    asset_type: str,
    symbol: str,
    timeframe: str,
    start: Union[str, datetime, pd.Timestamp],
    end: Union[str, datetime, pd.Timestamp],
    use_cache: bool = True,
    adjusted_close: bool = False,
    source: str | None = None,
) -> pd.DataFrame:
    """Descarga OHLCV REALES, usando cache de Supabase Storage cuando es posible.

    Comportamiento:
      - Si use_cache=True (por defecto) y el archivo de cache existe y cubre el
        rango pedido, se devuelve desde Supabase Storage sin tocar la API.
      - Si no hay cache utilizable, se descarga de la fuente en vivo y (cuando
        use_cache=True) se escribe a cache para futuros requests.
      - Cualquier fallo del cache es silencioso y cae SIEMPRE a la descarga
        directa, de modo que la capa de datos nunca deja de funcionar.

    Devuelve DataFrame con columnas [open, high, low, close, volume] y
    DatetimeIndex (nombre 'timestamp'). Lanza ValueError si la fuente falla.
    """
    if use_cache:
        try:
            cached = read_from_cache(
                asset_type, symbol, timeframe, start, end,
                adjusted_close=adjusted_close, source=source,
            )
            if cached is not None:
                logger.info("get_ohlcv(%s,%s,%s): servido desde cache.",
                            asset_type, symbol, timeframe)
                return cached
        except Exception as exc:  # pragma: no cover - defensa adicional
            logger.warning("Cache read falló; descarga en vivo: %s", exc)

    df = _download_live(
        asset_type, symbol, timeframe, start, end,
        adjusted_close=adjusted_close, source=source,
    )

    if use_cache and df is not None and not df.empty:
        try:
            write_to_cache(
                asset_type, symbol, timeframe, df,
                adjusted_close=adjusted_close, source=source,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("Cache write falló: %s", exc)
    return df
