"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getMySubscriptions,
  pauseSubscription,
  cancelSubscription,
  resumeSubscription,
  type Subscription,
} from "@/lib/tokens";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";

const statusConfig: Record<
  Subscription["status"],
  { label: string; tone: "long" | "cyan" | "short" }
> = {
  active: { label: "Activa", tone: "long" },
  paused: { label: "Pausada", tone: "cyan" },
  cancelled: { label: "Cancelada", tone: "short" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}

export default function MySubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getMySubscriptions();
      setSubs(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar suscripciones");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePause(s: Subscription) {
    setBusy(s.id);
    try {
      if (s.status === "active") {
        await pauseSubscription(s.id);
      } else {
        await resumeSubscription(s.id);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la suscripción.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel(s: Subscription) {
    setBusy(s.id);
    try {
      await cancelSubscription(s.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar la suscripción.");
    } finally {
      setBusy(null);
    }
  }

  const totalWeekly = subs
    .filter((s) => s.status === "active")
    .reduce((acc, s) => acc + (s.price_qp ?? 0), 0);

  const totalPnl = subs.reduce((acc, s) => acc + (s.paper_pnl ?? 0), 0);

  return (
    <main className="flex min-h-screen flex-col">
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                Mis suscripciones
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
                Gestiona tus suscripciones activas y pausadas.
              </p>
            </div>
            <Link
              href="/app/marketplace"
              className="ql-btn-secondary h-9 rounded-md px-3 text-[13px]"
            >
              Explorar marketplace
            </Link>
          </div>
        </div>
      </section>

      {/* Resumen rápido */}
      <section className="border-b border-line bg-surface/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="ql-glass ql-elev-1 rounded-lg px-4 py-3">
              <p className="metric text-[10px] uppercase tracking-wider text-muted">
                Suscripciones activas
              </p>
              <p className="metric mt-1 text-2xl font-semibold text-ink">
                {subs.filter((s) => s.status === "active").length}
              </p>
            </div>
            <div className="ql-glass ql-elev-1 rounded-lg px-4 py-3">
              <p className="metric text-[10px] uppercase tracking-wider text-muted">
                Costo semanal
              </p>
              <p className="metric mt-1 text-2xl font-semibold text-accent">
                {totalWeekly.toLocaleString()} QP
              </p>
            </div>
            <div className="ql-glass ql-elev-1 rounded-lg px-4 py-3">
              <p className="metric text-[10px] uppercase tracking-wider text-muted">
                P&L paper trading
              </p>
              <p
                className={`metric mt-1 text-2xl font-semibold ${
                  totalPnl >= 0 ? "text-long" : "text-short"
                }`}
              >
                {totalPnl >= 0 ? "+" : ""}
                {totalPnl.toLocaleString()} QP
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Lista de suscripciones */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          {loading ? (
            <p className="metric text-sm text-muted">Cargando suscripciones…</p>
          ) : error ? (
            <div className="rounded-lg border border-short/40 bg-short/[0.08] px-4 py-3 text-sm text-short">
              {error}
            </div>
          ) : subs.length === 0 ? (
            <div className="ql-glass ql-elev-1 flex flex-col items-center gap-3 rounded-xl px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ink">
                Sin suscripciones
              </p>
              <p className="max-w-md text-sm text-muted">
                Aún no te has suscrito a ninguna estrategia. Explora el
                marketplace para encontrar una que se ajuste a tu estilo.
              </p>
              <Link
                href="/app/marketplace"
                className={buttonClasses("primary", "md")}
              >
                Explorar marketplace
              </Link>
            </div>
          ) : (
            <div className="ql-glass overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-surface/40">
                      <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                        Estrategia
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                        Precio/sem
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                        P&L paper
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                        Inicio
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => {
                      const cfg = statusConfig[s.status];
                      return (
                        <tr
                          key={s.id}
                          className="ql-row border-b border-line last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-[13px] font-medium text-ink">
                                {(s.strategy_title ?? "—")}
                              </p>
                              <p className="metric text-[11px] text-muted">
                                {(s.symbol ?? "—")}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={cfg.tone}>{cfg.label}</Badge>
                          </td>
                          <td className="metric px-4 py-3 text-right text-[13px] text-accent">
                            {(s.price_qp ?? 0)} QP
                          </td>
                          <td
                            className={`metric px-4 py-3 text-right text-[13px] font-medium ${
                              (s.paper_pnl ?? 0) >= 0 ? "text-long" : "text-short"
                            }`}
                          >
                            {s.paper_pnl != null
                              ? `${s.paper_pnl >= 0 ? "+" : ""}${s.paper_pnl.toLocaleString()} QP`
                              : "—"}
                          </td>
                          <td className="metric px-4 py-3 text-right text-[12px] text-muted">
                            {timeAgo(s.started_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handlePause(s)}
                                disabled={busy === s.id || s.status === "cancelled"}
                                className="ql-btn-secondary h-7 rounded px-2 text-[11px]"
                              >
                                {s.status === "paused" ? "Reanudar" : "Pausar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancel(s)}
                                disabled={busy === s.id || s.status === "cancelled"}
                                className="h-7 rounded px-2 text-[11px] text-short border border-short/30 hover:bg-short/10 transition-colors disabled:opacity-40"
                              >
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
