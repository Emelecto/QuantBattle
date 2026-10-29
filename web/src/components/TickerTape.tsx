"use client";

/**
 * TickerTape — cinta bursátil en vivo con precios REALES de la API pública
 * de Binance (sin key). Marquee infinito, pausa en hover, refresco cada 30s.
 * Si la red falla, desaparece silenciosamente (sin romper el layout).
 */

import { useEffect, useState } from "react";

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "LTCUSDT",
];

type Tick = { symbol: string; price: number; pct: number };

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("es-CO", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export function TickerTape() {
  const [ticks, setTicks] = useState<Tick[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
          JSON.stringify(SYMBOLS),
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const raw = (await res.json()) as {
          symbol: string;
          lastPrice: string;
          priceChangePercent: string;
        }[];
        const parsed = raw.map((r) => ({
          symbol: r.symbol.replace("USDT", ""),
          price: parseFloat(r.lastPrice),
          pct: parseFloat(r.priceChangePercent),
        }));
        if (!active) return;
        setTicks(parsed);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (failed || !ticks || ticks.length === 0) return null;

  const doubled = [...ticks, ...ticks];

  return (
    <div className="border-b border-line bg-surface/40">
      <div className="relative flex h-9 items-center overflow-hidden">
        {/* Chip EN VIVO fijo a la izquierda */}
        <div className="z-10 flex shrink-0 items-center gap-1.5 border-r border-line bg-bg px-4 py-1.5">
          <span className="inline-block h-1.5 w-1.5 animate-pulse-subtle rounded-full bg-long" />
          <span className="metric text-[10px] font-semibold tracking-widest text-muted">
            EN VIVO
          </span>
        </div>

        {/* Marquee */}
        <div className="qb-ticker relative min-w-0 flex-1 overflow-hidden">
          <div className="qb-ticker-track flex w-max items-center gap-8 pl-6">
            {doubled.map((t, i) => (
              <span key={`${t.symbol}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
                <span className="metric text-[11px] font-semibold text-ink">{t.symbol}</span>
                <span className="metric text-[11px] text-muted">{fmtPrice(t.price)}</span>
                <span
                  className={`metric flex items-center gap-0.5 text-[11px] ${
                    t.pct >= 0 ? "text-long" : "text-short"
                  }`}
                >
                  <svg viewBox="0 0 8 8" width={7} height={7} aria-hidden>
                    {t.pct >= 0 ? (
                      <path d="M4 1l3.2 6H0.8L4 1Z" fill="currentColor" />
                    ) : (
                      <path d="M4 7L0.8 1h6.4L4 7Z" fill="currentColor" />
                    )}
                  </svg>
                  {Math.abs(t.pct).toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
          {/* Fundidos laterales */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
        </div>
      </div>
    </div>
  );
}
