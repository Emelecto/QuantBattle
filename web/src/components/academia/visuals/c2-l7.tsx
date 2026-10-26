"use client";

/**
 * C2-L7 · Walk-forward — 6 ventanas IS/OOS reales (c2_l7_ventanas.csv):
 * esquema train/test por fold + barras Sharpe IS vs OOS con el gap.
 */
import { useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C2_VENTANAS_WF } from "./lesson-data";

const TOTAL = 115;

export default function C2L7Visual() {
  const [fold, setFold] = useState(4);
  const sel = C2_VENTANAS_WF.find((w) => w.ventana === fold) ?? C2_VENTANAS_WF[0];
  const maxAbs = Math.max(...C2_VENTANAS_WF.flatMap((w) => [Math.abs(w.sharpeIs), Math.abs(w.sharpeOos), 1]));
  const sobreajustados = C2_VENTANAS_WF.filter((w) => w.gap > 2).length;

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Walk-forward: entrena, valida, camina</p>
        <p className="academia-viz-sub">
          6 ventanas deslizantes (train 50 → test 15). En cada fold se elige el mejor SMA in-sample
          y se mide out-of-sample. El gap IS−OOS delata el sobreajuste.
        </p>
      </Reveal>
      <Reveal retraso={140}>
        <div className="academia-filtros" role="group" aria-label="Selector de ventana">
          {C2_VENTANAS_WF.map((w) => (
            <button key={w.ventana} type="button"
              className={`academia-chip${w.ventana === fold ? " academia-chip-activo" : ""}`}
              onClick={() => setFold(w.ventana)}>
              Fold {w.ventana}
            </button>
          ))}
        </div>
        <div className="academia-wf-esquema" aria-label={`Fold ${sel.ventana}: train ${sel.iniTrain}-${sel.finTrain}, test ${sel.iniTest}-${sel.finTest}`}>
          <div className="academia-wf-barra">
            <div className="academia-wf-train" style={{ left: `${(sel.iniTrain / TOTAL) * 100}%`, width: `${((sel.finTrain - sel.iniTrain) / TOTAL) * 100}%` }} title={`Train ${sel.iniTrain}–${sel.finTrain}`} />
            <div className="academia-wf-test" style={{ left: `${(sel.iniTest / TOTAL) * 100}%`, width: `${((sel.finTest - sel.iniTest) / TOTAL) * 100}%` }} title={`Test ${sel.iniTest}–${sel.finTest}`} />
          </div>
          <div className="academia-wf-leyenda"><span>🟦 train {sel.iniTrain}–{sel.finTrain}</span><span>🟧 test {sel.iniTest}–{sel.finTest}</span></div>
        </div>
        <div className="academia-stat-grid academia-stat-grid-4" style={{ marginTop: "0.8rem" }}>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Mejor (fast/lento)</span><span className="academia-stat-valor">{sel.mejorFast}/{sel.mejorLento}</span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Sharpe IS</span><span className="academia-stat-valor"><CountUp valor={sel.sharpeIs} decimales={2} /></span></div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sharpe OOS</span>
            <span className={`academia-stat-valor ${sel.sharpeOos >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={sel.sharpeOos} decimales={2} prefijo={sel.sharpeOos >= 0 ? "+" : ""} />
            </span>
          </div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Gap IS−OOS</span><span className={`academia-stat-valor ${sel.gap > 2 ? "academia-negativo" : "academia-positivo"}`}><CountUp valor={sel.gap} decimales={2} /></span></div>
        </div>
        {sel.gap > 2 && <p style={{ color: "#af3f4f", fontSize: "0.9rem" }}>⚠ Gap &gt; 2: lo que brilló in-sample se apagó out-of-sample — sobreajuste.</p>}
      </Reveal>
      <Reveal retraso={240}>
        <p className="academia-viz-graf-titulo">IS vs OOS por fold · {sobreajustados} de 6 con gap &gt; 2</p>
        <div style={{ display: "grid", gap: "0.55rem" }}>
          {C2_VENTANAS_WF.map((w) => (
            <button key={w.ventana} type="button" onClick={() => setFold(w.ventana)}
              className={`academia-wf-fila${w.ventana === fold ? " academia-wf-fila-activa" : ""}`}
              aria-label={`Ver fold ${w.ventana}`}>
              <span className="academia-wf-fold">F{w.ventana}</span>
              <span className="academia-wf-barras">
                <span className="academia-wf-track">
                  <span className={`academia-wf-is${w.sharpeIs < 0 ? " academia-wf-neg" : ""}`} style={{ width: `${(Math.abs(w.sharpeIs) / maxAbs) * 100}%` }} title={`IS ${w.sharpeIs}`} />
                </span>
                <span className="academia-wf-track">
                  <span className={`academia-wf-oos${w.sharpeOos < 0 ? " academia-wf-neg" : ""}`} style={{ width: `${(Math.abs(w.sharpeOos) / maxAbs) * 100}%` }} title={`OOS ${w.sharpeOos}`} />
                </span>
              </span>
              <span className="academia-wf-nums">IS {w.sharpeIs.toFixed(2)} · OOS {w.sharpeOos >= 0 ? "+" : ""}{w.sharpeOos.toFixed(2)}</span>
            </button>
          ))}
        </div>
        <p className="academia-viz-nota">Azul = in-sample · naranja = out-of-sample. Solo el fold 2 y el 5 confirman fuera de muestra.</p>
      </Reveal>
    </div>
  );
}
