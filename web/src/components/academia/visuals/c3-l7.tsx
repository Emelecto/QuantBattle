'use client';

// C3-L7 — Barras IS vs OOS (c3_l7.csv: 30 in-sample + 20 out-of-sample).
// Lo que brilla dentro de la muestra se apaga fuera: el gap IS−OOS
// delata el sobreajuste.

import { useMemo } from 'react';
import { CountUp, Reveal } from './charts';
import { C3_IS_OOS } from './lesson-data';

function resumen(rets: number[]) {
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / rets.length);
  return { n: rets.length, media: m * 100, sharpeA: sd === 0 ? 0 : (m / sd) * Math.sqrt(365) };
}

export default function C3L7Visual() {
  const { is, oos, gap } = useMemo(() => {
    const rIs = C3_IS_OOS.filter((p) => p.split === 'IS').map((p) => p.ret);
    const rOos = C3_IS_OOS.filter((p) => p.split === 'OOS').map((p) => p.ret);
    const a = resumen(rIs);
    const b = resumen(rOos);
    return { is: a, oos: b, gap: a.sharpeA - b.sharpeA };
  }, []);

  const maxAbs = Math.max(Math.abs(is.sharpeA), Math.abs(oos.sharpeA), 0.5);
  const filas = [
    { nombre: `In-sample (n=${is.n})`, media: is.media, sharpe: is.sharpeA, color: '#245ce5' },
    { nombre: `Out-of-sample (n=${oos.n})`, media: oos.media, sharpe: oos.sharpeA, color: '#a96b16' },
  ];

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">IS vs OOS: el espejismo del sobreajuste</p>
        <p className="academia-viz-sub">
          Misma estrategia, dos mundos: se calibra con {is.n} días IS y se juzga con {oos.n} días OOS
          que el modelo jamás vio. Solo el OOS cuenta.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-stat-grid academia-stat-grid-4" style={{ marginBottom: '0.8rem' }}>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sharpe IS</span>
            <span className={`academia-stat-valor ${is.sharpeA >= 0 ? 'academia-positivo' : 'academia-negativo'}`}>
              <CountUp valor={is.sharpeA} decimales={2} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sharpe OOS</span>
            <span className={`academia-stat-valor ${oos.sharpeA >= 0 ? 'academia-positivo' : 'academia-negativo'}`}>
              <CountUp valor={oos.sharpeA} decimales={2} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Gap IS−OOS</span>
            <span className="academia-stat-valor academia-negativo"><CountUp valor={gap} decimales={2} /></span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Veredicto</span>
            <span className="academia-stat-valor academia-negativo">Sobreajuste</span>
          </div>
        </div>
        {filas.map((f) => (
          <div key={f.nombre} style={{ marginBottom: '0.7rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600 }}>{f.nombre}</span>
              <span>
                media <CountUp valor={f.media} decimales={3} /> % · Sharpe <CountUp valor={f.sharpe} decimales={2} />
              </span>
            </div>
            <div style={{ height: '12px', borderRadius: '6px', background: '#dce6ef', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(Math.abs(f.sharpe) / maxAbs) * 100}%`,
                  borderRadius: '6px',
                  background: f.sharpe >= 0 ? f.color : '#af3f4f',
                }}
              />
            </div>
          </div>
        ))}
        <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
          Lección: un Sharpe IS de {is.sharpeA.toFixed(2)} que colapsa a {oos.sharpeA.toFixed(2)} en OOS
          (gap ≈ {gap.toFixed(2)}) es la firma del sobreajuste. Regla de oro: decide con OOS, nunca con IS.
        </p>
      </Reveal>
    </div>
  );
}
