"use client";

/**
 * C6-L7 · Atribución de PnL — señal vs costo vs timing.
 * Datos reales: 12 rondas de c6_l7.csv (spearman crudo vs neutral, stake, decisión).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C6_L7_RONDAS } from "./lesson-data";

export default function C6L7Visual() {
  const [ronda, setRonda] = useState(4);
  const r = C6_L7_RONDAS[ronda - 1];
  const atrib = useMemo(() => {
    const senal = r.neutral * 1000;
    const costo = -2;
    const timing = (r.spearman - r.neutral) * 1000;
    return { senal, costo, timing, total: senal + costo + timing };
  }, [r]);
  const maxAbs = Math.max(Math.abs(atrib.senal), Math.abs(atrib.costo), Math.abs(atrib.timing), 1);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Atribución: ¿de dónde vino tu PnL?</p>
        <p className="academia-viz-sub">Cada ronda se descompone en señal (neutral), costo (fees) y timing (entrar antes o después). 12 rondas reales de c6_l7.csv.</p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ marginBottom: "0.8rem" }}>
          <label htmlFor="ac-c6l7-r">Ronda: {ronda} ({r.decision === "enviar" ? "enviada" : "no enviada"}, stake {r.stake})</label>
          <input id="ac-c6l7-r" type="range" min={1} max={12} step={1} value={ronda} onChange={(e) => setRonda(Number(e.target.value))} className="academia-deslizador" />
        </div>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Spearman</span><span className="academia-stat-valor"><CountUp valor={r.spearman} decimales={3} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Neutral</span><span className="academia-stat-valor"><CountUp valor={r.neutral} decimales={4} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">PnL atribuido</span><span className={`academia-stat-valor ${atrib.total >= 0 ? "academia-positivo" : "academia-negativo"}`}><CountUp valor={atrib.total} decimales={1} sufijo=" bps" /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <Fila nombre="Señal" v={atrib.senal} max={maxAbs} color="#245ce5" />
        <Fila nombre="Costo" v={atrib.costo} max={maxAbs} color="#a96b16" />
        <Fila nombre="Timing" v={atrib.timing} max={maxAbs} color="#087951" />
        <p className="academia-viz-nota">La señal paga, el costo siempre resta (−2 bps) y el timing premia o castiga según entres con la ronda o contra ella. Si el costo supera a la señal, no envíes.</p>
      </Reveal>
    </div>
  );
}

function Fila({ nombre, v, max, color }: { nombre: string; v: number; max: number; color: string }) {
  const w = Math.min(Math.abs(v) / max, 1) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", margin: "0.35rem 0" }}>
      <span style={{ width: "70px", fontSize: "0.85rem" }}>{nombre}</span>
      <div style={{ flex: 1, height: "14px", background: "#e5edf5", borderRadius: "7px", overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color }} />
      </div>
      <span style={{ width: "90px", textAlign: "right", fontFamily: "monospace", fontSize: "0.85rem" }}>{v >= 0 ? "+" : ""}{v.toFixed(1)} bps</span>
    </div>
  );
}

