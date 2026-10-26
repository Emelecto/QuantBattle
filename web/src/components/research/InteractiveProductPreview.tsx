"use client";

import { useState } from "react";
import Link from "next/link";
import pilot from "../../../public/research/judge-pilot.json";

const steps = ["Dataset", "Modelo", "Envío", "Resultado"] as const;
const formatRows = (value: number) => value.toLocaleString("es-CO");
const formatScore = (value: number) => value.toLocaleString("es-CO", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function PreviewBody({ step }: { step: number }) {
  if (step === 0) return (
    <div className="research-preview-grid" id="research-preview-panel">
      <div className="research-preview-panel"><span>Dataset versionado</span><h4>Archivos para entrenar y predecir</h4><p>Train y validation permiten desarrollar el modelo. El objetivo de live permaneció oculto durante la ronda.</p><dl className="research-preview-metrics"><div><dt>Variables</dt><dd>{pilot.generator.n_features}</dd></div><div><dt>Activos simulados</dt><dd>{pilot.generator.n_assets}</dd></div><div><dt>Eras generadas</dt><dd>{pilot.generator.n_eras}</dd></div></dl><ul><li>train <b>{formatRows(pilot.row_counts.train)} filas · objetivo visible</b></li><li>validation <b>{formatRows(pilot.row_counts.validation)} filas · comparación</b></li><li>live <b>{formatRows(pilot.row_counts.live)} filas · objetivo oculto</b></li></ul></div>
      <div className="research-preview-panel"><span>Ficha de la ronda</span><h4>Una versión identificable</h4><p>Los tres archivos pertenecen a la misma versión. Esa referencia acompaña el envío y permite reproducir la evaluación.</p><div className="research-preview-count">{formatRows(pilot.row_counts.live)} <small>filas live</small></div><div className="research-preview-version">Versión del dataset <code>{pilot.version}</code></div><p>Estos datos son sintéticos; no representan un mercado real.</p></div>
    </div>
  );
  if (step === 1) return (
    <div className="research-preview-grid" id="research-preview-panel">
      <div className="research-preview-panel"><span>Modelo documentado</span><h4>{pilot.model.algorithm}</h4><p>El piloto entrenó solo con train y seleccionó la configuración por Spearman medio en validation.</p><dl className="research-preview-metrics"><div><dt>Variables</dt><dd>{pilot.model.n_features}</dd></div><div><dt>Iteraciones</dt><dd>{pilot.model.max_iter}</dd></div><div><dt>Semilla</dt><dd>{pilot.model.random_state}</dd></div></dl><div className="research-demo-evidence"><strong>Configuración elegida</strong><span>{pilot.model.selected_max_leaf_nodes} nodos hoja máximos</span></div></div>
      <div className="research-preview-panel"><span>Método</span><h4>Separar antes de medir</h4><p>La selección usa validation; live queda reservado para la evaluación después del cierre.</p><ol className="research-demo-method"><li><b>01</b><span>Entrenar con train</span></li><li><b>02</b><span>Elegir con validation</span></li><li><b>03</b><span>Predecir las filas live</span></li></ol><p>El registro conserva parámetros y contexto del experimento.</p></div>
    </div>
  );
  if (step === 2) return (
    <div className="research-preview-grid" id="research-preview-panel">
      <div className="research-preview-panel"><span>Control del archivo</span><h4>Predicciones comprobadas</h4><p>El piloto verificó el archivo antes de aceptarlo y rechazó un CSV inválido.</p><div className="research-preview-count">{formatRows(pilot.row_counts.live)} <small>predicciones live</small></div><ul className="research-demo-checks"><li><b>✓</b><span>Identificadores y cobertura completos</span></li><li><b>✓</b><span>Una predicción por cada fila live</span></li><li><b>✓</b><span>CSV inválido rechazado</span></li></ul></div>
      <div className="research-preview-panel"><span>Registro del envío</span><h4>Comprobante verificable</h4><p>El envío válido quedó vinculado a la versión del dataset y a una huella SHA-256.</p><div className="research-preview-version">Dataset asociado <code>{pilot.version}</code></div><div className="research-demo-evidence"><strong>Evaluación protegida</strong><span>Sin puntuación pública antes del cierre</span></div><p>Esta vista resume una prueba técnica; no envía archivos reales.</p></div>
    </div>
  );
  return (
    <div className="research-preview-grid" id="research-preview-panel">
      <div className="research-preview-panel"><span>Ronda finalizada</span><h4>Spearman medio por era</h4><p>La puntuación se publicó después del cierre y se reprodujo exactamente desde los datos registrados.</p><div className="research-preview-result-score">{formatScore(pilot.results.model.score)}</div><div className="research-demo-chart" role="img" aria-label="Correlación por era: 20 valores positivos y negativos del piloto sintético"><div className="research-demo-chart-axis" />{pilot.results.model.per_era.map((value, index) => <span key={index} className={`research-demo-bar ${value < 0 ? "is-negative" : "is-positive"}`} style={{ left: `${(index + 0.5) * 5}%`, height: `${Math.max(3, Math.abs(value) / 0.14 * 48)}%`, animationDelay: `${index * 18}ms` }} title={`Era ${index + 1}: ${value.toFixed(4)}`} />)}</div><div className="research-demo-chart-labels"><span>Era 01</span><span>Era 20</span></div></div>
      <div className="research-preview-panel"><span>Referencias · misma ronda</span><h4>Comparar con contexto</h4><p>El score mide correlación de orden. No mide rentabilidad ni demuestra predicción en mercados reales.</p><dl className="research-demo-results"><div><dt>Modelo</dt><dd>{formatScore(pilot.results.model.score)}</dd></div><div><dt>Azar</dt><dd>{formatScore(pilot.results.random_reference.score)}</dd></div><div><dt>Primera variable</dt><dd>{formatScore(pilot.results.feature_reference.score)}</dd></div></dl><p>Datos sintéticos · 20 eras evaluadas.</p></div>
    </div>
  );
}

export function InteractiveProductPreview() {
  const [step, setStep] = useState(0);
  return (
    <div className="research-product-preview" data-ui data-preview-step={step}>
      <aside className="research-preview-side"><div className="research-preview-brand">Quant<span>Lab</span></div><p>Recorrido del piloto</p><nav aria-label="Explorar vista del producto">{steps.map((label, index) => <button type="button" key={label} className={step === index ? "selected" : ""} aria-pressed={step === index} aria-controls="research-preview-panel" onClick={() => setStep(index)}>{label}</button>)}</nav><small>DeepFin · Universidad EIA</small></aside>
      <div className="research-preview-content">
        <div className="research-preview-top">Vista guiada &nbsp; / &nbsp; <strong>Piloto sintético</strong><span>{step + 1} de {steps.length}</span></div>
        <div className="research-preview-heading"><div><span>Piloto técnico · datos sintéticos</span><h3>{step === 0 ? "Ronda de práctica" : steps[step]}</h3><p>Versión {pilot.version} · Ronda {pilot.round_number} · experimento documentado</p></div><b>Finalizada</b></div>
        <div className="research-preview-steps" role="group" aria-label="Etapas del piloto">{steps.map((label, index) => <button type="button" key={label} className={step === index ? "active" : ""} aria-label={`0${index + 1} ${label}`} aria-pressed={step === index} aria-controls="research-preview-panel" onClick={() => setStep(index)}><span>0{index + 1}</span>{label}</button>)}</div>
        <div key={step} className="research-preview-state"><PreviewBody step={step} /></div>
        <div className="research-preview-foot"><span><strong>{steps[step]}.</strong> {step === 3 ? "Resultado sintético reproducido exactamente." : "Explora el recorrido del piloto técnico."}</span>{step < steps.length - 1 ? <button type="button" onClick={() => setStep(step + 1)}>Siguiente: {steps[step + 1]} ↗</button> : <Link href="/app/tournaments">Explorar torneos ↗</Link>}</div>
      </div>
    </div>
  );
}
