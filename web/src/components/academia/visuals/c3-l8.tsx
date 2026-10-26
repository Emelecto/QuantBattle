'use client';

// C3-L8 — Intervalo del winrate + p-valor (c3_l8.csv, 50 retornos).
// Ganar el 62 % de los días suena bien… hasta que el intervalo cruza el 50 %
// y el test binomial dice «no significativo».

import { useMemo, useState } from 'react';
import { CountUp, Reveal } from './charts';
import { C3_L8_RETS } from './lesson-data';

function combinacion(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const j = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < j; i += 1) c = (c * (n - i)) / (i + 1);
  return c;
}

/** p-valor binomial bilateral H₀: p = 0.5. */
function pValorBinomial(n: number, aciertos: number): number {
  const d = Math.abs(aciertos - n / 2);
  let p = 0;
  for (let k = 0; k <= n; k += 1) {
    if (Math.abs(k - n / 2) >= d - 1e-9) p += combinacion(n, k) * 0.5 ** n;
  }
  return p;
}

const UMBRAL = 0.05;

export default function C3L8Visual() {
  const [confianza, setConfianza] = useState<0.9 | 0.95 | 0.99>(0.95);

  const stats = useMemo(() => {
    const n = C3_L8_RETS.length;
    const aciertos = C3_L8_RETS.filter((r) => r > 0).length;
    const p = aciertos / n;
    const z = confianza === 0.9 ? 1.645 : confianza === 0.99 ? 2.576 : 1.96;
    const se = Math.sqrt((p * (1 - p)) / n);
    return {
      n,
      aciertos,
      p: p * 100,
      li: Math.max(0, p - z * se) * 100,
      ls: Math.min(1, p + z * se) * 100,
      pValor: pValorBinomial(n, aciertos),
    };
  }, [confianza]);

  const significativo = stats.pValor < UMBRAL;
  // Escala 30 %–85 % para que el intervalo respire.
  const MIN = 30;
  const MAX = 85;
  const pos = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Winrate con intervalo: ¿habilidad o suerte?</p>
        <p className="academia-viz-sub">
          {stats.aciertos} días verdes de {stats.n} ({stats.p.toFixed(1)} %). El intervalo de confianza
          dice cuánto de eso es señal y cuánto ruido; el p-valor lo sentencia.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-filtros" role="group" aria-label="Nivel de confianza">
          {([0.9, 0.95, 0.99] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`academia-chip${confianza === c ? ' academia-chip-activo' : ''}`}
              onClick={() => setConfianza(c)}
            >
              {(c * 100).toFixed(0)} %
            </button>
          ))}
        </div>
        <div className="academia-stat-grid academia-stat-grid-4" style={{ margin: '0.8rem 0' }}>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Winrate</span>
            <span className="academia-stat-valor"><CountUp valor={stats.p} decimales={1} /> %</span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">IC {(confianza * 100).toFixed(0)} %</span>
            <span className="academia-stat-valor">
              <CountUp valor={stats.li} decimales={1} />–<CountUp valor={stats.ls} decimales={1} /> %
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">p-valor (H₀: p = 50 %)</span>
            <span className={`academia-stat-valor ${significativo ? 'academia-positivo' : 'academia-negativo'}`}>
              <CountUp valor={stats.pValor} decimales={3} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Veredicto (α = 5 %)</span>
            <span className={`academia-stat-valor ${significativo ? 'academia-positivo' : 'academia-negativo'}`}>
              {significativo ? 'Significativo' : 'No significativo'}
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', height: '56px', borderRadius: '8px', background: '#e5edf5' }} aria-label={`Intervalo ${stats.li.toFixed(1)} a ${stats.ls.toFixed(1)} por ciento`}>
          <div
            title="Azar (50 %)"
            style={{ position: 'absolute', left: `${pos(50)}%`, top: 0, bottom: 0, width: '2px', background: '#af3f4f' }}
          />
          <div
            title={`IC: ${stats.li.toFixed(1)}–${stats.ls.toFixed(1)} %`}
            style={{
              position: 'absolute',
              left: `${pos(stats.li)}%`,
              width: `${Math.max(2, pos(stats.ls) - pos(stats.li))}%`,
              top: '18px',
              height: '20px',
              borderRadius: '6px',
              background: significativo ? '#087951' : '#a96b16',
            }}
          />
          <div
            title={`Winrate: ${stats.p.toFixed(1)} %`}
            style={{
              position: 'absolute',
              left: `calc(${pos(stats.p)}% - 6px)`,
              top: '12px',
              width: '12px',
              height: '32px',
              borderRadius: '4px',
              background: '#172840',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.7 }}>
          <span>{MIN} %</span>
          <span style={{ color: '#af3f4f' }}>azar 50 %</span>
          <span>{MAX} %</span>
        </div>
        <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
          Lección: el IC incluye el 50 % y p ≈ {stats.pValor.toFixed(3)} ≥ 0.05 → con n = {stats.n} no se
          rechaza el azar. Un winrate alto sin significancia es anécdota, no edge.
        </p>
      </Reveal>
    </div>
  );
}
