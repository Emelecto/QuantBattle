"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getActivityFeed,
  getGlobalActivity,
  type ActivityAction,
  type ActivityEvent,
} from "@/lib/social";

/* ------------------------------------------------------------------ */
/* Presentación por tipo de acción                                     */
/* ------------------------------------------------------------------ */

const ACTION_LABELS: Record<ActivityAction, string> = {
  published_strategy: "publicó una estrategia",
  tournament_submission: "se inscribió en un torneo",
  comment_added: "comentó en el marketplace",
};

/** Icono de línea pequeño según la acción (sin emojis). */
function ActionIcon({ action }: { action: ActivityAction }) {
  const common =
    "h-4 w-4 shrink-0";
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted"
    >
      {action === "published_strategy" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={common}>
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="M7 15l3.5-4.5 3 2.5L18 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : action === "tournament_submission" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={common}>
          <path d="M8 21h8" strokeLinecap="round" />
          <path d="M12 17v4" strokeLinecap="round" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" strokeLinejoin="round" />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={common}>
          <path
            d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/** Tiempo relativo compacto: hace X min / h / d. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "hace instantes";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

type Tab = "following" | "global";

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

export function ActivityFeed() {
  const [tab, setTab] = useState<Tab>("following");
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const list =
        tab === "following" ? await getActivityFeed(30) : await getGlobalActivity(30);
      if (!active) return;
      setEvents(list);
    })().catch((e) => {
      if (!active) return;
      setEvents([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar la actividad");
    });
    return () => {
      active = false;
    };
  }, [tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "following", label: "Siguiendo" },
    { key: "global", label: "Global" },
  ];

  return (
    <section aria-label="Actividad reciente">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Actividad
        </h2>
        {/* Tabs Siguiendo | Global */}
        <div
          role="tablist"
          aria-label="Alcance de la actividad"
          className="flex rounded-full border border-line bg-surface p-0.5"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => { if (t.key !== tab) { setEvents(null); setError(null); setTab(t.key); } }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="qb-glass qb-elev-1 mt-4 rounded-xl">
        {error != null ? (
          <p className="px-5 py-6 text-sm text-muted">{error}</p>
        ) : events == null ? (
          /* Carga honesta: filas tenues mientras llega la respuesta */
          <ul aria-busy="true" className="divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex animate-pulse items-center gap-3 px-5 py-3">
                <span className="h-8 w-8 shrink-0 rounded-full bg-surface-solid" />
                <span className="h-3 w-40 rounded-full bg-surface-solid" />
              </li>
            ))}
          </ul>
        ) : events.length === 0 ? (
          tab === "following" ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Sin actividad todavía. Sigue a otros traders desde su perfil para
              ver aquí lo que publican.
            </p>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Aún no hay actividad global. Publica una estrategia o únete a un
              torneo para estrenarla.
            </p>
          )
        ) : (
          <ul className="divide-y divide-line">
            {events.slice(0, 8).map((ev) => (
              <li key={String(ev.id)} className="qb-row flex items-center gap-3 px-5 py-3">
                <ActionIcon action={ev.action} />
                <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
                  <Link
                    href={`/app/profile/${ev.actor_id}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    @{ev.username ?? "trader"}
                  </Link>{" "}
                  {ACTION_LABELS[ev.action] ?? ev.action}
                </p>
                <time
                  dateTime={ev.created_at}
                  title={new Date(ev.created_at).toLocaleString("es-ES")}
                  className="metric shrink-0 text-[11px] text-muted"
                >
                  {timeAgo(ev.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default ActivityFeed;
