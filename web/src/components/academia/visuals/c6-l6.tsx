"use client";

/**
 * C6-L6 · Bitácora de trading — 10 filas reales.
 * Datos reales: primeras 10 de 30 filas de c6_l6.csv (19 con plan, R medio +0.18).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C6_L6_BITACORA, C6_L6_RESUMEN } from "./lesson-data";

export default function C6L6Visual() {
  const [filtro, setFiltro] = useState<"todas" | "plan" | "sin">("todas");
  const filas = useMemo(() => C6_L6_BITACORA.filter((t) => filtro === "todas" || (filtro === "plan" ? t.plan === 1 : t.plan === 0)), [filtro]);
  const rMedio = filas.reduce((s, t) => s + t.r, 0) / Math.max(filas.length, 1);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Bitácora: cada trade deja huella</p>
        <p className="academia-viz-sub">Setup, lado, entrada, salida, resultado en R, emoción y si seguiste el plan. 30 trades reales en c6_l6.csv: 19 con plan y R medio +0.18.</p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Trades totales</span><span className="academia-stat-valor"><CountUp valor={C6_L6_RESUMEN.trades} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Con plan</span><span className="academia-stat-valor academia-positivo"><CountUp valor={C6_L6_RESUMEN.conPlan} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">R medio</span><span className="academia-stat-valor academia-positivo"><CountUp valor={C6_L6_RESUMEN.rMedio} decimales={2} sufijo=" R" /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-control" style={{ display: "flex", gap: "0.5rem", marginBottom: "0.8rem" }}>
          {(["todas", "plan", "sin"] as const).map((m) => (
            <button key={m} onClick={() => setFiltro(m)} style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: "1px solid #cddaea", background: filtro === m ? "#245ce5" : "transparent", color: filtro === m ? "#fff" : "inherit", cursor: "pointer" }}>
              {m === "todas" ? "Todas" : m === "plan" ? "Con plan" : "Sin plan"}
            </button>
          ))}
        </div>
        <p className="academia-viz-graf-titulo">Primeras 10 filas · R medio filtro: {rMedio.toFixed(2)} R</p>
        <div className="academia-tabla-scroll">
          <table className="academia-tabla">
            <thead><tr><th>#</th><th>Setup</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>R</th><th>Emoción</th><th>Plan</th></tr></thead>
            <tbody>{filas.map((t) => (<tr key={t.id}><td>{t.id}</td><td>{t.setup}</td><td>{t.lado}</td><td>{t.entrada.toFixed(0)}</td><td>{t.salida.toFixed(0)}</td><td className={t.r >= 0 ? "academia-positivo" : "academia-negativo"}>{t.r >= 0 ? "+" : ""}{t.r.toFixed(2)}</td><td>{t.emocion}</td><td>{t.plan ? "✓" : "✗"}</td></tr>))}</tbody>
          </table>
        </div>
        <p className="academia-viz-nota">Patrón visible: el tilt aparece en salidas sin plan. La bitácora no es burocracia: es el espejo que muestra qué emoción te cuesta dinero.</p>
      </Reveal>
    </div>
  );
}
