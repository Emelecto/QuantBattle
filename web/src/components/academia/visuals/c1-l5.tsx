'use client';

// L5 — Correlación y beta: heatmap 3×3 BTC/ETH/SOL + barras de volatilidad.
// Datos inline ya calculados (60 sesiones, web/content/cursos/fundamentos/data/c1_l5_btc_eth_sol.csv).

const CORR: { par: [string, string]; valor: number }[] = [
  { par: ['BTC', 'ETH'], valor: 0.914 },
  { par: ['BTC', 'SOL'], valor: 0.742 },
  { par: ['ETH', 'SOL'], valor: 0.705 },
];

const ACTIVOS = ['BTC', 'ETH', 'SOL'] as const;

const VOL: { activo: string; std: number }[] = [
  { activo: 'BTC', std: 2.6 },
  { activo: 'ETH', std: 2.47 },
  { activo: 'SOL', std: 2.6 },
];

function corrDe(a: string, b: string): number {
  if (a === b) return 1;
  const fila = CORR.find(
    (c) => (c.par[0] === a && c.par[1] === b) || (c.par[0] === b && c.par[1] === a),
  );
  return fila ? fila.valor : 0;
}

function colorCelda(v: number): string {
  // Intensidad ámbar proporcional a la correlación (diagonal = máxima).
  const alpha = (0.12 + 0.88 * v).toFixed(2);
  return `rgba(245, 158, 11, ${alpha})`;
}

export default function C1L5Visual() {
  const maxVol = Math.max(...VOL.map((v) => v.std));
  return (
    <section className="academia-visual" aria-label="Visual: correlaciones BTC, ETH y SOL">
      <h3 className="academia-section-title">Mapa de correlación · retornos diarios (%)</h3>
      <p style={{ fontSize: '0.9rem', opacity: 0.8, margin: '0 0 1rem' }}>
        60 sesiones · BTC–ETH se mueven casi juntos (0.914); SOL diversifica un poco más.
      </p>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <table
          className="academia-heatmap"
          style={{ borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.95rem' }}
        >
          <thead>
            <tr>
              <th style={{ padding: '0.4rem 0.6rem' }} />
              {ACTIVOS.map((a) => (
                <th key={a} style={{ padding: '0.4rem 0.6rem' }}>
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIVOS.map((fila) => (
              <tr key={fila}>
                <th style={{ padding: '0.4rem 0.6rem' }}>{fila}</th>
                {ACTIVOS.map((col) => {
                  const v = corrDe(fila, col);
                  return (
                    <td
                      key={col}
                      title={`${fila}–${col}: ${v.toFixed(3)}`}
                      style={{
                        padding: '0.7rem 1rem',
                        borderRadius: '0.5rem',
                        background: colorCelda(v),
                        color: v > 0.6 ? '#111' : 'inherit',
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
          <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>
            Volatilidad diaria (desviación estándar, %)
          </h4>
          {VOL.map((v) => (
            <div key={v.activo} style={{ marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 600 }}>{v.activo}</span>
                <span>{v.std.toFixed(2)} %</span>
              </div>
              <div
                style={{
                  height: '10px',
                  borderRadius: '6px',
                  background: '#dce6ef',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${((v.std / maxVol) * 100).toFixed(1)}%`,
                    height: '100%',
                    borderRadius: '6px',
                    background: 'linear-gradient(90deg, #a96b16, #af3f4f)',
                  }}
                />
              </div>
            </div>
          ))}
          <p style={{ fontSize: '0.8rem', opacity: 0.75 }}>
            BTC y SOL son los más nerviosos; ETH, un poco menos. Alta correlación + alta
            volatilidad = se hunden juntos.
          </p>
        </div>
      </div>
    </section>
  );
}
