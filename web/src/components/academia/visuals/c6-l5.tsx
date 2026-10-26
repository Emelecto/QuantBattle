"use client";

/**
 * C6-L5 · Testnet — checklist + log de fills.
 * Datos reales: 60 días de c6_l5.csv (equity demo 100.93 → 106.39).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C6_L5_TESTNET } from "./lesson-data";

const CHECKS = [
  "Cuenta demo separada de la real",
  "Mismo fee y slippage que producción",
  "Órdenes límite con confirmación de fill",
  "Log de cada fill: precio, cantidad, motivo",
  "Revisión diaria del equity demo",
];

export default function C6L5Visual() {
  const [hechos, setHechos] = useState<boolean[]>([true, true, false, false, false]);
  const [hasta, setHasta] = useState(60);
  const curva = useMemo(() => C6_L5_TESTNET.slice(0, hasta), [hasta]);
  const ini = C6_L5_TESTNET[0].equity, fin = curva[curva.length - 1].equity;
  const ret = (fin / ini - 1) * 100;
  const listos = hechos.filter(Boolean).length;
  const max = Math.max(...curva.map((d) => d.equity)), min = Math.min(...curva.map((d) => d.equity));
  const pts = curva.map((d, i) => `${(i / Math.max(curva.length - 1, 1)) * 100},${34 - ((d.equity - min) / Math.max(max - min, 1e-9)) * 30}`).join(" ");

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Testnet: opera de mentira antes de arriesgar de verdad</p>
        <p className="academia-viz-sub">60 días demo registrados en c6_l5.csv. La testnet valida fills, fees y disciplina sin poner capital. Solo se pasa a real con checklist completo.</p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Equity demo</span><span className="academia-stat-valor"><CountUp valor={fin} decimales={2} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Retorno demo</span><span className={`academia-stat-valor ${ret >= 0 ? "academia-positivo" : "academia-negativo"}`}><CountUp valor={ret} decimales={2} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Checklist</span><span className="academia-stat-valor">{listos}/{CHECKS.length}</span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-control" style={{ marginBottom: "0.8rem" }}>
          <label htmlFor="ac-c6l5-h">Días demo visibles: {hasta}</label>
          <input id="ac-c6l5-h" type="range" min={5} max={60} step={1} value={hasta} onChange={(e) => setHasta(Number(e.target.value))} className="academia-deslizador" />
        </div>
        <svg viewBox="0 0 100 36" style={{ width: "100%", height: "140px", background: "#f4f8fc", borderRadius: "8px" }}>
          <polyline points={pts} fill="none" stroke="#087951" strokeWidth="1.2" />
        </svg>
        {CHECKS.map((c, i) => (
          <label key={c} style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.35rem 0", cursor: "pointer" }}>
            <input type="checkbox" checked={hechos[i]} onChange={() => setHechos((h) => h.map((v, j) => (j === i ? !v : v)))} />
            <span style={{ textDecoration: hechos[i] ? "line-through" : "none", opacity: hechos[i] ? 0.6 : 1 }}>{c}</span>
          </label>
        ))}
        <p className="academia-viz-nota">Log de fills (últimos 3 días): {curva.slice(-3).map((d) => `día ${d.dia} score ${d.score.toFixed(3)} → equity ${d.equity.toFixed(2)}`).join(" · ")}. {listos === CHECKS.length ? "Checklist completo: apto para real." : `Faltan ${CHECKS.length - listos} pasos: sigue en demo.`}</p>
      </Reveal>
    </div>
  );
}
