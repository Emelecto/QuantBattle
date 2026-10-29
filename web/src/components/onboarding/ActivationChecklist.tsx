"use client";

import Link from "next/link";
import {
  ACTIVATION_STEPS,
  ACTIVATION_TOTAL_QP,
  useActivation,
} from "@/lib/activation";

/**
 * Checklist de activación crea → corre → publica → compite.
 * Solo usa clases Glass Terminal existentes (qb-glass, qb-elev-1) +
 * utilidades Tailwind ya presentes en el codebase. Al completarse se
 * colapsa a una línea de celebración.
 */
export function ActivationChecklist() {
  const { state, done, total, next } = useActivation();

  if (!next) {
    return (
      <div className="qb-glass qb-elev-1 rounded-xl p-4">
        <p className="text-sm font-semibold text-ink">
          Activación completa — {ACTIVATION_TOTAL_QP} QP en juego 🎉
        </p>
        <p className="mt-1 text-xs text-muted">
          Ya creaste, corriste, publicaste y competiste. Sigue escalando en el
          ranking.
        </p>
        <Link
          href="/app/tournaments"
          className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition-transform active:scale-[0.96] hover:bg-accent/90"
        >
          Ver torneos activos
        </Link>
      </div>
    );
  }

  const pct = Math.round((done / total) * 100);

  return (
    <div className="qb-glass qb-elev-1 rounded-xl p-4" data-tour="activation-checklist">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Tu activación</h3>
        <span className="font-mono text-xs text-muted">
          {done}/{total} · +{ACTIVATION_TOTAL_QP} QP
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-solid"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de activación"
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {ACTIVATION_STEPS.map((s) => {
          const ok = state[s.id];
          const isNext = next.id === s.id;
          return (
            <li
              key={s.id}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                ok
                  ? "border-long/25 bg-long/[0.06]"
                  : isNext
                    ? "border-accent/35 bg-accent/[0.07]"
                    : "border-line bg-surface-solid"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  ok ? "bg-long text-bg" : isNext ? "bg-accent text-bg" : "bg-surface-solid text-muted"
                }`}
              >
                {ok ? "✓" : s.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">
                  {s.titulo}{" "}
                  <span className="font-normal text-muted">· +{s.qp} QP</span>
                </p>
                {!ok && isNext && (
                  <p className="truncate text-[11px] text-muted">{s.detalle}</p>
                )}
              </div>
              {!ok && isNext && (
                <Link
                  href={s.cta.href}
                  className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-bg transition-transform active:scale-[0.96] hover:bg-accent/90"
                >
                  {s.cta.label} →
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
