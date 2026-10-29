"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  ACTIVATION_STEPS,
  markStep,
  useActivation,
  type ActivationStepId,
} from "@/lib/activation";

/**
 * Hero "Siguiente acción" + tira compacta del checklist (4 pasos).
 * Va ANCHO COMPLETO sobre el bento grid: no toca el layout Glass Terminal.
 * Auto-repara el estado con datos reales del dashboard (usuarios existentes
 * que ya crearon/corrieron/compiten ven su progreso real, no un checklist
 * vacío).
 */
export function NextAction({
  strategyCount,
  ranBacktest,
  competing,
}: {
  strategyCount: number;
  ranBacktest: boolean;
  competing: boolean;
}) {
  const { state, done, total, next } = useActivation();

  useEffect(() => {
    const fixes: ActivationStepId[] = [];
    if (strategyCount > 0 && !state.crea) fixes.push("crea");
    if (ranBacktest && !state.corre) fixes.push("corre");
    if (competing && !state.compite) fixes.push("compite");
    fixes.forEach(markStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyCount, ranBacktest, competing]);

  if (!next) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <section
      aria-label="Siguiente acción"
      data-tour="siguiente-accion"
      className="qb-glass qb-elev-1 mb-4 rounded-xl p-4 md:p-5"
    >
      <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-bg"
        >
          {next.n}
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Siguiente acción · paso {done + 1} de {total} · +{next.qp} QP
          </p>
          <p className="truncate text-sm font-semibold text-ink md:text-base">
            {next.titulo}: <span className="font-normal text-muted">{next.detalle}</span>
          </p>
        </div>
        <Link
          href={next.cta.href}
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-bg transition-transform active:scale-[0.96] hover:bg-accent/90 md:text-sm"
        >
          {next.cta.label} →
        </Link>
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Progreso de activación">
        {ACTIVATION_STEPS.map((s) => {
          const ok = state[s.id];
          if (ok) {
            return (
              <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center rounded-full bg-long text-[10px] font-bold text-bg"
                  style={{ height: 18, width: 18 }}
                >
                  ✓
                </span>
                <span className="text-muted line-through">{s.titulo}</span>
              </li>
            );
          }
          return (
            <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
              <span
                aria-hidden="true"
                className={`flex items-center justify-center rounded-full text-[10px] font-bold ${
                  s.id === next.id ? "bg-accent text-bg" : "bg-surface-solid text-muted"
                }`}
                style={{ height: 18, width: 18 }}
              >
                {s.n}
              </span>
              <Link
                href={s.cta.href}
                className={s.id === next.id ? "font-semibold text-ink" : "text-muted"}
              >
                {s.titulo}
              </Link>
            </li>
          );
        })}
        <li className="ml-auto hidden font-mono text-[11px] text-muted sm:block" aria-hidden="true">
          {pct}% · {done}/{total}
        </li>
      </ol>
    </section>
  );
}
