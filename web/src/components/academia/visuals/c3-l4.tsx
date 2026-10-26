"use client";

/**
 * C3-L4 · ATR y stop — deslizador de ventana sobre 50 velas OHLC (c3_l4.csv).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C3_L4_OHLC } from "./lesson-data";

function trueRanges(): number[] {
  return C3_L4_OHLC.map((v, i) => {
    if (i === 0) return v.h - v.l;
    const pc = C3_L4_OHLC[i - 1].c;
    return Math.max(v.h - v.l, Math.abs(v.h - pc), Math.abs(v.l - pc));
  });
}

export default function C3L4Visual() {
  const [ventana, setVentana] = useState(14);
  const trs = useMemo(() => trueRanges(), []);

  const calc = useMemo(() => {
    const ultimos = trs.slice(-ventana);
    const atr = ultimos.reduce((a, b) => a + b, 0) / ultimos.length;
    const cierre = C3_L4_OHLC[C3_L4_OHLC.length - 1].c;
    return { atr, stop: cierre - 2 * atr, cierre, dist: (2 * atr) / cierre * 100 };
  }, [trs, ventana]);

  const maxTr = Math.max(...trs);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">ATR: que la volatilidad ponga tu stop</p>
        <p className="academia-viz-sub">
          Stop = último cierre − 2×ATR. Mueve la ventana: a más días, más estable el ATR
          pero más lento para adaptarse.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control">
          <label htmlFor="ac-c3l4-vent">Ventana del ATR: {ventana} días</label>
          <input
            id="ac-c3l4-vent" type="range" min={2} max={20} step={1} value={ventana}
            onChange={(e) => setVentana(Number(e.target.value))} className="academia-deslizador"
          />
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">ATR({ventana})</span>
            <span className="academia-stat-valor"><CountUp valor={calc.atr} decimales={2} /></span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Stop 2×ATR</span>
            <span className="academia-stat-valor academia-negativo">
              <CountUp valor={calc.stop} decimales={2} prefijo="$" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Distancia al cierre</span>
            <span className="academia-stat-valor"><CountUp valor={calc.dist} decimales={2} sufijo=" %" /></span>
          </div>
        </div>
        <p className="academia-viz-nota">
          Último cierre ${calc.cierre.toFixed(2)}: un stop fijo de $10 quedaría {
            10 < 2 * calc.atr ? "demasiado cerca (el ruido diario lo barrería)" : "razonable frente al ruido actual"
          }.
        </p>
      </Reveal>
      <Reveal retraso={280}>
        <p className="academia-viz-graf-titulo">Rangos verdaderos · 50 días (resaltados los últimos {ventana})</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "120px" }} aria-label="Barras de rango verdadero">
          {trs.map((tr, i) => (
            <div
              key={i}
              title={`Día ${i + 1}: TR ${tr.toFixed(2)}`}
              style={{
                flex: 1,
                height: `${Math.max(3, (tr / maxTr) * 100)}%`,
                background: i >= trs.length - ventana ? "#245ce5" : "#cbd9e8",
                borderRadius: "2px",
              }}
            />
          ))}
        </div>
        <p className="academia-viz-nota">Días 6–7 y 23–25 concentran los rangos más amplios: ahí el ATR crece y el stop se aleja solo.</p>
      </Reveal>
    </div>
  );
}
