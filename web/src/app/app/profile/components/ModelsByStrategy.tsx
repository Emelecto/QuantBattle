"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getUserModelsHistory,
  getViewerId,
  type ModelHistory,
} from "@/lib/modelsHistory";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/Button";

function fmtSharpe(s: number | null): string {
  return s == null ? "—" : `${s >= 0 ? "+" : ""}${s.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
}

/** Una fila por modelo/estrategia enviada a torneos, expandible al detalle de rounds. */
function ModelRow({ model }: { model: ModelHistory }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="qb-row">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-solid"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Identidad del modelo */}
        <span className="metric min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {model.symbol}
          <span className="ml-1.5 text-[11px] font-normal text-muted">
            {model.timeframe}
          </span>
        </span>

        {/* Métricas agregadas */}
        <span
          className={`metric hidden text-[12px] sm:inline ${
            model.best_sharpe_oos == null
              ? "text-muted"
              : model.best_sharpe_oos >= 0
                ? "text-long"
                : "text-short"
          }`}
          title="Mejor Sharpe OOS histórico"
        >
          {fmtSharpe(model.best_sharpe_oos)}
        </span>
        <span
          className="metric hidden w-[70px] text-right text-[11px] text-muted md:inline"
          title="Rounds enviados"
        >
          {model.rounds} {model.rounds === 1 ? "round" : "rounds"}
        </span>
        <Badge tone={model.streak > 0 ? "long" : "neutral"} mono>
          {model.streak}🔥
        </Badge>
      </button>

      {/* Detalle: historial de rounds */}
      {open && (
        <div className="border-t border-line bg-surface-solid px-5 py-3">
          {model.history.some((r) => r.sharpe_oos != null) ? (
            <table className="w-full">
              <thead>
                <tr className="metric text-left text-[10px] uppercase tracking-wider text-muted">
                  <th className="pb-1.5 pr-4 font-normal">Fecha</th>
                  <th className="pb-1.5 pr-4 font-normal">Torneo</th>
                  <th className="pb-1.5 text-right font-normal">Sharpe OOS</th>
                </tr>
              </thead>
              <tbody>
                {model.history.map((r) => (
                  <tr key={r.id}>
                    <td className="metric py-1 pr-4 text-[11px] text-muted whitespace-nowrap">
                      {fmtDate(r.submitted_at)}
                    </td>
                    <td className="max-w-[220px] truncate py-1 pr-4 text-[12px] text-ink/80">
                      {r.tournament_name ?? "Torneo"}
                      {r.sharpe_oos == null && (
                        <span className="metric ml-2 text-[10px] text-muted">
                          ({r.status === "pending" ? "pendiente" : r.status})
                        </span>
                      )}
                    </td>
                    <td
                      className={`metric py-1 text-right text-[11px] ${
                        r.sharpe_oos == null
                          ? "text-muted"
                          : r.sharpe_oos >= 0
                            ? "text-long"
                            : "text-short"
                      }`}
                    >
                      {fmtSharpe(r.sharpe_oos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="metric py-2 text-[11px] text-muted">
              Rounds sin evaluar todavía.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function ModelsByStrategy({ userId }: { userId: string }) {
  const [models, setModels] = useState<ModelHistory[] | null>(null);
  const [ownProfile, setOwnProfile] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getUserModelsHistory(userId), getViewerId()])
      .then(([history, viewerId]) => {
        if (!active) return;
        setModels(history);
        setOwnProfile(viewerId === userId);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [userId]);

  const heading = ownProfile ? "Mis modelos" : "Modelos";

  // Cargando
  if (models == null) {
    return (
      <div data-tour="models-by-strategy">
        <h2 className="mb-4 text-lg font-semibold text-ink">{heading}</h2>
        <div className="qb-glass space-y-3 rounded-xl p-5">
          <Skeleton variant="line" />
          <Skeleton variant="line" />
          <Skeleton variant="line" />
        </div>
      </div>
    );
  }

  return (
    <div data-tour="models-by-strategy">
      <h2 className="mb-4 text-lg font-semibold text-ink">{heading}</h2>

      {models.length === 0 ? (
        /* Empty state honesto */
        <div className="qb-glass qb-elev-1 rounded-xl px-6 py-10 text-center">
          <p className="text-sm text-muted">
            {failed
              ? "No se pudo cargar el historial de torneos."
              : ownProfile
                ? "Aún no has enviado estrategias a torneos."
                : "Sin envíos a torneos todavía."}
          </p>
          {ownProfile && !failed && (
            <Link
              href="/app/strategies/new"
              className={`${buttonClasses("primary", "sm")} mt-4`}
            >
              Crear estrategia
            </Link>
          )}
        </div>
      ) : (
        <ul className="qb-glass divide-y divide-line overflow-hidden rounded-xl">
          {models.map((m) => (
            <ModelRow key={m.key} model={m} />
          ))}
        </ul>
      )}
    </div>
  );
}
