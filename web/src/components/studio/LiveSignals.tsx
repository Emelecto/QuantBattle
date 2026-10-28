"use client";

import { useEffect, useState } from "react";
import {
  fetchMarketSeries,
  sma,
  crossoverSignals,
  parseFastSlow,
  type AssetType,
} from "./marketData";

interface LiveSignalsProps {
  asset_type: AssetType;
  symbol: string;
  timeframe: string;
  /** Formato 'fast=XX,slow=YY'. Si no trae parámetros usa 20/50. */
  code: string;
}

const W = 800;
const H = 260;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 14;

function buildPath(values: number[], min: number, max: number): string {
  const range = max - min || 1;
  const x = (i: number) =>
    PAD_L + (i / (values.length - 1 || 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) =>
    PAD_T + (1 - (v - min) / range) * (H - PAD_T - PAD_B);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

/**
 * Bloque 3 — Señales en vivo.
 * Mini-gráfico de precios reales con puntos de entrada/salida de la estrategia.
 * No maneja estado global: solo props + fetch client-side.
 */
export function LiveSignals({
  asset_type,
  symbol,
  timeframe,
  code,
}: LiveSignalsProps) {
  const requestKey = JSON.stringify([asset_type, symbol, timeframe, code]);
  const [result, setResult] = useState<{ key: string; closes: number[]; signals: ReturnType<typeof crossoverSignals>; status: "ok" | "error" } | null>(null);
  const current = result?.key === requestKey ? result : null;
  const closes = current?.closes ?? [];
  const signals = current?.signals ?? [];
  const status = current?.status ?? "loading";

  useEffect(() => {
    let active = true;
    fetchMarketSeries(asset_type, symbol, timeframe).then((series) => {
      if (!active) return;
      const { fast, slow } = parseFastSlow(code);
      const signals = crossoverSignals(sma(series.closes, fast), sma(series.closes, slow), series.closes);
      setResult({ key: requestKey, closes: series.closes, signals, status: "ok" });
    }).catch(() => { if (active) setResult({ key: requestKey, closes: [], signals: [], status: "error" }); });
    return () => { active = false; };
  }, [asset_type, symbol, timeframe, code, requestKey]);

  const pricePath =
    closes.length > 1 ? buildPath(closes, Math.min(...closes), Math.max(...closes)) : "";

  const range = closes.length ? Math.max(...closes) - Math.min(...closes) || 1 : 1;
  const min = closes.length ? Math.min(...closes) : 0;
  const xOf = (i: number) =>
    PAD_L + (i / (closes.length - 1 || 1)) * (W - PAD_L - PAD_R);
  const yOf = (v: number) =>
    PAD_T + (1 - (v - min) / range) * (H - PAD_T - PAD_B);

  return (
    <section className="ql-glass ql-perspective" style={{ minHeight: 260 }}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Señales en vivo</h3>
          <p className="text-xs text-muted">
            {asset_type === "crypto" ? "Binance" : "Yahoo Finance"} · {symbol} ·{" "}
            {timeframe}
          </p>
        </div>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-long" /> Compra
          <span className="inline-block h-2 w-2 rounded-full bg-short" /> Venta
        </span>
      </div>

      <div className="px-3 pb-3 pt-2">
        {status === "loading" && (
          <div
            className="flex items-center justify-center text-sm text-muted"
            style={{ height: H }}
          >
            Cargando datos en vivo…
          </div>
        )}

        {status === "error" && (
          <div
            className="flex items-center justify-center text-sm text-short"
            style={{ height: H }}
          >
            No se pudieron cargar datos en vivo
          </div>
        )}

        {status === "ok" && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-[260px] w-full"
            role="img"
            aria-label={`Precios de ${symbol} con señales de la estrategia`}
          >
            <path
              d={pricePath}
              fill="none"
              stroke="var(--ql-accent)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {signals.map((sig, i) => (
              <circle
                key={i}
                cx={xOf(sig.index)}
                cy={yOf(sig.price)}
                r={4}
                fill={sig.type === "buy" ? "var(--ql-long)" : "var(--ql-short)"}
                stroke="#04110d"
                strokeWidth={1}
              >
                <title>
                  {sig.type === "buy" ? "Compra" : "Venta"} @ {sig.price.toFixed(2)}
                </title>
              </circle>
            ))}
          </svg>
        )}
      </div>
    </section>
  );
}

export default LiveSignals;
