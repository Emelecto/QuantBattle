"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { subscribeToStrategy } from "@/lib/tournaments";
import type { MarketplaceStrategy } from "@/lib/tokens";
import { IntegritySeal } from "@/components/IntegritySeal";

const assetLabels: Record<string, string> = {
  crypto: "Cripto",
  stock: "Acción",
};

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`text-[12px] ${
            i <= full
              ? "text-accent"
              : i === full + 1 && hasHalf
              ? "text-accent/60"
              : "text-line"
          }`}
        >
          ★
        </span>
      ))}
      <span className="metric ml-1 text-[11px] text-muted">{rating.toFixed(1)}</span>
    </span>
  );
}

export function MarketplaceCard({ strategy }: { strategy: MarketplaceStrategy }) {
  const assetLabel = assetLabels[strategy.asset_type] ?? strategy.asset_type;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubscribe() {
    setBusy(true);
    setMsg(null);
    try {
      await subscribeToStrategy(strategy.id);
      const precio = strategy.price_qp ?? 0;
      setMsg(`✅ Suscrito · −${precio} QP`);
      router.push("/app/marketplace/my-subscriptions");
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : "No se pudo suscribir.";
      // El worker responde 402 (QP insuficientes) cuando el saldo no alcanza.
      // `call` eleva "HTTP 402" o el mensaje "QP insuficientes" del detail.
      if (errMsg.includes("402") || errMsg.toLowerCase().includes("insuficiente")) {
        setMsg("QP insuficientes");
      } else {
        setMsg(errMsg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qb-perspective">
      <article className="qb-glass qb-tilt flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <span
            aria-hidden
            className="metric flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-solid text-[12px] text-muted"
          >
            {(strategy.author ?? "??").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <span className="metric truncate text-[12px] text-muted block">
              @{strategy.author ?? "anónimo"}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge tone="neutral" mono>
                {assetLabel}
              </Badge>
              <Badge
                tone={
                  strategy.delivers === "package"
                    ? "violet"
                    : "cyan"
                }
                mono
              >
                {strategy.delivers === "package"
                  ? "Paquete completo"
                  : "Señales en vivo"}
              </Badge>
              <Badge tone="neutral" mono>
                {strategy.symbol}
              </Badge>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="metric text-[10px] uppercase tracking-wider text-muted">Precio</p>
            <p className="metric text-accent qb-glow-text text-sm font-semibold whitespace-nowrap">
              {strategy.price_qp}/sem
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 flex-1">
          <h2 className="text-[15px] font-semibold text-ink leading-tight">
            {strategy.title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted line-clamp-2">
            {strategy.description}
          </p>

          {/* Sello de Integridad */}
          <div className="mt-3">
            <IntegritySeal
              backtest_metrics={strategy.backtest_metrics}
              replicable={strategy.replicable}
              method={strategy.method}
            />
          </div>

          {/* Métricas */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-line bg-surface/50 px-3 py-2">
              <p className="metric text-[10px] uppercase tracking-wider text-muted">Sharpe OOS</p>
              <p
                className={`metric text-sm font-semibold ${
                  (strategy.sharpe ?? 0) >= 0 ? "text-long" : "text-short"
                }`}
              >
                {strategy.sharpe?.toFixed(2) ?? "—"}
              </p>
            </div>
            <div className="rounded-md border border-line bg-surface/50 px-3 py-2">
              <p className="metric text-[10px] uppercase tracking-wider text-muted">MaxDD</p>
              <p className="metric text-sm font-semibold text-short">
                {strategy.max_dd != null ? `${strategy.max_dd.toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>

          {/* Rating */}
          <div className="mt-3 flex items-center justify-between">
            <StarRating rating={strategy.rating ?? 0} />
            <span className="metric text-[11px] text-muted">
              {strategy.subscribers ?? 0} suscriptores
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-line px-5 py-4">
          {msg && (
            <p
              className={`mb-2 text-[12px] ${
                msg.startsWith("✅") ? "text-long" : "text-short"
              }`}
            >
              {msg}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Link
              href={`/app/marketplace/${strategy.id}`}
              className={buttonClasses("secondary", "sm")}
            >
              Ver detalle
            </Link>
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className={buttonClasses("primary", "sm")}
            >
              {busy ? "Suscribiendo…" : "Suscribirse"}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}