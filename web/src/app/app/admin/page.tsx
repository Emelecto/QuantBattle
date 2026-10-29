"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getAdminStats,
  getAdminAlerts,
  getAdminActivity,
  type AdminStats,
  type AdminAlert,
  type AdminActivity,
} from "@/lib/admin";

const BADGE_LABELS: Record<string, string> = {
  first_submission: "Primera Submission",
  top_10_tournament: "Top 10 Torneo",
  replicable_strategy: "Estrategia Replicable",
  first_referral: "Primera Invitación",
  five_referrals: "5 Invitaciones",
  ten_referrals: "10 Invitaciones",
  ml_master: "ML Master",
  sharpe_1_5: "Sharpe 1.5+",
  tournament_winner: "Ganador de Torneo",
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="qb-glass qb-elev-1 rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="metric text-2xl font-bold text-accent mt-1">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function AlertCard({ alert }: { alert: AdminAlert }) {
  const severityClass =
    alert.severity === "error"
      ? "border-short/30 bg-short/10"
      : alert.severity === "warning"
        ? "border-[#fbbf24]/30 bg-[#fbbf24]/10"
        : "border-accent/30 bg-accent/10";

  const content = (
    <div className={`rounded-lg border p-4 ${severityClass}`}>
      <p className="text-sm font-semibold text-ink">{alert.title}</p>
      <p className="text-xs text-muted mt-1">{alert.message}</p>
    </div>
  );

  if (alert.link) {
    return (
      <Link href={alert.link} className="block hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [activity, setActivity] = useState<AdminActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => Promise.all([getAdminStats(), getAdminAlerts(), getAdminActivity()])
    .then(([s, a, act]) => { setStats(s); setAlerts(a); setActivity(act); setError(null); })
    .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Error cargando datos"); }).finally(() => setLoading(false)), []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted">Cargando dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Dashboard Admin
        </h1>
        <p className="text-sm text-muted mt-1">
          Métricas, alertas y actividad de QuantBattle.
        </p>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">
            🔴 Alertas ({alerts.length})
          </h2>
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => (
              <AlertCard key={i} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* Growth — cabinas de contenido (solo admin) */}
      <div className="qb-glass qb-elev-1 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-ink mb-1">
          📣 Growth — cabinas de contenido
        </h2>
        <p className="text-xs text-muted mb-3">
          Solo admin. Contenido educativo, QP siempre virtuales, sin promesas de
          retornos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/admin/content/instagram"
            className="rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-surface transition-colors"
          >
            Instagram — cabina
          </Link>
          <Link
            href="/app/admin/content/tiktok"
            className="rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-surface transition-colors"
          >
            TikTok — cabina
          </Link>
          <Link
            href="/app/admin/content/x"
            className="rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-surface transition-colors"
          >
            X — cabina
          </Link>
        </div>
      </div>

      {/* Métricas principales */}
      {stats && (
        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">📊 Métricas</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Usuarios totales"
              value={stats.users.total.toLocaleString()}
              sub={`+${stats.users.new_this_week} esta semana`}
            />
            <StatCard
              label="WAU"
              value={stats.users.wau.toLocaleString()}
              sub="Usuarios activos semana"
            />
            <StatCard
              label="MAU"
              value={stats.users.mau.toLocaleString()}
              sub="Usuarios activos mes"
            />
            <StatCard
              label="Torneos"
              value={stats.tournaments.total}
              sub={`${stats.tournaments.open} abiertos`}
            />
            <StatCard
              label="Submissions"
              value={stats.submissions.total.toLocaleString()}
              sub={`${stats.submissions.this_week} esta semana`}
            />
            <StatCard
              label="QP en circulación"
              value={stats.qp.circulation.toLocaleString()}
              sub={`${stats.qp.emitted.toLocaleString()} emitidos total`}
            />
            <StatCard
              label="Referidos"
              value={stats.referrals}
            />
            <StatCard
              label="Badges otorgados"
              value={stats.badges}
            />
          </div>
        </div>
      )}

      {/* Actividad reciente */}
      {activity && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Nuevos usuarios */}
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">
              👤 Últimos registros
            </h3>
            {activity.new_users.length === 0 ? (
              <p className="text-sm text-muted">Sin nuevos registros</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activity.new_users.slice(0, 5).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink">
                      {u.username || u.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted">
                      {new Date(u.created_at).toLocaleDateString("es", {
                        dateStyle: "short",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Últimas submissions */}
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">
              📈 Últimas submissions
            </h3>
            {activity.recent_submissions.length === 0 ? (
              <p className="text-sm text-muted">Sin submissions recientes</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activity.recent_submissions.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink font-mono">
                      {s.id.slice(0, 8)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        s.status === "done"
                          ? "bg-long/10 text-long"
                          : s.status === "pending"
                            ? "bg-[#fbbf24]/10 text-[#fbbf24]"
                            : "bg-surface text-muted"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">
              🏅 Últimos badges
            </h3>
            {activity.recent_badges.length === 0 ? (
              <p className="text-sm text-muted">Sin badges recientes</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activity.recent_badges.slice(0, 5).map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink">
                      {BADGE_LABELS[b.badge_type] || b.badge_type}
                    </span>
                    <span className="text-xs text-muted">
                      {new Date(b.earned_at).toLocaleDateString("es", {
                        dateStyle: "short",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Referidos */}
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">
              👥 Últimos referidos
            </h3>
            {activity.recent_referrals.length === 0 ? (
              <p className="text-sm text-muted">Sin referidos recientes</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activity.recent_referrals.slice(0, 5).map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink font-mono">
                      {r.referred_id.slice(0, 8)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        r.status === "rewarded"
                          ? "bg-long/10 text-long"
                          : "bg-surface text-muted"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
