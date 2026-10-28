"use client";

/**
 * C4-L8 · Diario + kill-switch — slider de umbral diario y paros automáticos.
 * Base (c4_l8.csv): 45 días, 6 kill-switch activados, peor día −3 %.
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C4_DIARIO, C4_DIARIO_RESUMEN } from "./lesson-data";

export default function C4L8Visual() {
  const [umbral, setUmbral] = useState(3);
  const [activado, setActivado] = useState(true);

  const sim = useMemo(() => {
    const filas = C4_DIARIO.map((d) => {
      const dispara = activado && d.pnl <= -umbral;
      return { ...d, dispara };
    });
    const detenidas = filas.filter((d) => d.dispara).length;
    const salvado = filas.filter((d) => d.kill).length;
    const pnlSinKS = C4_DIARIO.reduce((a, d) => a + d.pnl, 0);
    return { filas, detenidas, salvado, pnlSinKS };
  }, [umbral, activado]);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Diario y kill-switch</p>
        <p className="academia-viz-sub">
          El kill-switch te desconecta al tocar el límite diario. No protege un día: protege la cuenta de ti.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-simulador-grid">
          <div className="academia-control">
            <label htmlFor="ac-c4l8-umbral">Límite diario: −{umbral} %</label>
            <input id="ac-c4l8-umbral" type="range" min={1} max={5} step={0.5} value={umbral}
              onChange={(e) => setUmbral(Number(e.target.value))} className="academia-deslizador" />
          </div>
          <div className="academia-control">
            <span className="academia-stat-etiqueta">Kill-switch</span>
            <div style={{ marginTop: "0.4rem" }}>
              <button type="button" onClick={() => setActivado((a) => !a)}
                className={activado ? "academia-btn-mini academia-btn-activo" : "academia-btn-mini"}
                aria-pressed={activado}>
                {activado ? "● Activado" : "○ Desactivado"}
              </button>
            </div>
          </div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Días detenidos</span><span className="academia-stat-valor"><CountUp valor={sim.detenidas} decimales={0} sufijo={` / ${C4_DIARIO.length}`} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Paros reales (45 días)</span><span className="academia-stat-valor"><CountUp valor={C4_DIARIO_RESUMEN.kills} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Peor día permitido</span><span className="academia-stat-valor academia-negativo"><CountUp valor={C4_DIARIO_RESUMEN.peorDia} decimales={1} sufijo=" %" /></span></div>
        </div>
        <p className="academia-viz-nota">
          {activado ? `Con límite −${umbral} % habrías cortado ${sim.detenidas} sesiones de la muestra antes de agrandar el hoyo.` : "Kill-switch desactivado: cada día rojo queda abierto al tilt y a la revancha."}
        </p>
      </Reveal>
      <Reveal retraso={280}>
        <p className="academia-viz-graf-titulo">Muestra del diario · PnL diario (%)</p>
        <div className="academia-tabla-scroll">
          <table className="academia-tabla">
            <thead><tr><th>Día</th><th>PnL</th><th>Kill-switch</th></tr></thead>
            <tbody>
              {sim.filas.map((d) => (
                <tr key={d.dia} style={d.dispara ? { background: "rgba(239,68,68,0.08)" } : undefined}>
                  <td>{d.dia}</td>
                  <td className={d.pnl >= 0 ? "academia-positivo" : "academia-negativo"}>
                    <strong>{d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(1)} %</strong>
                  </td>
                  <td>{d.dispara ? "🛑 Parado" : d.kill ? "histórico" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
