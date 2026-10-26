'use client';

// C3-L5 — Heatmap de correlación BTC/ETH/SOL (c3_l5.csv, 50 sesiones).
// BTC–ETH se mueven juntos; SOL va por libre y diversifica.

import { useMemo } from 'react';
import { CountUp, Reveal } from './charts';
import { C3_TRES } from './lesson-data';

const ACTIVOS = ['BTC', 'ETH', 'SOL'] as const;

function correlacion(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

function desviacion(v: number[]): number {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

function colorCelda(v: number): string {
  // Ámbar para correlación positiva, azul para negativa; intensidad ∝ |v|.
  const a = (0.1 + 0.9 * Math.abs(v)).toFixed(2);
  return v >= 0 ? `rgba(245, 158, 11, ${a})` : `rgba(94, 106, 210, ${a})`;
}

export default function C3L5Visual() {
  const { matriz, vols } = useMemo(() => {
    const cols: Record<string, number[]> = {
      BTC: C3_TRES.map((f) => f[0]),
      ETH: C3_TRES.map((f) => f[1]),
      SOL: C3_TRES.map((f) => f[2]),
    };
    const m: Record<string, number> = {};
    for (const a of ACTIVOS) for (const b of ACTIVOS) m[`${a}-${b}`] = correlacion(cols[a], cols[b]);
    return {
      matriz: m,
      vols: ACTIVOS.map((a) => ({ activo: a, std: desviacion(cols[a]) * 100 })),
    };
  }, []);

  const btcEth = matriz['BTC-ETH'];
  const maxVol = Math.max(...vols.map((v) => v.std));

  return (
    <section className="academia-visual" aria-label="Visual: correlación BTC, ETH y SOL">
      <Reveal>
        <h3 className="academia-section-title">Mapa de correlación · retornos diarios</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.8, margin: '0 0 1rem' }}>
          {C3_TRES.length} sesiones · BTC–ETH se mueven casi juntos (
          <CountUp valor={btcEth} decimales={2} />
          ); SOL va por libre y diversifica.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <table className="academia-heatmap" style={{ borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.95rem' }}>
            <thead>
              <tr>
                <th style={{ padding: '0.4rem 0.6rem' }} />
                {ACTIVOS.map((a) => (
                  <th key={a} style={{ padding: '0.4rem 0.6rem' }}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIVOS.map((fila) => (
                <tr key={fila}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>{fila}</th>
                  {ACTIVOS.map((col) => {
                    const v = matriz[`${fila}-${col}`];
                    return (
                      <td
                        key={col}
                        title={`${fila}–${col}: ${v.toFixed(3)}`}
                        style={{
                          padding: '0.7rem 1rem',
                          borderRadius: '0.5rem',
                          background: colorCelda(v),
                          color: Math.abs(v) > 0.5 ? '#111' : 'inherit',
                          fontWeight: 700,
                          border: '2px solid transparent',
                        }}
                      >
                        {v.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ minWidth: '220px', flex: 1 }}>
            <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Volatilidad diaria (desviación estándar, %)</h4>
            {vols.map((v) => (
              <div key={v.activo} style={{ marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600 }}>{v.activo}</span>
                  <span>{v.std.toFixed(2)} %</span>
                </div>
                <div style={{ height: '10px', borderRadius: '6px', background: '#dce6ef', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v.std / maxVol) * 100}%`, borderRadius: '6px', background: '#245ce5' }} />
                </div>
              </div>
            ))}
            <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
              Lección: correlación alta ≠ cobertura. Con BTC–ETH ≈ 0.87, añadir ETH a BTC apenas diversifica;
              SOL (ρ ≈ 0) sí reduce el riesgo conjunto.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
