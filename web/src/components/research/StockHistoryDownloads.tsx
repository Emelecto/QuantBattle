import catalog from "@/data/stock-history-v1.json";
import { buttonClasses } from "@/components/ui/Button";

export function StockHistoryDownloads() {
  const archive = catalog.files["quantbattle-stock-history-v1.zip"];
  return (
    <section id="stock-history" aria-labelledby="stock-history-title" className="my-7 rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 id="stock-history-title" className="text-xl font-semibold tracking-tight text-ink">Dataset histórico de acciones</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Entrena y valida con datos históricos de 50 acciones estadounidenses, 32 variables y el retorno real de la siguiente sesión.
        Ambos archivos incluyen el objetivo: apertura a cierre, en decimales. Un valor de 0.02 significa +2 %.
      </p>
      <a href={archive.url} className={buttonClasses("primary", "lg", "mt-5 h-auto min-h-11 whitespace-normal py-3 text-center")}>
        Descargar dataset completo · ZIP {(archive.bytes / 1_000_000).toFixed(0)} MB
      </a>
      <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
        {([
          ["Entrenamiento", "train.parquet", catalog.train],
          ["Validación", "validation.parquet", catalog.validation],
        ] as const).map(([label, name, data]) => (
          <div key={name} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div>
              <dt className="font-semibold text-ink">{label}</dt>
              <dd className="mt-1 leading-relaxed text-muted">
                {data.rows.toLocaleString("es-CO")} filas · {data.target_start} a {data.target_end}
              </dd>
            </div>
            <a href={catalog.files[name].url} className="inline-flex min-h-11 items-center text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              Descargar {name}
            </a>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        Usa entrenamiento para ajustar el modelo y validación para comprobarlo en fechas posteriores.
        La validación histórica no demuestra rentabilidad futura.
      </p>
      <nav aria-label="Documentación del histórico de acciones" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {([
          ["Guía del dataset", catalog.files["README.md"].url],
          ["Definición de variables", catalog.files["feature_definitions.json"].url],
          ["Acciones incluidas", catalog.files["universe.csv"].url],
          ["Calidad de los datos", catalog.files["quality_report.json"].url],
          ["Verificar integridad", catalog.checksums_url],
        ] as const).map(([label, href]) => (
          <a key={label} href={href} className="inline-flex min-h-11 items-center text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{label}</a>
        ))}
      </nav>
    </section>
  );
}
