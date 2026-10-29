import Link from "next/link";
import pilot from "../../../public/research/judge-pilot.json";

const number = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 });

export function ResearchEvidence() {
  const date = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota",
  }).format(new Date(pilot.completed_at));
  const checks = Object.values(pilot.checks).filter(Boolean).length;
  const rows = [
    ["Modelo entrenado", pilot.results.model.score],
    ["Referencia aleatoria", pilot.results.random_reference.score],
    ["Primera variable pública", pilot.results.feature_reference.score],
  ] as const;

  return (
    <div className="space-y-6 text-base leading-relaxed">
      <p>
        <strong className="text-ink">Emilio Cardona Lopez · DeepFin / Universidad EIA.</strong>{" "}
        Este piloto recorre la API desplegada, autenticación, base de datos y almacenamiento reales con un mercado artificial y una cuenta técnica del proyecto. Fue completado el {date}, hora de Colombia.
      </p>
      <dl className="divide-y divide-line border-y border-line text-sm">
        {[
          ["Datos", `${pilot.generator.n_assets} activos artificiales · ${pilot.generator.n_eras} eras · ${pilot.generator.n_features} variables`],
          ["Particiones", `${pilot.row_counts.train.toLocaleString("es-CO")} filas de entrenamiento · ${pilot.row_counts.validation.toLocaleString("es-CO")} de validación · ${pilot.row_counts.live.toLocaleString("es-CO")} de prueba`],
          ["Comprobaciones", `${checks} completadas: descargas, autenticación, validación, privacidad, selección, cierre y puntuación`],
          ["Versión", pilot.version],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="text-muted">{label}</dt><dd className="break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="font-semibold text-ink">Resultado de la ronda artificial</h3>
        <p className="mt-2 text-sm">HistGradientBoostingRegressor entrenado únicamente con train. Se escogió entre dos configuraciones usando validation; las etiquetas de prueba se leyeron después del cierre real.</p>
        <table className="mt-4 w-full text-left text-sm">
          <caption className="sr-only">Spearman medio por era sobre el holdout sintético</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="py-3 font-medium">Predicción</th><th scope="col" className="py-3 text-right font-medium">Spearman medio</th></tr></thead>
          <tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-line"><th scope="row" className="py-3 font-normal text-ink">{label}</th><td className="py-3 text-right font-mono tabular-nums text-ink">{number.format(value)}</td></tr>)}</tbody>
        </table>
        <p className="mt-3 text-sm">El score del modelo está cerca de cero; una ronda no establece superioridad estadística. Estos resultados no demuestran rentabilidad, capacidad de pronosticar mercados reales ni adopción externa. Spearman mide orden relativo y no incluye costos de trading.</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <a href="/research/judge-pilot.json" download className="text-accent underline underline-offset-4">Descargar evidencia completa (JSON)</a>
        <Link href={`/app/tournaments/${pilot.tournament_id}`} className="text-accent underline underline-offset-4">Abrir torneo de demostración</Link>
        <a href="https://github.com/Emelecto/QuantBattle/blob/main/docs/evaluation-guide.md" className="text-accent underline underline-offset-4">Guía para evaluadores</a>
      </div>
      <p className="border-t border-line pt-4 text-sm">
        El autor reporta el uso de Hermes Agent, subagentes y memoria persistente durante el desarrollo. Esta versión de evaluación también recibió cambios y pruebas asistidos por Codex. Estudiar la contribución de cada herramienta requiere analizar sus sesiones y el historial del código por separado.
      </p>
    </div>
  );
}
