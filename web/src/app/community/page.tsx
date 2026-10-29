"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { SpotlightCard } from "@/components/SpotlightCard";
import { getPublicStrategies, type PublicStrategy } from "@/lib/db";

function assetLabel(asset_type: string): string {
  return asset_type === "crypto" ? "Cripto" : "Acción";
}

function descriptionFor(s: PublicStrategy): string {
  const who = s.display_name || s.username || "anónimo";
  return `Estrategia de ${who} para ${s.symbol} en ${assetLabel(s.asset_type)}.`;
}

export default function CommunityPage() {
  const router = useRouter();
  const toast = useToast();
  const [strategies, setStrategies] = useState<PublicStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [assetFilter, setAssetFilter] = useState("all");
  const [sort, setSort] = useState("sharpe");
  const [query, setQuery] = useState("");

  async function handleClone(s: PublicStrategy) {
    try {
      await navigator.clipboard.writeText(s.code);
      toast.success("Código copiado. Pégalo en el editor para clonar.");
    } catch {
      toast.error("No se pudo copiar el código.");
    }
    router.push("/app/backtesting/new");
  }

  useEffect(() => {
    let active = true;
    getPublicStrategies()
      .then((rows) => {
        if (!active) return;
        setStrategies(rows);
        setFetchError(null);
      })
      .catch((e) => {
        if (!active) return;
        setFetchError(
          e instanceof Error ? e.message : "No se pudieron cargar las estrategias.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    let rows = strategies.slice();

    if (assetFilter !== "all") {
      rows = rows.filter(
        (s) =>
          s.symbol.includes(assetFilter) ||
          assetLabel(s.asset_type) === assetFilter,
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.symbol.toLowerCase().includes(q) ||
          (s.username ?? "").toLowerCase().includes(q),
      );
    }

    if (sort === "recent") {
      rows.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else {
      // 'sharpe' | 'clones' (sin datos de clones -> por Sharpe)
      rows.sort((a, b) => (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity));
    }
    return rows;
  }, [strategies, assetFilter, sort, query]);

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Comunidad
          </h1>
          <p className="mt-3 text-sm text-muted md:text-base">
            Estrategias compartidas por la comunidad
          </p>
        </div>
      </section>

      {/* BARRA DE FILTROS */}
      <div className="border-b border-line bg-surface/40">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
          <select
            aria-label="Filtrar por activo"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="qb-input h-9 rounded-md px-3 text-[13px]"
          >
            <option value="all">Activo ▾</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
            <option value="SPY">SPY</option>
            <option value="AAPL">AAPL</option>
            <option value="Cripto">Cripto</option>
            <option value="Acción">Acción</option>
          </select>

          <select
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="qb-input h-9 rounded-md px-3 text-[13px]"
          >
            <option value="sharpe">Orden ▾</option>
            <option value="recent">Más recientes</option>
            <option value="clones">Más clonadas</option>
          </select>

          <input
            type="search"
            placeholder="Buscar estrategia…"
            aria-label="Buscar estrategia"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="qb-input h-9 min-w-[160px] flex-1 rounded-md px-3 text-[13px]"
          />

          <span className="metric ml-auto text-[12px] text-muted">
            {strategies.length} estrategias
          </span>
        </div>
      </div>

      {/* GRID DE ESTRATEGIAS */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="card" className="!h-52" />
              ))}
            </div>
          ) : fetchError ? (
            <div className="rounded-lg border border-short/40 bg-short/[0.08] px-4 py-3 text-sm text-short">
              {fetchError}
            </div>
          ) : visible.length === 0 ? (
            <div className="qb-glass qb-elev-1 flex flex-col items-center gap-3 rounded-xl px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ink">
                Sé el primero en compartir
              </p>
              <p className="max-w-md text-sm text-muted">
                Aún no hay estrategias públicas. Crea la tuya, actívala en
                &ldquo;Compartir en la comunidad&rdquo; y aparece aquí.
              </p>
              <Link
                href="/app/backtesting/new"
                className={buttonClasses("primary", "sm")}
              >
                Crear estrategia
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((s) => (
                <SpotlightCard key={s.id} className="qb-glass qb-elev-1 flex flex-col">
                  <div className="flex items-center gap-2.5 px-5 pt-5">
                    <span
                      aria-hidden
                      className="metric flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-solid text-[11px] text-muted"
                    >
                      {(s.username ?? "??").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="metric truncate text-[12px] text-muted">
                      @{s.username ?? "anónimo"}
                    </span>
                  </div>

                  <div className="px-5 pt-3">
                    <h2 className="text-[15px] font-semibold text-ink">
                      {s.title}
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                      {descriptionFor(s)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
                    <Badge tone="neutral" mono>
                      {assetLabel(s.asset_type)}
                    </Badge>
                    <Badge tone={s.sharpe != null && s.sharpe >= 0 ? "long" : "short"} mono>
                      Sharpe {s.sharpe != null ? s.sharpe.toFixed(1) : "—"}
                    </Badge>
                  </div>

                  <div className="mt-auto flex items-center gap-2 px-5 py-4">
                    <Link
                      href={`/app/strategies/${s.id}/results`}
                      className={buttonClasses("secondary", "sm")}
                    >
                      Ver
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleClone(s)}
                      className={buttonClasses("primary", "sm")}
                    >
                      Clonar
                    </button>
                  </div>
                </SpotlightCard>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
