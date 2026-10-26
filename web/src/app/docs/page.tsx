import type { ReactNode } from "react";
import { ResearchEvidence } from "@/components/research/ResearchEvidence";

/**
 * /docs — Documentación técnica de QuantLab.
 * Server component: solo contenido real del producto. Nada inventado.
 */

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="metric rounded border border-line bg-surface-solid px-1.5 py-0.5 text-[12px] text-ink">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="metric overflow-x-auto rounded-lg border border-line bg-surface-solid p-4 text-[12px] leading-relaxed text-ink/90">
      {children}
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-10">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      <div className="mt-4 space-y-4 text-[14px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

const FOLDS = [
  { is: "1–140", oos: "141–175" },
  { is: "36–175", oos: "176–210" },
  { is: "71–210", oos: "211–245" },
];

export default function DocsPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Documentación
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Protocolo de los torneos ML, evidencia de la evaluación técnica y
          herramientas para reproducir experimentos. QuantLab es un prototipo
          de investigación del semillero DeepFin de la Universidad EIA.
        </p>

        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
          <a href="#evaluacion" className="text-accent hover:underline">Evaluación del semillero</a>
          <a href="#torneos-ml" className="text-accent hover:underline">Protocolo ML</a>
          <a href="#walk-forward" className="text-accent hover:underline">Walk-forward OOS</a>
          <a href="#metricas" className="text-accent hover:underline">Métricas</a>
          <a href="#api" className="text-accent hover:underline">API</a>
          <a href="#mcp" className="text-accent hover:underline">MCP</a>
        </nav>

        <div className="mt-10 space-y-10">
          <Section id="evaluacion" title="Evaluación técnica con datos sintéticos">
            <ResearchEvidence />
          </Section>
          <Section id="torneos-ml" title="Cómo funciona una ronda ML">
            <p>Descarga train y validation con target, y live sin target. Cada envío debe incluir exactamente las columnas <Code>id,prediction</Code>, todos los IDs de live una sola vez y números finitos entre 0 y 1. Cada era debe tener predicciones con variación.</p>
            <p>El servidor valida y guarda el archivo con un recibo SHA-256. Solo el último envío válido antes del cierre queda seleccionado. La puntuación y el ranking se publican después del plazo; la métrica oficial es la media de Spearman por era, versión <Code>spearman_era_v1</Code>.</p>
            <p>Las rondas de práctica usan datos totalmente artificiales, son gratuitas y no otorgan QP. Las variables se renombran y discretizan: la ofuscación no es cifrado. La generación automática de rondas reales permanece desactivada hasta resolver la distribución de la fuente.</p>
            <div className="flex flex-wrap gap-4">
              <a href="/app/tournaments/guide" className="text-accent underline underline-offset-4">Guía del participante</a>
              <a href="/ml/ejemplo_quantlab.ipynb" download className="text-accent underline underline-offset-4">Descargar notebook reproducible</a>
            </div>
          </Section>
          {/* ---------------------------------------------------------- */}
          <Section id="walk-forward" title="Walk-forward out-of-sample">
            <p>
              Un backtest clásico entrena y evalúa sobre los mismos datos: eso
              premia estrategias sobreajustadas. QuantLab separa{" "}
              <strong className="text-ink">entrenamiento (IS)</strong> y{" "}
              <strong className="text-ink">evaluación (OOS)</strong> en cada
              fold, con ventanas rodantes: la estrategia se ajusta solo con el
              pasado y se mide sobre datos que nunca vio.
            </p>
            <div className="ql-glass space-y-2.5 p-5">
              {FOLDS.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="metric w-10 shrink-0 text-muted">
                    Fold {i + 1}
                  </span>
                  <span className="rounded bg-surface-solid px-2 py-1 text-muted">
                    IS {f.is}
                  </span>
                  <span aria-hidden className="text-line">→</span>
                  <span className="rounded bg-accent/10 px-2 py-1 font-medium text-accent">
                    OOS {f.oos}
                  </span>
                </div>
              ))}
              <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
                Ejemplo con 245 velas y 3 folds (config por defecto). El split
                70/30 controla cuánto es IS vs OOS en cada ventana.
              </p>
            </div>
            <p>
              La métrica final de ranking es el promedio de los tramos OOS. Si
              tu estrategia solo funciona en-sample, aquí se nota de inmediato —
              y eso es exactamente lo que queremos revelar.
            </p>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section id="metricas" title="Cómo leer tus métricas de estrategias">
            <dl className="space-y-4">
              <div>
                <dt className="font-medium text-ink">Sharpe OOS</dt>
                <dd>
                  Retorno ajustado por riesgo medido <em>solo</em> fuera de
                  muestra. Referencia orientativa: &lt; 0 negativo, 0–0.5 débil,
                  0.5–1 aceptable, &gt; 1 notable (con datos reales y costes,
                  &gt; 1 sostenido es raro).
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Deflated Sharpe</dt>
                <dd>
                  Corrección del Sharpe por <em>pruebas múltiples</em>: si
                  pruebas muchas variantes, alguna saldrá bien por azar. El
                  deflated penaliza esa suerte estadística. Es la métrica reina
                  del ranking.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Max Drawdown</dt>
                <dd>La peor caída pico-a-valle del equity OOS. Mide dolor, no rentabilidad.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Win Rate</dt>
                <dd>
                  % de operaciones ganadoras. Alto win rate con drawdowns brutales
                  suele indicar estrategias que no cortan pérdidas.
                </dd>
              </div>
            </dl>
            <p className="border-l-2 border-accent/40 pl-4 text-[13px]">
              Ninguna métrica garantiza rendimiento futuro. QuantLab mide
              integridad metodológica, no predice mercados.
            </p>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section id="api" title="API programática">
            <p>
              Base URL del worker:{" "}
              <Code>{process.env.NEXT_PUBLIC_WORKER_URL ?? "https://quantlab2.onrender.com"}</Code>{" "}
              — autenticación opcional con JWT de Supabase o clave API{" "}
              <Code>qlk_…</Code> (créala en{" "}
              <a href="/app/api-keys" className="text-accent hover:underline">Tu cuenta → Claves API</a>).
              Los endpoints públicos de lectura no requieren clave.
            </p>
            <Pre>{`# Health check (público)
curl https://quantlab2.onrender.com/health

# Listar marketplace (público)
curl https://quantlab2.onrender.com/marketplace

# Torneos activos
curl https://quantlab2.onrender.com/tournament/list`}</Pre>
            <Pre>{`# Con clave API qlk_: publicar una estrategia
curl -X POST https://quantlab2.onrender.com/marketplace/publish \\
  -H "Authorization: Bearer qlk_TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "SMA BTC diaria",
    "asset_type": "crypto",
    "symbol": "BTCUSDT",
    "timeframe": "1d",
    "code": "def indicator(data): ...",
    "config": {},
    "price_qp_week": 0
  }'`}</Pre>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 pr-4 font-medium uppercase tracking-wide">Endpoint</th>
                    <th className="py-2 pr-4 font-medium uppercase tracking-wide">Auth</th>
                    <th className="py-2 font-medium uppercase tracking-wide">Descripción</th>
                  </tr>
                </thead>
                <tbody className="metric divide-y divide-line">
                  {[
                    ["GET /health", "—", "Estado del worker"],
                    ["GET /ml/datasets", "—", "Particiones y metadatos públicos"],
                    ["POST /ml/datasets/{id}/predictions", "JWT/qlk_", "Validar y seleccionar un CSV"],
                    ["GET /ml/leaderboard?dataset_id=…", "—", "Resultados tras el cierre"],
                    ["POST /backtest", "JWT", "Ejecuta backtest walk-forward"],
                    ["GET /marketplace", "—", "Lista estrategias publicadas"],
                    ["POST /marketplace/publish", "JWT/qlk_", "Publica estrategia"],
                    ["GET /marketplace/{id}/comments", "—", "Comentarios de una estrategia"],
                    ["POST /tournament/submit", "JWT/qlk_", "Envía estrategia a torneo"],
                    ["GET /tournament/{id}/leaderboard", "—", "Ranking + reputation_score"],
                    ["GET /social/activity", "—", "Feed global de actividad"],
                    ["GET|POST|DELETE /account/api-keys", "JWT", "Gestión de claves qlk_"],
                  ].map(([ep, auth, desc]) => (
                    <tr key={ep}>
                      <td className="py-2 pr-4 text-ink">{ep}</td>
                      <td className="py-2 pr-4 text-muted">{auth}</td>
                      <td className="py-2">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section id="mcp" title="MCP — QuantLab desde tu asistente IA">
            <p>
              QuantLab expone un servidor MCP (Model Context Protocol): tu
              Claude Desktop u otro cliente compatible puede consultar el
              marketplace, torneos y rankings con lenguaje natural.
            </p>
            <Pre>{`claude mcp add quantlab -e QUANTLAB_TOKEN=tu_clave -- python /ruta/a/QuantLab/mcp-server/mcp_server.py`}</Pre>
            <p>
              El servidor usa tu clave <Code>qlk_</Code> vía variable de entorno{" "}
              <Code>QUANTLAB_TOKEN</Code>. Ejemplos de uso natural:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 marker:text-line">
              <li>&ldquo;¿Qué estrategias gratis hay para ETH en el marketplace?&rdquo;</li>
              <li>&ldquo;Muéstrame el leaderboard del torneo semanal&rdquo;</li>
              <li>&ldquo;¿Cuánto QP tengo en mi wallet?&rdquo;</li>
            </ul>
            <p>
              Detalles completos en{" "}
              <Code>mcp-server/README.md</Code> del repositorio.
            </p>
          </Section>
        </div>

        <footer className="mt-14 border-t border-line pt-6 text-[12px] text-muted">
          ¿Algo falta o está desactualizado? El changelog refleja qué cambió y
          cuándo: <a href="/changelog" className="text-accent hover:underline">ver changelog</a>.
        </footer>
      </section>
    </main>
  );
}
