"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getMarketplaceStrategies, type MarketplaceStrategy } from "@/lib/tokens";
import { MarketplaceCard } from "../../components/MarketplaceCard";

function StarIcon({ active }: { active: boolean }) {
  return (
    <span className={`text-sm ${active ? "text-accent" : "text-line"}`}>★</span>
  );
}

function MarketplaceSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 animate-fadeIn">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="qb-skeleton-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="qb-skeleton-circle h-8 w-8" />
            <div className="flex-1 space-y-2">
              <div className="qb-skeleton-line w-24" />
              <div className="qb-skeleton-line w-16" />
            </div>
          </div>
          <div className="qb-skeleton-line w-3/4" />
          <div className="qb-skeleton-line w-full" />
          <div className="grid grid-cols-2 gap-2">
            <div className="qb-skeleton h-14 rounded-md" />
            <div className="qb-skeleton h-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyMarketplaceState() {
  return (
    <div className="qb-glass qb-elev-1 flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center animate-fadeIn">
      <svg
        className="opacity-60"
        width="140"
        height="100"
        viewBox="0 0 140 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="20" y="25" width="100" height="55" rx="6" stroke="rgba(94,234,212,0.3)" strokeWidth="1.5" fill="none" />
        <path d="M35 60 L55 45 L70 55 L90 35 L105 50" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="35" cy="60" r="2.5" fill="#5eead4" />
        <circle cx="55" cy="45" r="2.5" fill="#5eead4" />
        <circle cx="70" cy="55" r="2.5" fill="#5eead4" />
        <circle cx="90" cy="35" r="2.5" fill="#5eead4" />
        <circle cx="105" cy="50" r="2.5" fill="#5eead4" />
        <path d="M25 20 L30 10 L35 20" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="110" cy="15" r="1.5" fill="rgba(56,189,248,0.3)" />
      </svg>
      <p className="text-lg font-semibold text-ink">
        Todavía no hay estrategias con evidencia publicada
      </p>
      <p className="max-w-md text-sm text-muted">
        Las estrategias sin métricas respaldadas se conservan fuera del catálogo. Puedes preparar una estrategia y revisar su evidencia antes de publicarla.
      </p>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<MarketplaceStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assetFilter, setAssetFilter] = useState("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [minRating, setMinRating] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    getMarketplaceStrategies()
      .then((rows) => {
        if (!active) return;
        setStrategies(rows);
        setError(null);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Error al cargar marketplace");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    let rows = strategies.slice();

    if (assetFilter !== "all") {
      rows = rows.filter((s) => s.asset_type === assetFilter);
    }

    // Defensivo: una fila sin price_qp numérico NO debe desaparecer del
    // listado (antes undefined >= 0 era false y escondía la estrategia).
    rows = rows.filter((s) => {
      const p = typeof s.price_qp === "number" ? s.price_qp : 0;
      return p >= priceRange[0] && p <= priceRange[1];
    });

    if (minRating > 0) {
      rows = rows.filter((s) => (s.rating ?? 0) >= minRating);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          (s.title ?? "").toLowerCase().includes(q) ||
          (s.symbol ?? "").toLowerCase().includes(q) ||
          (s.author ?? "").toLowerCase().includes(q),
      );
    }

    return rows;
  }, [strategies, assetFilter, priceRange, minRating, query]);

  return (
    <main className="flex min-h-screen flex-col">
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl animate-fadeIn">
                Marketplace
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base animate-fadeIn">
                Suscríbete a estrategias de la comunidad y recibe señales en
                paper trading.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/app/marketplace/my-subscriptions")}
              className="qb-btn-secondary h-9 rounded-md px-3 text-[13px] active:scale-[0.96]"
            >
              Mis suscripciones
            </button>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <div className="border-b border-line bg-surface/40">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
          <select
            aria-label="Filtrar por activo"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="qb-input h-9 rounded-md px-3 text-[13px]"
          >
            <option value="all">Todos los activos</option>
            <option value="crypto">Cripto</option>
            <option value="stock">Acciones</option>
          </select>

          <select
            aria-label="Rango de precio"
            value={`${priceRange[0]}-${priceRange[1]}`}
            onChange={(e) => {
              const [min, max] = e.target.value.split("-").map(Number);
              setPriceRange([min, max]);
            }}
            className="qb-input h-9 rounded-md px-3 text-[13px]"
          >
            <option value="0-10000">Cualquier precio</option>
            <option value="0-50">Hasta 50 QP/sem</option>
            <option value="50-200">50 — 200 QP/sem</option>
            <option value="200-10000">200+ QP/sem</option>
          </select>

          {/* Rating mínimo */}
          <div className="flex items-center gap-1">
            <span className="metric text-[11px] text-muted">Rating ≥</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMinRating(minRating === n ? 0 : n)}
                  aria-label={`${n} estrellas`}
                  className="active:scale-[0.96]"
                >
                  <StarIcon active={n <= minRating} />
                </button>
              ))}
            </div>
          </div>

          <input
            type="search"
            placeholder="Buscar estrategia…"
            aria-label="Buscar estrategia"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="qb-input h-9 min-w-[160px] flex-1 rounded-md px-3 text-[13px]"
          />

          <span className="metric ml-auto text-[12px] text-muted">
            {visible.length} de {strategies.length}
          </span>
        </div>
      </div>

      <p className="mx-auto mt-6 w-full max-w-6xl px-6 text-sm text-muted">Catálogo experimental. Los registros sin métricas guardadas o sin huella de evaluación quedan fuera de la vista pública. Una métrica de backtesting no garantiza resultados futuros.</p>

      {/* Grid */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          {loading ? (
            <MarketplaceSkeleton />
          ) : error ? (
            <div className="rounded-lg border border-short/40 bg-short/[0.08] px-4 py-3 text-sm text-short animate-fadeIn">
              {error}
            </div>
          ) : visible.length === 0 ? (
            strategies.length === 0 ? (
              <EmptyMarketplaceState />
            ) : (
              <div className="qb-glass qb-elev-1 flex flex-col items-center gap-3 rounded-xl px-6 py-16 text-center animate-fadeIn">
                <p className="text-lg font-semibold text-ink">
                  Sin resultados
                </p>
                <p className="max-w-md text-sm text-muted">
                  No hay estrategias que coincidan con los filtros seleccionados.
                </p>
              </div>
            )
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 animate-fadeIn">
              {visible.map((s) => (
                <MarketplaceCard key={s.id} strategy={s} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
