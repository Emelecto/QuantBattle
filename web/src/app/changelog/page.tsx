import Link from "next/link";

/**
 * /changelog — historial público de cambios de QuantBattle.
 * Entradas más recientes primero. Añadir nuevas versiones al inicio del array.
 */

const ENTRIES: {
  version: string;
  date: string;
  tag: string;
  items: string[];
}[] = [
  {
    version: "v0.9",
    date: "Agosto 2026",
    tag: "Comunidad y competitividad",
    items: [
      "Reputation Score en el leaderboard: media de tus últimos 5 envíos evaluados, no solo el último backtest.",
      "Rondas de torneo con número y fecha de cierre (migration 0004).",
      "Player card por modelo: mejor Sharpe histórico, rounds enviados y racha actual por estrategia.",
      "Comentarios públicos en cada estrategia del marketplace.",
      "Follows y feed de actividad: sigue traders y mira qué publican o a qué rounds entran.",
      "Tour de bienvenida reescrito: anclaje preciso, flecha direccional y paso final 'Envía tu primer modelo'.",
    ],
  },
  {
    version: "v0.8",
    date: "Agosto 2026",
    tag: "Datos sin fronteras",
    items: [
      "Fuente dual de datos crypto: Bybit como primaria y Binance como respaldo — elimina el bloqueo geográfico HTTP 451 desde servidores EE.UU.",
      "ETFs como tipo de activo (SPY, QQQ, GLD, IBIT…).",
      "Selector de símbolos con búsqueda: +70 activos curados (crypto, acciones y ETFs) con opción de ticker libre.",
      "Timeframes intradía para crypto: 1m, 5m, 15m, 30m, 1h… hasta mensual.",
      "Importar y exportar estrategias como JSON completo (código + configuración).",
      "Fechas de backtest en blanco por defecto: tú decides el rango.",
    ],
  },
  {
    version: "v0.7",
    date: "Agosto 2026",
    tag: "Plataforma abierta",
    items: [
      "Claves API qbt_ para acceso programático: crea y revoca claves desde tu cuenta.",
      "Servidor MCP (Model Context Protocol): conecta QuantBattle con Claude y otros asistentes.",
      "'Agregar al mercado' directo desde los resultados de una estrategia ya creada.",
      "Envío a torneos desde la creación de estrategias.",
      "Nuevo tema Glass Terminal con acento blanco: sobrio, legible, profesional.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Changelog
        </h1>
        <p className="mt-2 text-sm text-muted">
          Producto vivo: cada cambio que llega a producción queda documentado
          aquí.
        </p>

        <div className="mt-10 space-y-10">
          {ENTRIES.map((e) => (
            <article key={e.version} className="relative pl-8">
              {/* Línea vertical del timeline */}
              <span
                aria-hidden
                className="absolute left-[7px] top-3 h-full w-px bg-line"
              />
              <span
                aria-hidden
                className="absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 border-accent bg-bg"
              />
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="metric text-lg font-semibold text-ink">
                  {e.version}
                </h2>
                <time className="metric text-[12px] text-muted">{e.date}</time>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                  {e.tag}
                </span>
              </header>
              <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted marker:text-line">
                {e.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mt-12 text-[13px] text-muted">
          ¿Dudas sobre algo de esto?{" "}
          <Link href="/docs" className="text-accent hover:underline">
            Lee la documentación
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
