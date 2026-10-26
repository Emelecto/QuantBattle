"use client";

/**
 * C1-L1 · La esperanza manda — simulador de valor esperado.
 * Héroe SVG (moneda cara/sello) + sliders winrate/pago/pérdida → EV en vivo
 * + tira de los 60 lanzamientos reales del CSV con conteo de rachas.
 */

import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { MONEDA_PERDIDA, MONEDA_PNL, MONEDA_PAGO } from "./lesson-data";

function HeroMoneda() {
  return (
    <svg className="academia-hero-svg" viewBox="0 0 320 120" role="img" aria-label="Moneda al aire">
      <circle cx="90" cy="60" r="40" className="academia-svg-moneda" />
      <circle cx="90" cy="60" r="32" fill="none" stroke="#08090a" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="90" y="70" textAnchor="middle" className="academia-svg-texto">$</text>
      <circle cx="230" cy="60" r="40" className="academia-svg-moneda-alt" />
      <circle cx="230" cy="60" r="32" fill="none" stroke="#08090a" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="230" y="70" textAnchor="middle" className="academia-svg-texto">½</text>
      <path d="M140 40 Q160 60 140 80" fill="none" stroke="#245ce5" strokeWidth="2" strokeDasharray="5 4" className="academia-svg-arco" />
      <path d="M180 40 Q160 60 180 80" fill="none" stroke="#245ce5" strokeWidth="2" strokeDasharray="5 4" className="academia-svg-arco" />
    </svg>
  );
}

export function C1L1SimuladorEsperanza() {
  const [winrate, setWinrate] = useState(40);
  const [pago, setPago] = useState(MONEDA_PAGO);
  const [perdida, setPerdida] = useState(MONEDA_PERDIDA);

  const ev = useMemo(() => (winrate / 100) * pago - (1 - winrate / 100) * perdida, [winrate, pago, perdida]);

  const observado = useMemo(() => {
    const ganados = MONEDA_PNL.filter((p) => p > 0).length;
    const total = MONEDA_PNL.length;
    const pnl = MONEDA_PNL.reduce((a, b) => a + b, 0);
    return { ganados, total, pnl, tasa: (ganados / total) * 100 };
  }, []);

  const veredicto = ev > 0.005 ? "ventaja" : ev < -0.005 ? "desventaja" : "neutral";

  return (
    <div className="academia-viz">
      <Reveal>
        <HeroMoneda />
      </Reveal>
      <Reveal retraso={120}>
        <p className="academia-viz-titulo">Simulador de esperanza matemática</p>
        <p className="academia-viz-sub">
          EV = p × pago − (1 − p) × pérdida. Mueve los deslizadores y mira cuándo el juego se vuelve jugable.
        </p>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-simulador-grid">
          <div className="academia-control">
            <label htmlFor="ac-l1-wr">Probabilidad de ganar: {winrate}%</label>
            <input
              id="ac-l1-wr" type="range" min={5} max={95} step={1} value={winrate}
              onChange={(e) => setWinrate(Number(e.target.value))} className="academia-deslizador"
            />
          </div>
          <div className="academia-control">
            <label htmlFor="ac-l1-pago">Pago por acierto: {pago.toFixed(1)}</label>
            <input
              id="ac-l1-pago" type="range" min={0.5} max={5} step={0.1} value={pago}
              onChange={(e) => setPago(Number(e.target.value))} className="academia-deslizador"
            />
          </div>
          <div className="academia-control">
            <label htmlFor="ac-l1-perd">Pérdida por fallo: {perdida.toFixed(1)}</label>
            <input
              id="ac-l1-perd" type="range" min={0.5} max={3} step={0.1} value={perdida}
              onChange={(e) => setPerdida(Number(e.target.value))} className="academia-deslizador"
            />
          </div>
        </div>
      </Reveal>
      <Reveal retraso={280}>
        <div className={`academia-ev-resultado academia-ev-${veredicto}`}>
          <span className="academia-ev-etiqueta">Esperanza por apuesta</span>
          <span className="academia-ev-valor">
            <CountUp valor={ev} decimales={3} prefijo={ev >= 0 ? "+" : ""} />
          </span>
          <span className="academia-ev-veredicto">
            {veredicto === "ventaja" && "✓ Juego con ventaja: apostar tiene sentido."}
            {veredicto === "desventaja" && "✗ Juego con desventaja: el casino eres tú."}
            {veredicto === "neutral" && "≈ Juego justo: ni ganas ni pierdes en promedio."}
          </span>
        </div>
      </Reveal>
      <Reveal retraso={340}>
        <p className="academia-viz-sub">
          Los 60 lanzamientos reales del ejercicio ({observado.ganados}/{observado.total} aciertos ·{" "}
          {observado.tasa.toFixed(1)}% · PnL total {observado.pnl >= 0 ? "+" : ""}{observado.pnl}):
        </p>
        <div className="academia-tira" aria-label="Tira de lanzamientos">
          {MONEDA_PNL.map((p, i) => (
            <span
              key={i}
              title={`Lanzamiento ${i + 1}: ${p > 0 ? `+${p}` : p}`}
              className={`academia-tira-punto ${p > 0 ? "academia-tira-gana" : "academia-tira-pierde"}`}
              style={{ animationDelay: `${Math.min(i * 25, 1200)}ms` }}
            />
          ))}
        </div>
      </Reveal>
    </div>
  );
}
