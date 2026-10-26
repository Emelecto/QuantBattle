'use client';

import { useState } from 'react';

// L6 — Auditoría SMA: 20 variantes (fast, slow) con Sharpe in-sample vs out-of-sample.
// Filas reales de web/content/cursos/fundamentos/data/c1_l6_sma20.csv.

type Veredicto = 'robusta' | 'sobreajustada' | 'débil';

interface Fila {
  fast: number;
  slow: number;
  sharpeIs: number;
  sharpeOos: number;
  gap: number;
  veredicto: Veredicto;
}

const FILAS: Fila[] = [
  { fast: 3, slow: 15, sharpeIs: 2.012, sharpeOos: -0.559, gap: 2.572, veredicto: 'sobreajustada' },
  { fast: 4, slow: 18, sharpeIs: 0.903, sharpeOos: 0.903, gap: 0.001, veredicto: 'robusta' },
  { fast: 5, slow: 20, sharpeIs: -0.655, sharpeOos: 0.989, gap: -1.644, veredicto: 'robusta' },
  { fast: 5, slow: 25, sharpeIs: -0.45, sharpeOos: 2.482, gap: -2.932, veredicto: 'robusta' },
  { fast: 6, slow: 22, sharpeIs: 0.492, sharpeOos: 1.684, gap: -1.192, veredicto: 'robusta' },
  { fast: 7, slow: 28, sharpeIs: -1.294, sharpeOos: 2.217, gap: -3.51, veredicto: 'robusta' },
  { fast: 8, slow: 30, sharpeIs: 2.07, sharpeOos: 1.317, gap: 0.753, veredicto: 'robusta' },
  { fast: 8, slow: 35, sharpeIs: 1.415, sharpeOos: 1.282, gap: 0.133, veredicto: 'robusta' },
  { fast: 10, slow: 30, sharpeIs: 2.474, sharpeOos: 1.317, gap: 1.156, veredicto: 'débil' },
  { fast: 10, slow: 40, sharpeIs: 0.98, sharpeOos: -0.27, gap: 1.25, veredicto: 'débil' },
  { fast: 10, slow: 50, sharpeIs: -2.847, sharpeOos: -0.125, gap: -2.721, veredicto: 'débil' },
  { fast: 12, slow: 35, sharpeIs: 1.304, sharpeOos: 1.282, gap: 0.022, veredicto: 'robusta' },
  { fast: 12, slow: 45, sharpeIs: 1.345, sharpeOos: -1.563, gap: 2.908, veredicto: 'débil' },
  { fast: 12, slow: 60, sharpeIs: -3.23, sharpeOos: -3.02, gap: -0.209, veredicto: 'débil' },
  { fast: 15, slow: 40, sharpeIs: -1.641, sharpeOos: -0.27, gap: -1.371, veredicto: 'débil' },
  { fast: 15, slow: 55, sharpeIs: -4.422, sharpeOos: -1.155, gap: -3.267, veredicto: 'débil' },
  { fast: 15, slow: 70, sharpeIs: -2.863, sharpeOos: 1.757, gap: -4.62, veredicto: 'robusta' },
  { fast: 18, slow: 60, sharpeIs: 0.03, sharpeOos: -3.02, gap: 3.05, veredicto: 'débil' },
  { fast: 20, slow: 80, sharpeIs: 0.063, sharpeOos: -2.742, gap: 2.804, veredicto: 'débil' },
  { fast: 20, slow: 100, sharpeIs: 0.0, sharpeOos: 0.0, gap: 0.0, veredicto: 'débil' },
];

type Filtro = 'todas' | Veredicto;

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'todas', etiqueta: 'Todas (20)' },
  { id: 'robusta', etiqueta: 'Robusta' },
  { id: 'sobreajustada', etiqueta: 'Sobreajustada' },
  { id: 'débil', etiqueta: 'Débil' },
];

const COLOR: Record<Veredicto, string> = {
  robusta: '#087951',
  sobreajustada: '#af3f4f',
  débil: '#a3a3a3',
};

export default function C1L6Visual() {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const filas = FILAS.filter((f) => filtro === 'todas' || f.veredicto === filtro);

  return (
    <section className="academia-visual" aria-label="Visual: auditoría de 20 variantes SMA">
      <h3 className="academia-section-title">Auditoría SMA: ¿el Sharpe sobrevive fuera de muestra?</h3>
      <p style={{ fontSize: '0.9rem', opacity: 0.8, margin: '0 0 1rem' }}>
        gap = Sharpe IS − Sharpe OOS. La (3, 15) brilla en muestra (2.01) y se estrella fuera
        (−0.56): sobreajuste de manual.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className="academia-btn academia-btn-secondary"
            style={{
              outline: filtro === f.id ? '2px solid #a96b16' : 'none',
              fontWeight: filtro === f.id ? 700 : 400,
            }}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          className="academia-table"
          style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}
        >
          <thead>
            <tr>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Fast</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Slow</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Sharpe IS</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Sharpe OOS</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Gap</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Veredicto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={`${f.fast}-${f.slow}`}>
                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>{f.fast}</td>
                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>{f.slow}</td>
                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>
                  {f.sharpeIs.toFixed(3)}
                </td>
                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>
                  {f.sharpeOos.toFixed(3)}
                </td>
                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>
                  {f.gap.toFixed(3)}
                </td>
                <td style={{ padding: '0.35rem 0.6rem' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.1rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: `${COLOR[f.veredicto]}22`,
                      color: COLOR[f.veredicto],
                      border: `1px solid ${COLOR[f.veredicto]}`,
                    }}
                  >
                    {f.veredicto}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.8rem', opacity: 0.75 }}>
        Mostrando {filas.length} de 20 variantes.
      </p>
    </section>
  );
}
