import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import "./research-landing.css";

const stages = [
  { title: "Descarga los datos", file: "train · validation · live", text: "Cada ronda identifica su dataset y su versión. Entrena con train, compara decisiones con validation y genera predicciones para las filas de live.", detail: "Los resultados objetivo de live permanecen privados durante la ronda. Consulta la ficha para conocer el origen de los datos y si son sintéticos." },
  { title: "Construye tu modelo", file: "Tu entorno. Tu hipótesis.", text: "Trabaja con tus propias herramientas. Registra el nombre del modelo, sus parámetros y la semilla para conservar el contexto de cada experimento.", detail: "El historial es privado. Puedes consultar tus envíos y exportar sus metadatos para documentar tu investigación." },
  { title: "Envía predicciones", file: "id,prediction", text: "Sube un CSV con una predicción por fila. QuantLab comprueba identificadores, cobertura, duplicados y valores antes de aceptar el envío.", detail: "Conserva el comprobante y la huella SHA-256 del archivo. Revisa en la ronda cuál de tus envíos quedó seleccionado antes del cierre." },
  { title: "Evalúa la evidencia", file: "Cierre → evaluación → resultados", text: "Después del cierre y la evaluación, compara el resultado con las referencias de esa misma ronda. El score mide correlación de orden por era.", detail: "Spearman no mide rentabilidad. Los resultados de distintas versiones o datasets no deben sumarse como si fueran equivalentes." },
];

export default function Home() {
  return <div className="research-landing">
    <section className="research-hero research-wrap">
      <h1>Investiga.<br /><span>Predice.</span></h1>
      <div className="research-hero-bottom">
        <p>Un laboratorio de machine learning financiero en español. Construye modelos y pon tus predicciones a prueba en torneos.</p>
        <div className="research-actions">
          <Link href="/app/tournaments" className={buttonClasses("primary", "lg")}>Explorar torneos ML <span aria-hidden="true">↗</span></Link>
          <Link href="/docs#evaluacion" className="research-text-link">Ver evaluación técnica</Link>
        </div>
      </div>
      <p className="research-origin">QuantLab · Semillero DeepFin · Universidad EIA</p>
    </section>
    <section className="research-process research-wrap" aria-labelledby="process-title">
      <div className="research-section-heading"><h2 id="process-title">De datos a evidencia.</h2><p>Cuatro etapas. Un experimento que puedes documentar.</p></div>
      <ol className="research-stages">{stages.map((stage, index) => <li key={stage.title}>
        <span className="research-step-number" aria-hidden="true">0{index + 1}</span>
        <div><h3>{stage.title}</h3><p>{stage.text}</p><details><summary>Qué debes tener en cuenta</summary><p>{stage.detail}</p></details></div>
        <span className="research-stage-artifact">{stage.file}</span>
      </li>)}</ol>
    </section>
    <section className="research-evidence" aria-labelledby="evidence-title">
      <div className="research-wrap research-evidence-grid">
        <div><h2 id="evidence-title">La prueba está<br />en el proceso.</h2><p>El piloto técnico documenta una ronda completa: descarga, validación de archivos, cierre y reproducción del score.</p><Link href="/docs#evaluacion" className="research-text-link">Consultar metodología y resultados <span aria-hidden="true">↗</span></Link></div>
        <div className="research-proof">
          <h3>Piloto técnico de QuantLab</h3>
          <dl><div><dt>Datos</dt><dd>Sintéticos</dd></div><div><dt>Evaluación</dt><dd>Después del cierre</dd></div><div><dt>Reproducibilidad</dt><dd>Score reproducido</dd></div><div><dt>Participantes externos</dt><dd>Sin validación con usuarios</dd></div></dl>
          <p>Esta prueba verifica el funcionamiento del sistema. No demuestra capacidad de pronosticar mercados reales ni rentabilidad.</p>
          <a href="/research/judge-pilot.json" className="research-text-link">Abrir evidencia del piloto (JSON)</a>
        </div>
      </div>
    </section>
    <section className="research-wrap research-start">
      <h2>Tu próxima hipótesis<br />empieza aquí.</h2><div><p>Consulta las rondas disponibles, revisa sus datos y prepara tu primer envío.</p><Link href="/app/tournaments" className={buttonClasses("primary", "lg")}>Explorar torneos ML <span aria-hidden="true">↗</span></Link><p className="research-footnote">Plataforma experimental de investigación. No es asesoría financiera.</p></div>
    </section>
  </div>;
}
