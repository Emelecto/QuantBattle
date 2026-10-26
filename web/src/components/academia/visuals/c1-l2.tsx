"use client";

/**
 * C1-L2 · Del precio al retorno — acumulados simple vs logarítmico.
 * Héroe SVG (curva de precio) + gráfica interactiva con conmutador simple/log
 * sobre los 31 cierres reales del CSV + conteo de retorno total.
 */

import { useMemo, useState } from "react";
import { AcademiaAreaChart, CountUp, Reveal, type TiempoValor } from "./charts";
import { PRECIOS } from "./lesson-data";

function HeroPrecio() {
  return (
    <svg className="academia-hero-svg" viewBox="0 0 320 120" role="img" aria-label="Curva de precio al alza">
      <line x1="20" y1="10" x2="20" y2="105" className="academia-svg-eje" />
      <line x1="20" y1="105" x2="305" y2="105" className="academia-svg-eje" />
      <path
        d="M20 95 L50 88 L80 90 L110 74 L140 80 L170 66 L200 70 L230 52 L260 58 L290 34"
        fill="none" stroke="#245ce5" strokeWidth="2.5" strokeLinecap="round" className="academia-svg-trazo"
      />
      <circle cx="290" cy="34" r="5" className="academia-svg-punto" />
      <text x="292" y="22" className="academia-svg-mini">+6,4 %</text>
    </svg>
  );
}

type Modo = "simple" | "log";

export function C1L2PrecioRetornos() {
  const [modo, setModo] = useState<Modo>("simple");

  const series = useMemo(() => {
    const base = PRECIOS[0][1];
    const simple: TiempoValor[] = PRECIOS.map(([f, c]) => ({ tiempo: f, valor: ((c / base - 1) * 100) }));
    const log: TiempoValor[] = PRECIOS.map(([f, c]) => ({ tiempo: f, valor: Math.log(c / base) * 100 }));
    return { simple, log };
  }, []);

  const datos = modo === "simple" ? series.simple : series.log;
  const totalSimple = series.simple[series.simple.length - 1].valor;
  const totalLog = series.log[series.log.length - 1].valor;

  return (
    <div className="academia-viz">
      <Reveal>
        <HeroPrecio />
      </Reveal>
      <Reveal retraso={120}>
        <p className="academia-viz-titulo">Retorno acumulado: simple vs logarítmico</p>
        <p className="academia-viz-sub">
          31 cierres reales (100,00 → 106,40). Cambia de modo y observa cómo el logarítmico
          queda siempre un poco por debajo: la diferencia es la convexidad.
        </p>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-viz-controles" role="tablist" aria-label="Modo de retorno">
          {(["simple", "log"] as const).map((m) => (
            <button
              key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
              className={`academia-pill${modo === m ? " academia-pill-activa" : ""}`}
            >
              {m === "simple" ? "Simple" : "Logarítmico"}
            </button>
          ))}
        </div>
      </Reveal>
      <Reveal retraso={260}>
        <AcademiaAreaChart
          datos={datos}
          etiqueta={modo === "simple" ? "Acum. simple" : "Acum. log"}
          formato={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} %`}
          color={modo === "simple" ? "#245ce5" : "#087951"}
        />
      </Reveal>
      <Reveal retraso={320}>
        <div className="academia-stat-grid">
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno simple total</span>
            <span className="academia-stat-valor academia-positivo">
              <CountUp valor={totalSimple} decimales={2} prefijo="+" sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno log total</span>
            <span className="academia-stat-valor academia-positivo">
              <CountUp valor={totalLog} decimales={2} prefijo="+" sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Brecha (convexidad)</span>
            <span className="academia-stat-valor">
              <CountUp valor={totalSimple - totalLog} decimales={3} sufijo=" pp" />
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
