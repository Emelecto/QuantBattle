"use client";

import Link from "next/link";
import { MlWorkspace } from "@/components/research/MlWorkspace";
import { useEffect, useState } from "react";
import { useDashboardData, type DashboardTournament } from "./useDashboardData";
import { LESSONS } from "@/lib/academia/catalog";
import { loadAcademiaProgress } from "@/components/academia/progress-store";
import {
  getQPRanking,
  getTournamentRanking,
  type RankingPeriod,
  type QPRankingEntry,
  type TournamentRankingEntry,
} from "@/lib/rankings";
import "./bento.css";
import "./dashboard.css";

type RankingTab = "qp" | "tournaments";
const PERIOD_OPTIONS: { value: RankingPeriod; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "3months", label: "3 meses" },
];

const integerFormatter = new Intl.NumberFormat("es-419", {
  maximumFractionDigits: 0,
});

function formatNumber(value: number | null): string | null {
  return value != null && Number.isFinite(value)
    ? integerFormatter.format(value)
    : null;
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-419", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Card de competencia con countdown en vivo (re-render cada minuto). */
function TournamentMini({ tournament }: { tournament: DashboardTournament }) {
  const countdown = useCountdown(tournament.deadline);
  const deadline = formatDateTime(tournament.deadline);
  const closed = !!tournament.deadline && Date.parse(tournament.deadline) <= Date.now();

  return (
    <Link
      href={`/app/tournaments/${tournament.id}`}
      className="ql-competencia-mini"
    >
      <div className="ql-competencia-mini-header">
        <div className="ql-competencia-mini-top">
          <span className="ql-competencia-mini-type">
            {tournament.type === "ml" ? "ML" : "Estrategias"}
          </span>
          {tournament.submission && (
            <span className={`ql-competencia-mini-status${tournament.submission.status === "pending" || tournament.submission.status === "running" ? " pending" : ""}`}>
              {tournament.submission.status === "done" || tournament.submission.status === "scored" ? "Evaluada" : tournament.submission.status === "validated" ? "Validado; esperando cierre" : "Pendiente"}
            </span>
          )}
        </div>
        <h4 className="ql-competencia-mini-name">{tournament.name}</h4>
      </div>
      <div className="ql-competencia-mini-body">
        {tournament.symbol && <span className="ql-competencia-mini-badge">{tournament.symbol}</span>}
        <span className="ql-competencia-mini-badge">{tournament.asset_type === "synthetic" ? "Datos sintéticos" : tournament.asset_type}</span>
      </div>
      <div className="ql-competencia-mini-footer">
        <div className="ql-competencia-mini-prize">
          <span className="ql-competencia-mini-prize-label">Modalidad</span>
          <span className="ql-competencia-mini-prize-value">Práctica sin premios QP</span>
        </div>
        <span className={`ql-competencia-mini-countdown${countdown ? " is-live" : ""}`}>
          {countdown ? (
            <>Cierra en {countdown}</>
          ) : (
            <>{closed ? "Cerró: " : "Cierre: "}{deadline ?? "Por anunciar"}</>
          )}
        </span>
      </div>
    </Link>
  );
}

/** Devuelve el tiempo restante legible ("3d 04h") hasta una fecha ISO,
 *  o null si ya pasó / no hay deadline. Re-renderiza cada minuto. */
function useCountdown(deadline: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (!deadline) return null;
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return null;
  const diffMs = end - now;
  if (diffMs <= 0) return null;

  const diffMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(diffMin / 1440);
  const hours = Math.floor((diffMin % 1440) / 60);
  const minutes = diffMin % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <article className={`ql-bento-card ql-glass ql-elev-1 ${className}`}>{children}</article>;
}

function CardHeaderWithIcon({
  icon,
  title,
  subtitle,
  badge,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ql-bento-card-header">
      <div className="ql-bento-card-header-title">
        <span className="ql-bento-card-icon">{icon}</span>
        <div className="ql-bento-card-title">
          <h3>{title}</h3>
          {subtitle && <p className="ql-bento-card-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge && <span className="ql-bento-card-badge">{badge}</span>}
        {action}
      </div>
    </div>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="ql-section-link">
      {label}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function SkeletonBlock({ rows = 2 }: { rows?: number }) {
  return (
    <div className="ql-skel-block" aria-hidden="true">
      <span className="ql-skeleton-line" style={{ width: "45%" }} />
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="ql-skeleton-line" />
      ))}
    </div>
  );
}

function SkeletonCompetencias() {
  return (
    <div className="ql-skeletons" aria-busy="true" aria-label="Cargando competencias">
      <div className="ql-skel-grid">
        <SkeletonBlock rows={3} />
        <SkeletonBlock rows={3} />
        <SkeletonBlock rows={3} />
      </div>
    </div>
  );
}

function SkeletonRanking() {
  return (
    <div className="ql-skel-list" aria-busy="true" aria-label="Cargando ranking">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="ql-skel-row">
          <span className="ql-skeleton-line" style={{ width: "24px" }} />
          <span className="ql-skeleton-circle" style={{ width: 20, height: 20 }} />
          <span className="ql-skeleton-line" style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

function SkeletonEstrategias() {
  return (
    <div className="ql-skel-list" aria-busy="true" aria-label="Cargando estrategias">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="ql-skel-row">
          <span className="ql-skeleton-line" style={{ width: "32%" }} />
          <span className="ql-skeleton-line" style={{ flex: 1 }} />
          <span className="ql-skeleton-line" style={{ width: "16%" }} />
        </div>
      ))}
    </div>
  );
}

function DashboardHome() {
  const { strategies, tournaments, loading, error, retry, sources, authRequired } =
    useDashboardData();

  const [rankingTab, setRankingTab] = useState<RankingTab>("qp");
  const [period, setPeriod] = useState<RankingPeriod>("month");
  const [qpRanking, setQpRanking] = useState<QPRankingEntry[]>([]);
  const [tournamentRanking, setTournamentRanking] = useState<TournamentRankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingError, setRankingError] = useState(false);
  const [rankingRetry, setRankingRetry] = useState(0);

  // Progreso de Academia (51 piezas C1–C6): el quiz perfecto marca la
  // lección en el store local y la sincroniza a Supabase (completed_lessons).
  const [academiaDone, setAcademiaDone] = useState<string[]>([]);
  useEffect(() => {
    setAcademiaDone(loadAcademiaProgress().completed);
  }, []);
  const totalModules = LESSONS.filter((l) => !l.draft).length;
    const completedCount = new Set(academiaDone.filter((id) =>
      LESSONS.some((l) => l.id === id && !l.draft),
    )).size;
    const coursePct =
      totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

  const handleTabChange = (tab: RankingTab) => {
    setRankingTab(tab);
  };

  const handlePeriodChange = (p: RankingPeriod) => {
    setPeriod(p);
  };

  const rankingEntries = rankingTab === "qp" ? qpRanking : tournamentRanking;
    const myTournaments = tournaments.slice(0, 6);
    const hasMoreTournaments = tournaments.length > 6;
    const myStrategies = [...strategies]
      .sort((a, b) => {
        const sa = a.last_sharpe_oos;
        const sb = b.last_sharpe_oos;
        // Nulos al final; resto descendente por sharpe OOS.
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return sb - sa;
      })
      .slice(0, 6);

  useEffect(() => {
    let active = true;
    setRankingLoading(true);
    setRankingError(false);
    const request = rankingTab === "qp" ? getQPRanking(period) : getTournamentRanking(period);
    request.then(({ entries }) => {
      if (!active) return;
      if (rankingTab === "qp") setQpRanking(entries as QPRankingEntry[]);
      else setTournamentRanking(entries as TournamentRankingEntry[]);
    }).catch(() => { if (active) setRankingError(true); })
      .finally(() => { if (active) setRankingLoading(false); });
    return () => { active = false; };
  }, [rankingTab, period, rankingRetry]);

  return (
    <main className="ql-dash-content" aria-busy={loading}>
      {error && (
        <div className="ql-dashboard-notice ql-dashboard-notice--error" role="alert">
          <span>{error}</span>
          <div className="flex items-center gap-2">
            {authRequired && (
              <Link href="/login" className="ql-btn-primary">
                Iniciar sesión
              </Link>
            )}
            <button type="button" className="ql-btn-secondary" onClick={retry}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      <header className="ql-home-intro">
        <span className="ql-home-intro-kicker">QUANTLAB / INICIO</span>
        <h1 className="text-2xl font-semibold text-ink">Tu espacio de investigación</h1>
        <p className="mt-2 max-w-2xl text-base text-muted">Participa en torneos de machine learning, consulta tus envíos y continúa aprendiendo.</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/docs#evaluacion" className="text-accent underline underline-offset-4">Resultados del piloto técnico</Link>
        </div>
      </header>

      <MlWorkspace nextRound={tournaments[0]} roundsLoading={sources.tournaments === "loading"} />
      <div className="ql-bento-grid">
        {/* Competencias — fila 1 izquierda */}
        <Card className="ql-bento-competencias">
          <CardHeaderWithIcon
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
                <path d="M17 4h3v2a3 3 0 01-3 3M7 4H4v2a3 3 0 003 3" />
              </svg>
            }
            title="Competencias"
            subtitle="Rondas ML abiertas para enviar predicciones"
            badge={myTournaments.length > 0 ? `${myTournaments.length} activas` : undefined}
            action={<SectionLink href="/app/tournaments" label="Ver todas" />}
          />
          <div className="ql-bento-competencias-body">
            {sources.tournaments === "loading" ? (
              <SkeletonCompetencias />
            ) : sources.tournaments === "error" ? (
              <div className="ql-bento-empty">No se pudieron cargar las rondas. Usa Reintentar para volver a consultarlas.</div>
            ) : myTournaments.length === 0 ? (
              <div className="ql-bento-empty">
                <p>No hay rondas abiertas en este momento. Puedes consultar resultados y la guía.</p>
                <Link href="/app/tournaments" className="ql-btn-primary">
                  Explorar competencias
                </Link>
              </div>
            ) : (
              <div className="ql-competencias-grid">
                {myTournaments.map((t) => (
                  <TournamentMini key={t.id} tournament={t} />
                ))}
              </div>
            )}
          </div>
          {hasMoreTournaments && (
            <div className="ql-bento-competencias-footer">
              <Link href="/app/tournaments" className="ql-btn-secondary">
                Ir a competencias
              </Link>
            </div>
          )}
        </Card>

        {/* Ranking — columna derecha, ambas filas */}
        <Card className={`ql-bento-ranking${!rankingLoading && !rankingError && rankingEntries.length === 0 ? " is-empty" : ""}`}>
          <div className="ql-ranking-header">
            <CardHeaderWithIcon
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
              }
              title="Ranking en la comunidad"
              subtitle={rankingTab === "tournaments" ? "Victorias acumuladas; participación filtrada por período" : `QP ganados en el último ${period === "week" ? "período de 7 días" : period === "month" ? "mes" : "período de 3 meses"}`}
            />
            <div className="ql-ranking-filters">
              <div className="ql-ranking-tabs">
                <button
                  type="button"
                  className={`ql-ranking-tab${rankingTab === "qp" ? " active" : ""}`}
                  onClick={() => handleTabChange("qp")}
                >
                  QP
                </button>
                <button
                  type="button"
                  className={`ql-ranking-tab${rankingTab === "tournaments" ? " active" : ""}`}
                  onClick={() => handleTabChange("tournaments")}
                >
                  Torneos
                </button>
              </div>
              <div className="ql-ranking-period">
                <select
                  value={period}
                  onChange={(e) => handlePeriodChange(e.target.value as RankingPeriod)}
                  aria-label="Período"
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="ql-ranking-body">
            {rankingLoading ? (
              <SkeletonRanking />
            ) : rankingError ? (
              <div className="ql-bento-empty" role="alert">
                <p>No se pudo cargar el ranking.</p>
                <button type="button" className="ql-btn-secondary" onClick={() => setRankingRetry((n) => n + 1)}>Reintentar ranking</button>
              </div>
            ) : rankingEntries.length === 0 ? (
              <div className="ql-bento-empty">
                No hay datos para este período.
              </div>
            ) : (
              <ol className="ql-ranking-list">
                {rankingEntries.map((entry) => (
                  <li
                    key={entry.user_id}
                    className={`ql-ranking-item${entry.is_me ? " is-me" : ""}`}
                  >
                    <span className={`ql-ranking-pos${entry.rank <= 3 ? " top" : ""}`}>
                      #{entry.rank}
                    </span>
                    <div className="ql-ranking-avatar">
                      {(entry as QPRankingEntry).avatar_url ? (
                        // Avatar externo y dinámico (Supabase/Google): <img> directo,
                        // next/image exigiría remotePatterns abierto.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(entry as QPRankingEntry).avatar_url!}
                          alt=""
                          width={20}
                          height={20}
                        />
                      ) : (
                        <span className="ql-ranking-avatar-fallback">
                          {entry.username.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="ql-ranking-info">
                      <span className="ql-ranking-name">
                        {entry.username}
                        {entry.is_me && <span className="ql-ranking-me">Tú</span>}
                      </span>
                      <span className="ql-ranking-stat">
                        {rankingTab === "qp" ? (
                          <>
                            {formatNumber((entry as QPRankingEntry).qp)}{" "}
                            <span className="ql-ranking-qp">QP</span>
                          </>
                        ) : (
                          <>
                            {formatNumber(
                              (entry as TournamentRankingEntry).tournaments_won,
                            )}{" "}
                            ganados
                          </>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        {/* Estrategias + Aprendizaje — fila 2 */}
        <div className="ql-bento-bottom-left">
          <Card className="ql-bento-estrategias">
            <CardHeaderWithIcon
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              }
              title="Estrategias"
              subtitle="Tus estrategias en backtesting"
              badge={`${strategies.length} activas`}
            />
            <div className="ql-estrategias-body">
              {sources.strategies === "loading" ? (
                <SkeletonEstrategias />
              ) : sources.strategies === "error" ? (
                <div className="ql-bento-empty">No se pudieron cargar tus estrategias.</div>
              ) : myStrategies.length === 0 ? (
                <div className="ql-bento-empty">
                  <p>Todavía no has guardado estrategias de backtesting.</p>
                  <Link href="/app/strategies/new?demo=1" className="ql-btn-primary">
                    Crear mi primer backtest
                  </Link>
                </div>
              ) : (
                <div className="ql-estrategias-grid">
                  {myStrategies.map((s) => (
                    <Link
                      key={s.id}
                      href={`/app/strategies/${s.id}/results`}
                      className="ql-estrategia-item"
                    >
                      <span className="ql-estrategia-symbol">{s.symbol}</span>
                      <div className="ql-estrategia-info">
                        <h4>{s.title}</h4>
                        <span className="ql-estrategia-meta">
                          {s.asset_type} · {s.timeframe}
                        </span>
                      </div>
                      {s.last_sharpe_oos != null && (
                        <span
                          className={`ql-estrategia-metric${
                            s.last_sharpe_oos < 0 ? " is-neg" : ""
                          }`}
                        >
                          {s.last_sharpe_oos.toFixed(2)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="ql-bento-aprendizaje">
            <CardHeaderWithIcon
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              }
              title="Academia"
              subtitle="Cursos abiertos · progreso guardado en este navegador"
            />
            <div className="ql-aprendizaje-body">
              <div className="ql-aprendizaje-progress">
                <div className="ql-aprendizaje-ring">
                  <svg viewBox="0 0 100 100" width="60" height="60">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--ql-line)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--ql-accent)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(coursePct / 100) * 264} 264`}
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <span className="ql-aprendizaje-percent">{coursePct}%</span>
                </div>
                <div className="ql-aprendizaje-text">
                  <p className="ql-aprendizaje-label">Progreso en Academia</p>
                  <p className="ql-aprendizaje-detail">
                    {completedCount} de {totalModules} lecciones
                  </p>
                </div>
              </div>
              <Link href="/app/academia" className="ql-btn-secondary ql-aprendizaje-cta">
                Continuar en la Academia
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

export { DashboardHome };
