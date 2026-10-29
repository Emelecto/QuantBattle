import Link from "next/link";
import "../library.css";

type Row = { date: string; open: number; high: number; low: number; close: number; volume: number };

interface DatasetMeta {
  id: string;
  name: string;
  symbol: string;
  source: "binance" | "yahoo";
  interval: "1d" | "1h" | "4h" | "1w";
  level: "beginner" | "advanced";
  assetClass: string;
  blurb: string;
  dateRange: string;
  frequency: string;
}

const MAP: Record<string, DatasetMeta> = {
  "btc-daily": { id: "btc-daily", name: "BTC/USD Diario", symbol: "BTCUSDT", source: "binance", interval: "1d", level: "beginner", assetClass: "Cripto", blurb: "Bitcoin en velas diarias. Datos reales desde Binance.", dateRange: "Tiempo real", frequency: "Diario" },
  "eth-daily": { id: "eth-daily", name: "ETH/USD Diario", symbol: "ETHUSDT", source: "binance", interval: "1d", level: "beginner", assetClass: "Cripto", blurb: "Ethereum diario. Datos reales desde Binance.", dateRange: "Tiempo real", frequency: "Diario" },
  "aapl-daily": { id: "aapl-daily", name: "AAPL Diario", symbol: "AAPL", source: "yahoo", interval: "1d", level: "beginner", assetClass: "Acciones", blurb: "Apple diario. Datos reales desde Yahoo Finance.", dateRange: "Tiempo real", frequency: "Diario" },
  "sp500-daily": { id: "sp500-daily", name: "S&P 500 (indice)", symbol: "^GSPC", source: "yahoo", interval: "1d", level: "advanced", assetClass: "Acciones", blurb: "Indice de referencia de EE.UU. Datos reales desde Yahoo Finance.", dateRange: "Tiempo real", frequency: "Diario" },
  "us-cpi-monthly": { id: "us-cpi-monthly", name: "IPC de EE.UU. Mensual", symbol: "CPI", source: "yahoo", interval: "1d", level: "advanced", assetClass: "Macro", blurb: "Inflacion mensual. Datos reales desde Yahoo Finance (proxy macro).", dateRange: "Tiempo real", frequency: "Diario" },
};

const INTERVALS = ["1d", "1h", "4h", "1w"] as const;
const LIMITS = [100, 250, 500, 1000] as const;
type Interval = (typeof INTERVALS)[number];
type Limit = (typeof LIMITS)[number];

function isInterval(value: string | undefined): value is Interval {
  return value !== undefined && (INTERVALS as readonly string[]).includes(value);
}

function isLimit(value: number): value is Limit {
  return LIMITS.includes(value as Limit);
}

function buildSearch(symbol: string, source: "binance" | "yahoo", interval: string, limit: number) {
  const p = new URLSearchParams({ symbol, source, interval, limit: String(limit) });
  return `/api/datasets/download?${p.toString()}`;
}

// Mirrors regionales de Binance. `api.binance.com` es geobloqueada con HTTP 451
// desde datacenters de Vercel Edge; `api.binance.us` actúa de fallback.
const BINANCE_HOSTS = [
  "https://api.binance.com/api/v3/klines",
  "https://api.binance.us/api/v3/klines",
];

async function fetchBinanceDirect(symbol: string, interval: string, limit: number): Promise<Row[]> {
  const params = `symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&limit=${limit}`;
  const errors: string[] = [];
  for (const host of BINANCE_HOSTS) {
    const url = `${host}?${params}`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        const detail = `Binance ${resp.status}`;
        if (resp.status === 451) {
          errors.push(`${detail} (${host})`);
          continue; // probar el siguiente mirror
        }
        throw new Error(detail);
      }
      const data: unknown[][] = await resp.json();
      if (!Array.isArray(data)) throw new Error("Binance: respuesta inesperada");
      return data.map((k) => ({
        date: new Date(k[0] as number).toISOString(),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      errors.push(`${msg} (${host})`);
    }
  }
  throw new Error(`Binance falló en todos los mirrors [${errors.join("; ")}]`);
}

async function fetchYahooDirect(symbol: string, interval: string, limit: number): Promise<Row[]> {
  const yahooInterval = interval === "1w" ? "1wk" : interval === "4h" ? "1h" : interval === "1h" ? "1h" : "1d";
  const range = interval === "1h" ? "730d" : interval === "4h" ? "730d" : "max";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${yahooInterval}`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!resp.ok) throw new Error(`Yahoo ${resp.status}`);
  const json = (await resp.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
      } | null>;
    };
  };
  const result = json.chart?.result?.[0];
  if (!result) throw new Error("Yahoo: sin datos");
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) throw new Error("Yahoo: sin indicadores");
  const rows: Row[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    rows.push({
      date: new Date(timestamps[i] * 1000).toISOString(),
      open: o, high: h, low: l, close: c, volume: v ?? 0,
    });
  }
  return rows.slice(-limit);
}

/**
 * Fetcha datos OHLCV directamente de la fuente (Binance/Yahoo).
 *
 * Se hace el fetch server-side (Next.js server component) SIN pasar por el API
 * route interno `/api/datasets`, porque un server component en Vercel no puede
 * hacer fetch a otro serverless function de la misma app (falla con
 * "fetch failed" / ERR_NAME_NOT_RESOLVED cuando NEXT_PUBLIC_BASE_URL apunta a
 * localhost). Fetchar directamente a la API pública de datos funciona en dev
 * y en prod (Vercel).
 */
async function fetchRows(symbol: string, source: "binance" | "yahoo", interval: string, limit: number): Promise<{ rows: Row[]; error?: string }> {
  try {
    const useBinance = source === "binance";
    const useYahoo = source === "yahoo";
    const errors: string[] = [];
    let rows: Row[] = [];
    let usedSource = "";

    if (useBinance) {
      try {
        rows = await fetchBinanceDirect(symbol, interval, limit);
        usedSource = "binance";
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "binance error");
      }
    }
    if (usedSource === "" && useYahoo) {
      try {
        rows = await fetchYahooDirect(symbol, interval, limit);
        usedSource = "yahoo";
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "yahoo error");
      }
    }
    if (rows.length === 0) {
      return { rows: [], error: `No se pudieron obtener datos: ${errors.join("; ") || "sin fuentes disponibles"}` };
    }
    return { rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ interval?: string; limit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const meta = MAP[id];

  if (!meta) {
    return (
      <div className="qb-learn-wrap">
        <div className="qb-glass" style={{ padding: 32, marginTop: 40, textAlign: "center" }}>
          <h2 style={{ color: "var(--qb-ink)" }}>Dataset no encontrado</h2>
          <p style={{ color: "var(--qb-muted)" }}>Id desconocido: {id}</p>
          <Link href="/app/library" className="btn-primary" style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>Volver a Biblioteca</Link>
        </div>
      </div>
    );
  }

  const interval: Interval = isInterval(sp.interval) ? sp.interval : meta.interval;
  const requestedLimit = Number(sp.limit);
  const limit: Limit = isLimit(requestedLimit) ? requestedLimit : 500;

  const { rows, error } = await fetchRows(meta.symbol, meta.source, interval, limit);

  const currentUrl = `/app/library/${id}`;

  return (
    <div className="qb-learn-wrap">
      <div style={{ marginBottom: 16 }}>
        <Link href="/app/library" className="link-back">← Volver a Biblioteca</Link>
      </div>

      <div className="qb-glass" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <span className="lesson-kicker">{meta.assetClass} · {meta.level === "beginner" ? "Principiante" : "Avanzado"}</span>
            <h1 style={{ margin: "6px 0 4px", fontSize: 28, color: "var(--qb-ink)" }}>{meta.name}</h1>
            <p style={{ color: "var(--qb-muted)", margin: 0 }}>{meta.blurb}</p>
            <div className="lib-meta" style={{ marginTop: 8 }}>
              Fuente: <strong>{meta.source === "binance" ? "Binance" : "Yahoo Finance"}</strong> · Simbolo: <strong>{meta.symbol}</strong> · Intervalo: <strong>{interval}</strong> · Velas: <strong>{rows.length}</strong>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {INTERVALS.map((iv) => (
              <Link
                key={iv}
                href={`${currentUrl}?interval=${iv}&limit=${limit}`}
                className={`btn-secondary ${interval === iv ? "sel" : ""}`}
                style={{ textDecoration: "none" }}
              >
                {iv}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ color: "var(--qb-muted)", fontSize: 13 }}>Limite:</label>
          <div style={{ display: "flex", gap: 6 }}>
            {LIMITS.map((l) => (
              <Link
                key={l}
                href={`${currentUrl}?interval=${interval}&limit=${l}`}
                className={`btn-secondary ${limit === l ? "sel" : ""}`}
                style={{ padding: "6px 12px", fontSize: 12, textDecoration: "none" }}
              >
                {l}
              </Link>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <a href={buildSearch(meta.symbol, meta.source, interval, limit)} className="btn-primary" style={{ textDecoration: "none" }}>
            Descargar CSV
          </a>
        </div>
      </div>

      {error && (
        <div className="qb-glass" style={{ padding: 20, marginBottom: 20, color: "var(--qb-short)" }}>
          <strong>Error al obtener datos:</strong> {error}
        </div>
      )}

      {rows.length === 0 && !error ? (
        <div className="qb-glass" style={{ padding: 40, textAlign: "center", color: "var(--qb-muted)" }}>
          No hay datos disponibles para estos parametros.
        </div>
      ) : (
        <div className="qb-glass" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            <table className="ohclv">
              <thead>
                <tr>
                  <th>fecha</th>
                  <th>open</th>
                  <th>high</th>
                  <th>low</th>
                  <th>close</th>
                  <th>volume</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.date}-${i}`}>
                    <td>{r.date}</td>
                    <td>{r.open.toFixed(2)}</td>
                    <td>{r.high.toFixed(2)}</td>
                    <td>{r.low.toFixed(2)}</td>
                    <td>{r.close.toFixed(2)}</td>
                    <td>{r.volume.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="read-hint" style={{ marginTop: 12 }}>
        Datos reales en formato OHLCV. Mismos datos que usan los torneos y ejercicios de QuantBattle.
      </p>
    </div>
  );
}