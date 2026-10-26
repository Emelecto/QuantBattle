"use client";

/**
 * C3-L3 · Retorno simple vs logarítmico — interruptor + 50 cierres (c3_l3.csv).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C3_L3_CIERRES } from "./lesson-data";

export default function C3L3Visual() {
  const [modo, setModo] = useState<"simple" | "log">("simple");

  const calc = useMemo(() => {
    const simples = C3_L3_CIERRES.slice(1).map((c, i) => c / C3_L3_CIERRES[i] - 1);
    const logs = C3_L3_CIERRES.slice(1).map((c, i) => Math.log(c / C3_L3_CIERRES[i]));
    const totalSimple = simples.reduce((a, r) => a * (1 + r), 1) - 1;
    const totalLog = logs.reduce((a, b) => a + b, 0);
    return { simples, logs, totalSimple: totalSimple * 100, totalLog: totalLog * 100 };
  }, []);

  const serie = modo === "simple" ? calc.simples : calc.logs;
  const total = modo === "simple" ? calc.totalSimple : calc.totalLog;
  const maxAbs = Math.max(...serie.map((r) => Math.abs(r)));

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Simple vs logarítmico: dos formas de sumar</p>
        <p className="academia-viz-sub">
          El retorno simple se multiplica; el logarítmico se suma. En 50 días la diferencia
          ya se nota: cambia el modo y compara el acumulado.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ display: "flex", gap: "0.6rem" }}>
          <button
            type="button" className="academia-btn-mini"
            onClick={() => setModo("simple")} aria-pressed={modo === "simple"}
            style={modo === "simple" ? { borderColor: "#245ce5" } : undefined}
          >
            Retorno simple
          </button>
          <button
            type="button" className="academia-btn-mini"
            onClick={() => setModo("log")} aria-pressed={modo === "log"}
            style={modo === "log" ? { borderColor: "#245ce5" } : undefined}
          >
            Retorno log
          </button>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Acumulado {modo === "simple" ? "simple" : "log"}</span>
            <span className={`academia-stat-valor ${total >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={total} decimales={2} prefijo={total >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Acumulado simple</span>
            <span className="academia-stat-valor academia-positivo">
              +{calc.totalSimple.toFixed(2)} %
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Suma log</span>
            <span className="academia-stat-valor academia-positivo">
              +{calc.totalLog.toFixed(2)} %
            </span>
          </div>
        </div>
        <p className="academia-viz-nota">
          exp(suma log) − 1 = acumulado simple: e<sup>{(calc.totalLog / 100).toFixed(4)}</sup> − 1 = {(calc.totalSimple / 100).toFixed(4)}.
          Por eso en quant se modela con logs y se reporta en simples.
        </p>
      </Reveal>
      <Reveal retraso={280}>
        <p className="academia-viz-graf-titulo">
          Retornos diarios ({modo === "simple" ? "simples" : "logarítmicos"}) · 49 sesiones
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "120px" }} aria-label="Barras de retornos">
          {serie.map((r, i) => (
            <div
              key={i}
              title={`Día ${i + 2}: ${(r * 100).toFixed(2)}%`}
              style={{
                flex: 1,
                height: `${Math.max(3, (Math.abs(r) / maxAbs) * 100)}%`,
                alignSelf: r >= 0 ? "flex-start" : "flex-end",
                background: r >= 0 ? "#087951" : "#af3f4f",
                opacity: 0.85,
                borderRadius: "2px",
                marginTop: r >= 0 ? 0 : "auto",
              }}
            />
          ))}
        </div>
        <p className="academia-viz-nota">Día 21: caída de ~−7.5% visible en ambas métricas; el log la registra un poco más profunda.</p>
      </Reveal>
    </div>
  );
}
