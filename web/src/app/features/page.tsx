import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { SpotlightCard } from "@/components/SpotlightCard";

const FEATURES = [
  {
    title: "Rondas de predicción ML",
    text: "Descarga train, validation y live de una misma versión. Entrena con train, elige tu configuración con validation y envía las predicciones de live antes del cierre. Las rondas disponibles de práctica usan activos artificiales.",
  },
  {
    title: "Revisión de archivos",
    text: "El navegador revisa la cabecera, cobertura de IDs, duplicados y valores. El servidor vuelve a validar el archivo y el plazo antes de seleccionar el envío. Un archivo rechazado conserva la selección válida anterior.",
  },
  {
    title: "Evaluación después del cierre",
    text: "Las etiquetas de live permanecen privadas. El score se publica tras cerrar y evaluar la ronda: Spearman por era, promediado entre eras. Se compara dentro de esa ronda y no representa rentabilidad.",
  },
  {
    title: "Historial de experimentos",
    text: "Cada envío puede conservar nombre del modelo, parámetros declarados, semilla y nota, vinculados a la versión y huella del CSV. El historial es privado y permite exportar la página consultada en JSON.",
  },
  {
    title: "Evidencia inspeccionable",
    text: "El piloto técnico publica configuración, referencias, resultados por era y verificaciones del ciclo completo. Se ejecutó con una cuenta técnica sobre datos sintéticos; no representa usuarios externos ni beneficios financieros.",
  },
  {
    title: "Comunidad en desarrollo",
    text: "QuantLab busca reunir una comunidad de investigación cuantitativa en español. El prototipo incluye recursos educativos, código y módulos experimentales de estrategias; la evaluación del semillero se centra en el flujo de torneos ML.",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Qué hace QuantLab
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            Un prototipo del semillero DeepFin de la Universidad EIA para
            investigar modelos de predicción y documentar su evaluación.
            Participar en las rondas ML es gratuito y no genera premios QP.
          </p>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <SpotlightCard
                key={f.title}
                className="border-t border-line pt-5"
              >
                <span className="metric text-[11px] tracking-widest text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-3 text-base font-semibold text-ink">
                  {f.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.text}
                </p>
              </SpotlightCard>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-14">
          <Link href="/app/tournaments" className={buttonClasses("primary", "lg")}>
            Explorar torneos ML
          </Link>
          <Link href="/docs#evaluacion" className={buttonClasses("secondary", "lg")}>
            Ver evaluación técnica
          </Link>
        </div>
      </section>
    </>
  );
}
