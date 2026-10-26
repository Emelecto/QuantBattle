import Link from "next/link";
import pilot from "../../public/research/judge-pilot.json";
import { InteractiveProductPreview } from "@/components/research/InteractiveProductPreview";
import "./research-landing.css";

const stages = [
  { title: "Descarga los datos", text: "Cada ronda identifica su dataset y su versión. Entrena con train, compara decisiones con validation y genera predicciones para las filas de live.", detail: "El objetivo de live permanece privado durante la ronda. La ficha indica el origen de los datos y si son sintéticos." },
  { title: "Construye tu modelo", text: "Trabaja con tus propias herramientas. Registra el modelo, sus parámetros y la semilla para conservar el contexto del experimento.", detail: "El historial es privado. Puedes consultar tus envíos y exportar sus metadatos para documentar tu investigación." },
  { title: "Envía predicciones", text: "Sube un CSV con una predicción por fila. QuantLab comprueba identificadores, cobertura, duplicados y valores antes de aceptarlo.", detail: "El comprobante conserva la versión y la huella SHA-256 del archivo. Puedes revisar cuál envío quedó seleccionado." },
  { title: "Evalúa la evidencia", text: "Tras el cierre, compara el resultado con las referencias de la misma ronda. Spearman mide correlación de orden por era.", detail: "Spearman no mide rentabilidad. Los resultados de datasets o versiones diferentes no se deben sumar." },
];

function StageVisual({ index }: { index: number }) {
  if (index === 0) return <div className="research-stage-card"><div className="research-stage-card-head"><span>DATASET / VERSIÓN {pilot.version}</span><b>Datos sintéticos</b></div><h4>Archivos de la ronda</h4><dl className="research-stage-files"><div><dt>train</dt><dd>{pilot.row_counts.train.toLocaleString("es-CO")} filas · objetivo visible</dd></div><div><dt>validation</dt><dd>{pilot.row_counts.validation.toLocaleString("es-CO")} filas · comparación</dd></div><div><dt>live</dt><dd>{pilot.row_counts.live.toLocaleString("es-CO")} filas · objetivo oculto</dd></div></dl><small>Identificadores y versión documentados para cada archivo.</small></div>;
  if (index === 1) return <div className="research-stage-card"><div className="research-stage-card-head"><span>FICHA / MODELO</span><b>Experimento</b></div><h4>{pilot.model.algorithm}</h4><p>Selección por Spearman medio en validation; entrenamiento solo con train.</p><dl className="research-stage-facts"><div><dt>Variables</dt><dd>{pilot.model.n_features}</dd></div><div><dt>Iteraciones</dt><dd>{pilot.model.max_iter}</dd></div><div><dt>Semilla</dt><dd>{pilot.model.random_state}</dd></div></dl><small>Parámetros y contexto conservados junto al envío.</small></div>;
  if (index === 2) return <div className="research-stage-card"><div className="research-stage-card-head"><span>CONTROL / ENVÍO</span><b>Validado</b></div><h4>Predicciones comprobadas</h4><ul className="research-stage-checks"><li><span>✓</span>Una predicción por cada fila live</li><li><span>✓</span>Identificadores y cobertura completos</li><li><span>✓</span>Duplicados y valores inválidos rechazados</li><li><span>✓</span>Comprobante con huella SHA-256</li></ul><small>{pilot.row_counts.live.toLocaleString("es-CO")} predicciones evaluables tras el cierre.</small></div>;
  return <div className="research-stage-card"><div className="research-stage-card-head"><span>RESULTADO / RONDA 01</span><b>Publicada</b></div><h4>Spearman medio por era</h4><strong className="research-stage-score">{pilot.results.model.score.toLocaleString("es-CO", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}</strong><dl className="research-stage-files"><div><dt>Modelo</dt><dd>{pilot.results.model.score.toFixed(6)}</dd></div><div><dt>Azar</dt><dd>{pilot.results.random_reference.score.toFixed(6)}</dd></div><div><dt>Primera variable</dt><dd>{pilot.results.feature_reference.score.toFixed(6)}</dd></div></dl><small>Resultado sintético reproducido exactamente. Spearman no mide rentabilidad.</small></div>;
}

export default function Home() {
  return <div className="research-landing">
    <section className="research-hero research-wrap" aria-labelledby="research-title">
      <div className="research-hero-main">
        <h1 id="research-title">Del dataset a una<br /> <span>predicción verificable.</span></h1>
        <p className="research-hero-lead">Un laboratorio en español para construir modelos de machine learning financiero, enviar predicciones y evaluar sus resultados con un proceso documentado.</p>
        <div className="research-actions">
          <Link href="/app/tournaments" className="research-primary-action">Explorar torneos <span aria-hidden="true">↗</span></Link>
          <a href="/research/judge-pilot.json" className="research-secondary-action">Revisar el piloto técnico <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <aside className="research-hero-aside"><strong>Plataforma experimental</strong><p>Una iniciativa de Emilio Cardona López desarrollada en el semillero DeepFin de la Universidad EIA. El piloto mostrado usa datos sintéticos.</p></aside>
    </section>

    <section className="research-exhibit research-wrap" aria-labelledby="product-view-title">
      <div className="research-exhibit-caption"><h2 id="product-view-title">Vista del producto <span>· explora el piloto sintético</span></h2><div><Link href="/app">Abrir plataforma ↗</Link><a href="/research/judge-pilot.json">Evidencia del piloto ↗</a></div></div>
      <InteractiveProductPreview />
    </section>

    <section className="research-evidence research-wrap" aria-labelledby="evidence-title"><div><span className="research-label">Evidencia antes que promesas</span><h2 id="evidence-title">Un torneo que deja rastro de cada paso.</h2><p>El piloto sintético comprobó el recorrido completo: descarga pública, envío validado, cierre de la ronda, evaluación y clasificación pública.</p>{/* La navegación cliente de Next elimina el fragmento en esta ruta. */}<a href="/docs#evaluacion" className="research-text-link">Leer metodología y resultados ↗</a></div><div className="research-evidence-list"><div><b>Datos</b><p>Dataset versionado; el objetivo live permanece oculto durante la ronda.</p></div><div><b>Envío</b><p>Los CSV inválidos se rechazan y cada envío válido deja un comprobante.</p></div><div><b>Cierre</b><p>La puntuación se libera después del plazo; los envíos tardíos se rechazan.</p></div><div><b>Resultado</b><p>El score se reprodujo exactamente desde los datos registrados.</p></div><aside><strong>Alcance del piloto:</strong> mercado totalmente artificial, una ronda y una cuenta técnica. No demuestra capacidad de pronosticar mercados reales ni adopción por usuarios externos.</aside></div></section>

    <section className="research-process research-wrap" aria-labelledby="process-title"><div className="research-process-heading"><span className="research-label">Dentro de QuantLab</span><h2 id="process-title">Del archivo al resultado, con contexto.</h2><p>Este recorrido usa los valores registrados en el piloto sintético. Cada etapa deja evidencia consultable.</p></div><ol className="research-stages">{stages.map((stage, index) => <li key={stage.title}><div className="research-stage-copy"><span>0{index + 1}</span><h3>{stage.title}</h3><p>{stage.text}</p><details><summary>Qué debes tener en cuenta</summary><p>{stage.detail}</p></details></div><figure><StageVisual index={index} /><figcaption>Vista esquemática · datos del piloto sintético</figcaption></figure></li>)}</ol><p className="research-footnote">Los valores proceden del registro público del piloto; la plataforma identifica cada ronda y versión por separado.</p></section>

    <section className="research-end"><div className="research-wrap"><h2>Tu próxima hipótesis<br />empieza aquí.</h2><div><p>Consulta las rondas disponibles, revisa sus datos y prepara tu primer envío.</p><Link href="/app/tournaments" className="research-primary-action">Explorar torneos <span aria-hidden="true">↗</span></Link><small>Plataforma experimental de investigación. No es asesoría financiera.</small></div></div></section>
  </div>;
}
