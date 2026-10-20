import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AuthAwareCTA } from "@/components/AuthAwareCTA";
import { HeroChart } from "@/components/charts/HeroChart";
import { OverfitMiniChart, OosMiniChart } from "@/components/charts/MiniCharts";

const STEPS = [
  {
    n: "1",
    title: "Desarrolla tu idea",
    text: "Define tu hipótesis en el editor web. Sin instalar nada, sin configurar entornos.",
    detail: "Empieza desde una plantilla SMA/RSI o pega tu propio código. El editor Monaco te da autocompletado y resaltado de sintaxis.",
    icon: "💡",
  },
  {
    n: "2",
    title: "Pruébala a fondo",
    text: "Walk-forward OOS: entrena en el pasado, mide en datos que nunca vio.",
    detail: "Split automático en pliegues, métricas y curva de equity. Una evaluación fuera de muestra ayuda a detectar sobreajuste; no demuestra rentabilidad futura.",
    icon: "🔬",
  },
  {
    n: "3",
    title: "Comparte en la comunidad",
    text: "Publica en el marketplace, recibe comentarios y sigue a otros traders.",
    detail: "Tu estrategia entra al marketplace con pricing configurable en QP/semana. Los usuarios pueden suscribirse, comentar y clonar.",
    icon: "🌐",
  },
  {
    n: "4",
    title: "Compite con predicciones",
    text: "Descarga un dataset, entrena tu modelo y envía sus predicciones.",
    detail: "Rondas con plazo fijo, validación de archivos y ranking tras el cierre. La modalidad de práctica usa datos sintéticos y no otorga premios QP.",
    icon: "🏆",
  },
];

const FEATURES = [
  {
    title: "Motor walk-forward",
    text: "Split entrenamiento/prueba automático en múltiples pliegues.",
    visual: "walkforward",
  },
  {
    title: "Datos reales multi-fuente",
    text: "Binance + Bybit + Yahoo Finance. Fuente visible en cada consulta.",
    visual: "datasources",
  },
  {
    title: "Métricas deflatidas",
    text: "Sharpe OOS desinflado, retorno ajustado por riesgo, drawdown real.",
    visual: "metrics",
  },
  {
    title: "Marketplace de estrategias",
    text: "Publica, suscríbete, comenta. Copy-trading en paper.",
    visual: "marketplace",
  },
  {
    title: "Torneos de machine learning",
    text: "Predicciones sobre datos sintéticos, evaluación por era y resultados después del cierre.",
    visual: "tournaments",
  },
  {
    title: "API + MCP para IA",
    text: "Claves `qlk_`, server MCP. Integra LLMs a tu flujo de investigación.",
    visual: "api",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* HERO (A1: demo en vivo) — sin kicker, sin gradient text (craft-floor) */}
            <section className="relative overflow-hidden border-b border-line">
              {/* Aurora animada: blobs blancos/grises sutiles que derivan */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div
                  className="ql-aurora-blob ql-aurora-1 left-[8%] top-[-30%] h-[26rem] w-[36rem]"
                  style={{ background: "rgba(248,250,252,0.06)" }}
                />
                <div
                  className="ql-aurora-blob ql-aurora-2 right-[4%] top-[-20%] h-[22rem] w-[30rem]"
                  style={{ background: "rgba(203,213,225,0.05)" }}
                />
                <div
                  className="ql-aurora-blob ql-aurora-3 left-[38%] top-[10%] h-[18rem] w-[26rem]"
                  style={{ background: "rgba(148,163,184,0.04)" }}
                />
              </div>
              <div className="relative mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
                <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-ink md:text-[56px]">
                      Comunidad de trading{" "}
                      <span className="text-accent">cuantitativo.</span>
                    </h1>
                    <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
                      Una plataforma experimental en español para investigar modelos,
                      compartir estrategias y competir con predicciones de machine learning.
                      Desarrollada en el semillero DeepFin de la Universidad EIA.
                    </p>
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                      <Link href="/app/tournaments" className={buttonClasses("primary", "lg")}>
                        Explorar torneos ML
                      </Link>
                      <Link
                        href="/docs#evaluacion"
                        className={buttonClasses("secondary", "lg")}
                      >
                        Ver evaluación técnica
                      </Link>
                    </div>
                  </div>

                  {/* Demo en vivo: equity curve animada estilo TradingView con métricas flotantes */}
                  <HeroChart />
                </div>
              </div>
            </section>

      {/* A2: POR QUÉ NO SOBREAJUSTES */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="max-w-3xl text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Por qué no overfitting
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            Sobreajustar es aprender de memoria el pasado. Si tu estrategia solo gana
            con los datos con los que calibraste, no es edge: es recuerdo. El
            walk-forward OOS mide sobre datos nuevos y esa curva no se puede maquillar.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-[15px] font-semibold text-short">
                Curva overfitted (en muestra)
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Sube sin parar en el histórico&hellip; y luego se desploma. Bonito en
                el reporte, desastroso en la vida real.
              </p>
              <div className="mt-4 overflow-hidden rounded-lg border border-line">
                <OverfitMiniChart />
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-[15px] font-semibold text-long">
                Validación walk-forward (out-of-sample)
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Más modesta, pero honesta: es lo que ocurre cuando la estrategia
                enfrenta datos nuevos. Lo que sobrevive, cuenta.
              </p>
              <div className="mt-4 overflow-hidden rounded-lg border border-line">
                <OosMiniChart />
              </div>
            </Card>
          </div>

          <p className="metric mt-6 text-[12px] text-muted">
            Por eso el ranking solo puntúa el Sharpe desinflado OOS, no el ajuste al
            pasado.
          </p>
        </div>
      </section>

      {/* A3: VALIDACIÓN Y CONFIANZA */}
      <section className="border-b border-line bg-surface/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="max-w-3xl text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Datos verificables, fuente visible
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="ql-glass ql-elev-1 rounded-xl p-5">
              <div className="metric text-sm font-semibold text-ink">
                Binance
              </div>
            </div>
            <div className="ql-glass ql-elev-1 rounded-xl p-5">
              <div className="metric text-sm font-semibold text-ink">
                Yahoo Finance
              </div>
            </div>
            <div className="ql-glass ql-elev-1 rounded-xl p-5">
              <div className="metric text-sm font-semibold text-ink">
                Integridad OOS verificada
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA — 4 pasos interactivos con línea conectora */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Cómo funciona
          </h2>
          <p className="mt-2 text-sm text-muted">Del paper trading a los torneos</p>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className="group relative flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5 transition-all duration-200 hover:border-accent/40 hover:bg-accent/[0.04]"
              >
                <div className="flex items-center gap-2">
                  <span className="metric flex h-7 w-7 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-[13px] font-bold text-accent group-hover:bg-accent/20 transition-colors">
                    {s.n}
                  </span>
                  <span className="text-2xl">{s.icon}</span>
                </div>
                <h3 className="text-[15px] font-semibold text-ink">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{s.text}</p>
                <p className="text-[12px] leading-relaxed text-muted/80 pt-2 border-t border-line/50">
                  {s.detail}
                </p>
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute -right-2 top-1/2 h-px w-4 bg-accent/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES — showcase visual con mini-charts */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Todo lo que necesitas para investigar en serio
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group ql-glass ql-elev-1 rounded-xl p-5 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
                  </div>
                  <span className="text-xs rounded bg-accent/10 border border-accent/20 px-2 py-0.5 text-accent font-medium uppercase tracking-wide">
                    {f.visual === "walkforward" && "WF"}
                    {f.visual === "datasources" && "DATA"}
                    {f.visual === "metrics" && "OOS"}
                    {f.visual === "marketplace" && "MKT"}
                    {f.visual === "tournaments" && "🏆"}
                    {f.visual === "api" && "API"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Deja de adivinar si tu estrategia sirve.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Crea tu cuenta, corre tu primer backtest out-of-sample y compara tu
            resultado con el de la comunidad.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
            <AuthAwareCTA
              loggedOutLabel="Empieza gratis"
              loggedOutHref="/register"
              loggedInLabel="Ir al dashboard"
              loggedInHref="/app"
              size="lg"
            />
            <Link
              href={`/app/strategies/new?demo=1`}
              className="text-sm text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              Pruébala en 60 segundos — sin escribir código →
            </Link>
          </div>
        </div>
      </section>

      {/* Nota legal mínima al pie */}
      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-4">
          <p className="text-[12px] text-muted">No es asesoría financiera.</p>
        </div>
      </div>
    </div>
  );
}
