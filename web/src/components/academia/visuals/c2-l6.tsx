"use client";

/**
 * C2-L6 · Bruto vs neto — backtest SMA(10/30) sobre 120 precios reales
 * (c2_l6_precios.csv). El deslizador de comisión por trade revela cuántos
 * puntos de retorno se comen los costes.
 */
import { useMemo, useState } from "react";
import { AcademiaAreaChart, CountUp, Reveal } from "./charts";
import { C2_BACKTEST_PRECIOS } from "./lesson-data";

function sma(vals: number[], w: number, i: number): number | null {
  if (i < w - 1) return null;
  let s = 0;
  for (let j = i - w + 1; j <= i; j++) s += vals[j];
  return s / w;
}

export default function C2L6Visual() {
  const [bps, setBps] = useState(10);

  const bt = useMemo(() => {
    const fechas = C2_BACKTEST_PRECIOS.map(([f]) => f);
    const px = C2_BACKTEST_PRECIOS.map(([, p]) => p);
    let pos = 0;
    let trades = 0;
    const bruto: { tiempo: string; valor: number }[] = [];
    const neto: { tiempo: string; valor: number }[] = [];
    let eqB = 10000;
    let eqN = 10000;
    const coste = bps / 10000;
    for (let i = 1; i < px.length; i++) {
      const f = sma(px, 10, i);
      const s = sma(px, 30, i);
      const fPrev = sma(px, 10, i - 1);
      const sPrev = sma(px, 30, i - 1);
      if (f != null && s != null && fPrev != null && sPrev != null) {
        if (pos === 0 && fPrev <= sPrev && f > s) {
          pos = 1;
          trades++;
          eqN *= 1 - coste;
        } else if (pos === 1 && fPrev >= sPrev && f < s) {
          pos = 0;
          trades++;
          eqN *= 1 - coste;
        }
      }
      const r = px[i] / px[i - 1] - 1;
      eqB *= 1 + pos * r;
      eqN *= 1 + pos * r;
      bruto.push({ tiempo: fechas[i], valor: eqB });
      neto.push({ tiempo: fechas[i], valor: eqN });
    }
    const rB = (eqB / 10000 - 1) * 100;
    const rN = (eqN / 10000 - 1) * 100;
    return { bruto, neto, trades, rB, rN, mordida: rB - rN, costeTotal: trades * bps };
  }, [bps]);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">El spread se come tu alfa</p>
        <p className="academia-viz-sub">
          Cruce SMA(10/30) sobre {C2_BACKTEST_PRECIOS.length} cierres BTC. La curva bruta ignora costes;
          la neta descuenta comisión en cada entrada y salida.
        </p>
      </Reveal>
      <Reveal retraso={140}>
        <div className="academia-control">
          <label htmlFor="ac-c2l6-bps">Comisión por lado: {bps} bps (0.01 % × {bps})</label>
          <input id="ac-c2l6-bps" type="range" min={0} max={50} step={1} value={bps}
            onChange={(e) => setBps(Number(e.target.value))} className="academia-deslizador" />
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <p className="academia-viz-graf-titulo">Equity bruto (sin costes)</p>
        <AcademiaAreaChart datos={bt.bruto} altura={200} color="#245ce5" etiqueta="Bruto" formato={(v) => `$${v.toFixed(0)}`} />
      </Reveal>
      <Reveal retraso={260}>
        <p className="academia-viz-graf-titulo">Equity neto (con {bps} bps por lado)</p>
        <AcademiaAreaChart datos={bt.neto} altura={200} color="#a96b16" etiqueta="Neto" formato={(v) => `$${v.toFixed(0)}`} />
      </Reveal>
      <Reveal retraso={320}>
        <div className="academia-stat-grid academia-stat-grid-4">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Trades</span><span className="academia-stat-valor"><CountUp valor={bt.trades} decimales={0} /></span></div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno bruto</span>
            <span className={`academia-stat-valor ${bt.rB >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={bt.rB} decimales={1} prefijo={bt.rB >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno neto</span>
            <span className={`academia-stat-valor ${bt.rN >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={bt.rN} decimales={1} prefijo={bt.rN >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Mordida total</span><span className="academia-stat-valor academia-negativo"><CountUp valor={bt.mordida} decimales={1} sufijo=" pp" /></span></div>
        </div>
        <p className="academia-viz-nota">
          {bt.trades} trades × {bps} bps ≈ {bt.costeTotal} bps de arrastre. Sube la comisión y mira cuándo el neto se vuelve negativo.
        </p>
      </Reveal>
    </div>
  );
}
