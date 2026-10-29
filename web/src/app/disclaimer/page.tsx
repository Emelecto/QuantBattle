export const metadata = {
  title: "Disclaimer — QuantBattle",
};

export default function DisclaimerPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Disclaimer
      </h1>
      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed text-muted">
        <p className="rounded-lg border border-short/25 bg-short/[0.06] px-4 py-3 text-ink">
          QuantBattle es una herramienta de investigación. No es asesoría
          financiera ni recomendación de inversión.
        </p>
        <p>
          Nada de lo que aparece en la plataforma —métricas, rankings,
          estrategias de la comunidad o reportes fuera de muestra— constituye
          una recomendación para comprar o vender ningún instrumento.
        </p>
        <p>
          Operar en mercados financieros implica riesgo de pérdida total del
          capital. Las estrategias validadas fuera de muestra reducen el riesgo
          de autoengaño estadístico, pero no eliminan el riesgo de mercado.
        </p>
        <p>
          No custodiamos fondos ni ejecutamos órdenes en tu nombre.
        </p>
      </div>
    </section>
  );
}
