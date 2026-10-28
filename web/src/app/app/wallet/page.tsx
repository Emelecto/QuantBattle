"use client";

import { useEffect, useState } from "react";
import { getBalance, getLedger } from "@/lib/tokens";
import { QP_PRICES, TIER } from "@/lib/constants";
import { TierBadge } from "@/components/ui/TierBadge";
import type { TokenBalance, TokenLedgerEntry } from "@/lib/tournaments";

type PlanKey = "plus" | "pro" | "legend";

const PLAN_MAP: Record<number, PlanKey> = {
  100: "plus",
  300: "pro",
  1000: "legend",
};
const BILLING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BILLING === "true";

function WalletSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 animate-fadeIn">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ql-skeleton-card rounded-xl p-5 space-y-3">
            <div className="ql-skeleton-line w-20" />
            <div className="ql-skeleton-line w-32 h-8 mt-2" />
          </div>
        ))}
      </div>
      <div className="ql-skeleton-card rounded-xl p-5 space-y-4">
        <div className="ql-skeleton-line w-32" />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ql-skeleton h-32 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="ql-skeleton-card rounded-xl p-5 space-y-4">
        <div className="ql-skeleton-line w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ql-skeleton-line w-full h-8" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyLedgerState() {
  return (
    <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-dashed border-line bg-surface/20 px-6 py-12 text-center animate-fadeIn">
      <svg
        className="opacity-50"
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="30" stroke="rgba(94,234,212,0.25)" strokeWidth="1.5" fill="none" />
        <path d="M30 40 L36 46 L50 34" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="40" cy="40" r="30" stroke="rgba(56,189,248,0.15)" strokeWidth="1" strokeDasharray="4 4" fill="none" />
      </svg>
      <div>
        <p className="text-sm font-medium text-ink">Tu primera transacción aparecerá aquí</p>
        <p className="mt-1 text-xs text-muted">Los movimientos de puntos virtuales aparecerán aquí. Los torneos ML no otorgan QP.</p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [ledger, setLedger] = useState<TokenLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<PlanKey | null>(null);
  const [stripeDisabled, setStripeDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, l] = await Promise.all([getBalance(), getLedger()]);
        setBalance(b);
        setLedger(l);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubscribe(qpAmount: number) {
    const plan = PLAN_MAP[qpAmount];
    if (!plan) return;

    setSubscribing(plan);
    setError(null);
    setStripeDisabled(false);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const json = await res.json();

      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }

      if (json.message === "Stripe no configurado") {
        setStripeDisabled(true);
        return;
      }

      setError(json.error || "No se pudo iniciar la suscripción");
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
    } finally {
      setSubscribing(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col">
        <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
          <div className="ql-skeleton-line w-48 h-8" />
          <div className="ql-skeleton-line w-72 h-4 mt-2" />
          <div className="mt-8">
            <WalletSkeleton />
          </div>
        </div>
      </main>
    );
  }

  const tier = balance?.tier || "free";
  const tierInfo = TIER[tier as keyof typeof TIER] || TIER.free;

  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <div className="flex flex-wrap items-center gap-3 animate-fadeIn">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Mi Wallet
          </h1>
          <TierBadge tier={balance?.tier} />
        </div>
        <p className="mt-2 text-sm text-muted animate-fadeIn">
          Gestiona tus QuantPoints (QP).
        </p>

        {/* Balance */}
        <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-3 animate-fadeIn">
          <div className="ql-glass ql-elev-2 ql-glass-hover rounded-xl p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Balance</p>
            <p className="mt-2 text-3xl font-semibold text-accent ql-glow-text">
              {balance?.balance ?? 0} QP
            </p>
          </div>
          <div className="ql-glass ql-elev-1 ql-glass-hover rounded-xl p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Tier</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {tierInfo.label}
            </p>
          </div>
          <div className="ql-glass ql-elev-1 ql-glass-hover rounded-xl p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Ganados total</p>
            <p className="mt-2 text-2xl font-semibold text-long">
              {balance?.lifetime_earned ?? 0}
            </p>
          </div>
        </div>

        {!BILLING_ENABLED && (
          <p className="mt-8 border-t border-line pt-5 text-sm leading-relaxed text-muted">
            Este prototipo de investigación tiene los pagos desactivados. Los QP son puntos virtuales sin valor monetario; participar en torneos ML es gratuito y no genera premios QP.
          </p>
        )}
        {/* Comprar QP */}
        {BILLING_ENABLED && (
        <div className="mt-8 ql-glass ql-elev-1 ql-glass-hover rounded-xl p-5 animate-fadeIn">
          <h2 className="text-sm font-semibold text-ink">Comprar QP</h2>

          {/* Banner Stripe deshabilitado */}
          {stripeDisabled && (
            <div className="mt-4 rounded-lg border border-line bg-surface-solid px-4 py-3 text-center text-sm text-muted">
              <p className="font-medium text-ink">Compras próximamente</p>
              <p className="mt-1">El método de pago estará disponible pronto.</p>
            </div>
          )}

          {/* Banner de error */}
          {error && (
            <div className="mt-4 rounded-lg border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
              {error}
            </div>
          )}

          <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-3">
            {QP_PRICES.map((p) => {
              const plan = PLAN_MAP[p.amount];
              const isSubscribing = subscribing === plan;
              return (
                <div key={p.usd} className="flex flex-col rounded-lg border border-line bg-surface-solid p-4 text-center">
                  <p className="text-2xl font-semibold text-ink">{p.amount} QP</p>
                  <p className="mt-1 text-sm text-muted">${p.usd}/mes</p>
                  <div className="mb-4 mt-2 flex min-h-[20px] items-center justify-center gap-1">
                  {"popular" in p && (
                    <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                      Popular
                    </span>
                  )}
                  {"bonus" in p && (
                    <span className="inline-block rounded bg-long/15 px-2 py-0.5 text-[11px] font-medium text-long">
                      {p.bonus}
                    </span>
                  )}
                  </div>
                  <button
                    onClick={() => handleSubscribe(p.amount)}
                    disabled={isSubscribing || stripeDisabled}
                    className="mt-auto w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.96] ql-btn"
                  >
                    {isSubscribing ? "Procesando..." : "Suscribirse"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        )}
        {/* Historial */}
        <div className="mt-8 animate-fadeIn">
          <h2 className="text-lg font-semibold text-ink">Historial</h2>
          {ledger.length === 0 ? (
            <EmptyLedgerState />
          ) : (
            <div className="mt-3 ql-glass ql-elev-1 overflow-hidden rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Memo</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-b border-line/50">
                      <td className="px-4 py-3 text-muted">
                        {new Date(e.created_at).toLocaleDateString("es-ES")}
                      </td>
                      <td className="px-4 py-3 text-ink">{e.type}</td>
                      <td className="px-4 py-3 text-muted">{e.memo || "—"}</td>
                      <td className={`px-4 py-3 text-right font-mono ${e.amount >= 0 ? "text-long" : "text-short"}`}>
                        {e.amount >= 0 ? "+" : ""}{e.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Aviso legal */}
        <p className="mt-8 text-[11px] text-muted">
          Los QuantPoints (QP) son puntos virtuales sin valor monetario. No se pueden retirar ni intercambiar por dinero.
          Su utilidad es exclusivamente dentro de la plataforma QuantLab.
        </p>
      </div>
    </main>
  );
}
