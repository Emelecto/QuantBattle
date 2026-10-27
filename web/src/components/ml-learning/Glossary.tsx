"use client";
import { useState } from "react";
import Link from "next/link";
import { Workspace } from "./Workspace";

export function Glossary() {
  const [bias, setBias] = useState(0),
    [amplitude, setAmplitude] = useState(2),
    [cut, setCut] = useState(6),
    [errors, setErrors] = useState([2, 3, 4, 2.5]);
  const actual = [-2, 1, 3, -1],
    predicted = [-1, 0, 2, 0].map((x) => x + bias),
    mae = actual.reduce((sum, v, i) => sum + Math.abs(v - predicted[i]), 0) / 4;
  const series = [-1, 0.4, 1.6, -0.6, 0.2, 1.4, -1.2, 0.5].map(
      (x) => x * amplitude,
    ),
    mean = series.reduce((s, x) => s + x, 0) / series.length,
    vol = Math.sqrt(
      series.reduce((s, x) => s + (x - mean) ** 2, 0) / series.length,
    );
  const scores = errors.map((x) => (3 - x) / 3),
    total = scores.reduce((s, x) => s + x, 0) / 4;
  return (
    <Workspace
      title="Glosario visual"
      intro="Un mismo torneo ilustrativo de retornos, con datos inventados para aprender. Los controles no cambian envíos ni métricas oficiales."
    >
      <nav className="ml-toolbar" aria-label="Conceptos">
        <a href="#mae">MAE</a>
        <a href="#temporal">Validación temporal</a>
        <a href="#volatility">Volatilidad</a>
        <a href="#ranking">Ranking</a>
      </nav>
      <section className="ml-section" id="mae">
        <h2>MAE: tamaño medio del error</h2>
        <p>
          Es la media de las distancias absolutas entre lo que predices y lo que
          ocurre. Aquí expresamos los retornos en puntos porcentuales: 2
          representa un retorno decimal de 0.02.
        </p>
        <label>
          Desplaza todas tus predicciones: {bias.toFixed(1)} pp
          <input
            type="range"
            min={-4}
            max={4}
            step={0.1}
            value={bias}
            onChange={(e) => setBias(Number(e.target.value))}
          />
        </label>
        <div className="ml-table-wrap">
          <table>
            <caption>Cuatro activos sintéticos de una ronda</caption>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Observado (pp)</th>
                <th>Predicción (pp)</th>
                <th>Error (pp)</th>
              </tr>
            </thead>
            <tbody>
              {actual.map((x, i) => (
                <tr key={i}>
                  <td>{String.fromCharCode(65 + i)}</td>
                  <td>{x}</td>
                  <td>{predicted[i].toFixed(1)}</td>
                  <td>{Math.abs(x - predicted[i]).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p aria-live="polite">
          MAE = {mae.toFixed(2)} pp. La referencia cero tiene MAE 1.75 pp en
          esta ronda ilustrativa.
        </p>
        <Link href="/app/learn/missions">Practicar con la referencia cero</Link>
      </section>
      <section className="ml-section" id="temporal">
        <h2>Validación temporal: aprender antes de evaluar</h2>
        <p>
          Ordena los datos según cuándo estaban disponibles. Entrena con el
          pasado, elige con validation y reserva live para el futuro. Si una
          etiqueta abarca días posteriores, purga las observaciones que cruzan
          la frontera.
        </p>
        <label>
          Último periodo de train: {cut}
          <input
            type="range"
            min={3}
            max={7}
            step={1}
            value={cut}
            onChange={(e) => setCut(Number(e.target.value))}
          />
        </label>
        <div
          className="ml-table-wrap"
          role="region"
          tabIndex={0}
          aria-label="Cronología de entrenamiento y validación, desplazable"
        >
          <svg
            className="ml-plot ml-timeline"
            viewBox="0 0 600 90"
            role="img"
            aria-label={`Train periodos 1 a ${cut}, purga ${cut + 1}, validation ${cut + 2} a 10, live 11 y 12`}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <g key={i}>
                <rect
                  x={10 + i * 49}
                  y={25}
                  width={43}
                  height={45}
                  rx={4}
                  fill={
                    i < cut
                      ? "#245ce5"
                      : i === cut
                        ? "#a9bbcc"
                        : i < 10
                          ? "#16634d"
                          : "#172840"
                  }
                />
                <text
                  x={31 + i * 49}
                  y={54}
                  textAnchor="middle"
                  fill={i === cut ? "#172840" : "white"}
                  fontSize={14}
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <p className="ml-muted">
          Train azul · Purga gris · Validation verde · Live azul oscuro.
          Desplaza la cronología horizontalmente para recorrer todos los
          periodos.
        </p>
        <p className="ml-muted">
          El diagrama ilustra una purga de un periodo; el protocolo real
          determina cuántas observaciones retirar.
        </p>
        <Link href="/app/academia/python/7">Estudiar walk-forward</Link>
      </section>
      <section className="ml-section" id="volatility">
        <h2>Volatilidad: cuánto varían los retornos</h2>
        <p>
          La desviación estándar resume la dispersión. Puedes tener una media
          pequeña con movimientos grandes. El ejemplo utiliza desviación
          poblacional y no está anualizado.
        </p>
        <label>
          Escala del movimiento: {amplitude.toFixed(1)}
          <input
            type="range"
            min={0.2}
            max={4}
            step={0.1}
            value={amplitude}
            onChange={(e) => setAmplitude(Number(e.target.value))}
          />
        </label>
        <svg
          className="ml-plot"
          viewBox="0 0 600 180"
          role="img"
          aria-label="Retornos sintéticos alrededor de cero"
        >
          <line x1={20} y1={90} x2={580} y2={90} stroke="#a9bbcc" />
          {series.map((x, i) => (
            <g key={i}>
              <rect
                x={30 + i * 70}
                y={x > 0 ? 90 - x * 10 : 90}
                width={42}
                height={Math.abs(x * 10)}
                fill={x >= 0 ? "#245ce5" : "#9b3934"}
              />
              <text
                x={51 + i * 70}
                y={165}
                textAnchor="middle"
                fontSize={12}
                fill="#172840"
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
        <p aria-live="polite">
          Media: {mean.toFixed(2)} pp · Volatilidad: {vol.toFixed(2)} pp.
        </p>
        <Link href="/app/academia/fundamentos/3">Estudiar volatilidad</Link>
      </section>
      <section id="ranking">
        <h2>Score y ranking: cuatro rondas comparables</h2>
        <p>
          En retornos, score = (MAE cero − MAE modelo) / max(MAE cero, 0.5 pp).
          Usamos una referencia ilustrativa de 3 pp en cada ronda. Un score
          positivo mejora esa referencia.
        </p>
        <div className="ml-fields">
          {errors.map((x, i) => (
            <label key={i}>
              MAE modelo · ronda {i + 1}: {x.toFixed(1)} pp
              <input
                type="range"
                min={0}
                max={6}
                step={0.1}
                value={x}
                onChange={(e) =>
                  setErrors((old) =>
                    old.map((v, j) => (j === i ? Number(e.target.value) : v)),
                  )
                }
              />
              <span>Score {scores[i].toFixed(3)}</span>
            </label>
          ))}
        </div>
        <p className="ml-notice" aria-live="polite">
          Score semanal ilustrativo: {total.toFixed(3)}. La clasificación
          oficial requiere cuatro envíos válidos y puntuados; un empate se
          resuelve por menor MAE medio.
        </p>
        <p>
          Spearman, usado en práctica sintética, mide orden relativo por era y
          tiene otra escala. No se mezcla con este score ni se interpreta como
          rentabilidad.
        </p>
        <Link href="/app/tournaments/guide">
          Consultar las reglas completas
        </Link>
      </section>
    </Workspace>
  );
}
