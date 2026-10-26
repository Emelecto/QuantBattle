"use client";

/**
 * C1-L3 · La campana y las colas — histograma interactivo de retornos BTC.
 * Héroe SVG (campana de Gauss) + histograma de los 60 retornos reales con
 * deslizador ±kσ que ilumina la banda y la compara con la normal teórica.
 */

import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { BTC_RETORNOS } from "./lesson-data";

function media(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function desv(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
/** Φ(k) − Φ(−k): masa teórica dentro de ±kσ (aprox. Abramowitz-Stegun). */
function masaTeorica(k: number): number {
  const t = 1 / (1 + 0.2316419 * k);
  const d = 0.3989423 * Math.exp((-k * k) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return (1 - p) * 2 - 1;
}

function HeroCampana() {
  return (
    <svg className="academia-hero-svg" viewBox="0 0 320 120" role="img" aria-label="Campana de Gauss">
      <line x1="20" y1="105" x2="305" y2="105" className="academia-svg-eje" />
      <path
        d="M25 103 C80 102 110 100 135 62 C148 40 172 40 185 62 C210 100 240 102 295 103 Z"
        className="academia-svg-campana"
      />
      <line x1="160" y1="50" x2="160" y2="105" stroke="#9fb5cc" strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="120" y1="78" x2="120" y2="105" stroke="#a96b16" strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="200" y1="78" x2="200" y2="105" stroke="#a96b16" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="160" y="118" textAnchor="middle" className="academia-svg-mini">μ</text>
      <text x="120" y="118" textAnchor="middle" className="academia-svg-mini">−σ</text>
      <text x="200" y="118" textAnchor="middle" className="academia-svg-mini">+σ</text>
    </svg>
  );
}

const NBINS = 12;

export function C1L3Histograma() {
  const [k, setK] = useState(1);

  const stats = useMemo(() => {
    const m = media(BTC_RETORNOS);
    const s = desv(BTC_RETORNOS, m);
    const min = Math.min(...BTC_RETORNOS);
    const max = Math.max(...BTC_RETORNOS);
    const ancho = (max - min) / NBINS;
    const bins = Array.from({ length: NBINS }, (_, i) => ({
      desde: min + i * ancho,
      hasta: min + (i + 1) * ancho,
      n: 0,
    }));
    for (const r of BTC_RETORNOS) {
      const i = Math.min(NBINS - 1, Math.floor((r - min) / ancho));
      bins[i].n += 1;
    }
    return { m, s, bins, maxN: Math.max(...bins.map((b) => b.n)) };
  }, []);

  const dentro = BTC_RETORNOS.filter((r) => Math.abs(r - stats.m) <= k * stats.s).length;
  const pctReal = (dentro / BTC_RETORNOS.length) * 100;
  const pctTeorico = masaTeorica(k) * 100;

  return (
    <div className="academia-viz">
      <Reveal>
        <HeroCampana />
      </Reveal>
      <Reveal retraso={120}>
        <p className="academia-viz-titulo">¿Qué cabe dentro de ±σ?</p>
        <p className="academia-viz-sub">
          60 retornos diarios reales de BTC (μ = {stats.m.toFixed(2)} %, σ = {stats.s.toFixed(2)} %).
          Mueve k y compara la masa real contra la campana teórica: las colas cripto pesan más.
        </p>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-control">
          <label htmlFor="ac-l3-k">Banda: ±{k.toFixed(1)}σ (de {stats.m - k * stats.s < 0 ? "" : "+"}{(stats.m - k * stats.s).toFixed(2)} % a {(stats.m + k * stats.s).toFixed(2)} %)</label>
          <input
            id="ac-l3-k" type="range" min={0.5} max={3} step={0.5} value={k}
            onChange={(e) => setK(Number(e.target.value))} className="academia-deslizador"
          />
        </div>
      </Reveal>
      <Reveal retraso={260}>
        <div className="academia-hist" role="img" aria-label={`Histograma: ${dentro} de 60 retornos dentro de ${k} sigmas`}>
          {stats.bins.map((b, i) => {
            const centro = (b.desde + b.hasta) / 2;
            const enBanda = Math.abs(centro - stats.m) <= k * stats.s;
            return (
              <div key={i} className="academia-hist-col" title={`${b.desde.toFixed(2)} % a ${b.hasta.toFixed(2)} %: ${b.n} días`}>
                <div
                  className={`academia-hist-barra${enBanda ? " academia-hist-dentro" : ""}`}
                  style={{ height: `${Math.max(4, (b.n / stats.maxN) * 100)}%` }}
                />
                <span className="academia-hist-n">{b.n}</span>
              </div>
            );
          })}
        </div>
      </Reveal>
      <Reveal retraso={320}>
        <div className="academia-stat-grid">
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Dentro de ±{k.toFixed(1)}σ (real)</span>
            <span className="academia-stat-valor academia-positivo">
              <CountUp valor={pctReal} decimales={1} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Normal teórica</span>
            <span className="academia-stat-valor">
              <CountUp valor={pctTeorico} decimales={1} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Exceso de colas</span>
            <span className={`academia-stat-valor ${pctTeorico - pctReal > 0 ? "academia-negativo" : "academia-positivo"}`}>
              <CountUp valor={pctTeorico - pctReal} decimales={1} prefijo={pctTeorico - pctReal >= 0 ? "+" : ""} sufijo=" pp" />
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
