'use client';

// C3-L6 — Comparador Sharpe vs Sortino (c3_l6.csv, 50 retornos diarios).
// El Sortino solo castiga la volatilidad mala; por eso supera al Sharpe
// cuando los días verdes son más violentos que los rojos.

import { useMemo, useState } from 'react';
import { CountUp, Reveal } from './charts';
import { C3_L6_RETS } from './lesson-data';

const DIAS_ANIO = 365;

function media(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function desviacion(v: number[]): number {
  const m = media(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

export default function C3L6Visual() {
  const [anualizado, setAnualizado] = useState(true);

  const stats = useMemo(() => {
    const m = media(C3_L6_RETS);
    const sd = desviacion(C3_L6_RETS);
    const downside = Math.sqrt(
      C3_L6_RETS.filter((r) => r < 0).reduce((s, r) => s + r * r, 0) / C3_L6_RETS.length,
    );
    const sharpeD = sd === 0 ? 0 : m / sd;
    const sortinoD = downside === 0 ? 0 : m / downside;
    const f = Math.sqrt(DIAS_ANIO);
    return {
      n: C3_L6_RETS.length,
      aciertos: C3_L6_RETS.filter((r) => r > 0).length,
      mediaDiaria: m * 100,
      sharpeD,
      sortinoD,
      sharpeA: sharpeD * f,
      sortinoA: sortinoD * f,
    };
  }, []);

  const sharpe = anualizado ? stats.sharpeA : stats.sharpeD;
  const sortino = anualizado ? stats.sortinoA : stats.sortinoD;
  const maxAbs = Math.max(Math.abs(sharpe), Math.abs(sortino), 0.5);

  const barra = (valor: number, color: string) => (
    <div style={{ marginBottom: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span style={{ fontWeight: 600 }}>{color === '#245ce5' ? 'Sharpe' : 'Sortino'}</span>
        <span><CountUp valor={valor} decimales={2} /></span>
      </div>
      <div style={{ height: '12px', borderRadius: '6px', background: '#dce6ef', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${(Math.abs(valor) / maxAbs) * 100}%`,
            borderRadius: '6px',
            background: valor >= 0 ? color : '#af3f4f',
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Sharpe vs Sortino: ¿toda volatilidad es mala?</p>
        <p className="academia-viz-sub">
          {stats.n} retornos diarios ({stats.aciertos} días verdes). El Sharpe divide por la volatilidad total;
          el Sortino solo por la de los días rojos. Cambia de escala y mira la diferencia.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-filtros" role="group" aria-label="Escala del ratio">
          {([false, true] as const).map((a) => (
            <button
              key={String(a)}
              type="button"
              className={`academia-chip${anualizado === a ? ' academia-chip-activo' : ''}`}
              onClick={() => setAnualizado(a)}
            >
              {a ? 'Anualizado ×√365' : 'Diario'}
            </button>
          ))}
        </div>
        <div className="academia-stat-grid academia-stat-grid-4" style={{ margin: '0.8rem 0' }}>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Media diaria</span>
            <span className="academia-stat-valor"><CountUp valor={stats.mediaDiaria} decimales={3} /> %</span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sharpe {anualizado ? 'anual' : 'diario'}</span>
            <span className={`academia-stat-valor ${sharpe >= 0 ? 'academia-positivo' : 'academia-negativo'}`}>
              <CountUp valor={sharpe} decimales={2} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sortino {anualizado ? 'anual' : 'diario'}</span>
            <span className={`academia-stat-valor ${sortino >= 0 ? 'academia-positivo' : 'academia-negativo'}`}>
              <CountUp valor={sortino} decimales={2} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Prima Sortino/Sharpe</span>
            <span className="academia-stat-valor">×<CountUp valor={sortino / sharpe} decimales={2} /></span>
          </div>
        </div>
        {barra(sharpe, '#245ce5')}
        {barra(sortino, '#a96b16')}
        <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
          Lección: el Sortino (≈ {sortino.toFixed(2)}) supera al Sharpe (≈ {sharpe.toFixed(2)}) porque
          la dispersión alcista no se castiga. Para estrategias asimétricas, el Sharpe subestima la calidad.
        </p>
      </Reveal>
    </div>
  );
}
