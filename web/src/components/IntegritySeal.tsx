import { Badge } from "@/components/ui/Badge";

export interface IntegritySealProps {
  /** Métricas de backtest (jsonb). Puede traer bench_buyhold / method / replicable. */
  backtest_metrics?: Record<string, number | string> | null;
  /** Columna de Fase 2; si no existe aún, se infiere de backtest_metrics. */
  replicable?: boolean | null;
  /** Columna de Fase 2; si no existe aún, se infiere de backtest_metrics. */
  method?: string | null;
  /** Tamaño del sello. "lg" lo usa la pestaña de Integridad. */
  size?: "sm" | "lg";
}

/**
 * Sello de Integridad — eje central del rediseño del marketplace.
 *
 * Lee de `backtest_metrics` (jsonb ya existente) y de las columnas nuevas de
 * Fase 2 (todas opcionales). Si la migración 0012 aún no se aplicó, todo cae a
 * valores por defecto y la UI no explota.
 *
 *  - Replicable: ✓ verde / ✗ gris (no verificado aún).
 *  - Benchmark:  "+X% vs B&H" verde / "−Y% vs B&H" rojo (lee bench_buyhold).
 *  - Método:     texto de `method` o fallback "walk-forward OOS".
 */
export function IntegritySeal({
  backtest_metrics,
  replicable,
  method,
  size = "sm",
}: IntegritySealProps) {
  const m = (backtest_metrics ?? {}) as Record<string, any>;

  // Replicable: prioriza la columna nueva, sino el flag dentro de backtest_metrics.
  const isReplicable =
    typeof replicable === "boolean"
      ? replicable
      : Boolean(m?.replicable);

  // Benchmark vs buy&hold (puede venir de columna o de backtest_metrics).
  const bench =
    typeof m?.bench_buyhold === "number" ? m.bench_buyhold : undefined;
  const benchLabel =
    bench == null
      ? "Benchmark —"
      : `${bench >= 0 ? "+" : "−"}${Math.abs(bench).toFixed(1)}% vs B&H`;

  const methodText =
    (typeof method === "string" && method.trim()) ||
    (typeof m?.method === "string" && m.method.trim()) ||
    "Método no registrado";

  const badgeCls = size === "lg" ? "text-[12px] px-2.5 py-1" : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        tone={isReplicable ? "long" : "neutral"}
        mono
        className={badgeCls}
      >
        {isReplicable ? "Replicabilidad comprobada" : "Sin sello de replicabilidad"}
      </Badge>

      <Badge
        tone={bench == null ? "neutral" : bench >= 0 ? "long" : "short"}
        mono
        className={badgeCls}
      >
        {benchLabel}
      </Badge>

      <Badge tone="cyan" mono className={badgeCls}>
        {methodText}
      </Badge>
    </div>
  );
}
