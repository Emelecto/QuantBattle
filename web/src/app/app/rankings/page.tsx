"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getGlobalLeaderboard,
  type LeaderboardTab,
  type PublicLeaderboardEntry,
} from "@/lib/tournaments";
import { LeaderboardRow } from "../components/LeaderboardRow";
import { useAuth } from "@/lib/useAuth";
import Link from "next/link";

type RankMode = "global" | "country";

const modeTabs: { id: RankMode; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "country", label: "Por país" },
];

// Métricas del modo Global (el viejo tab agregado "País" lo sustituye el modo "Por país")
const tabs: { id: LeaderboardTab; label: string }[] = [
  { id: "qp", label: "QP Ganados" },
  { id: "tournaments", label: "Torneos" },
];

const countryNames: Record<string, string> = {
  AR: "Argentina",
  BO: "Bolivia",
  BR: "Brasil",
  CL: "Chile",
  CO: "Colombia",
  CR: "Costa Rica",
  CU: "Cuba",
  EC: "Ecuador",
  SV: "El Salvador",
  ES: "España",
  GT: "Guatemala",
  HN: "Honduras",
  MX: "México",
  NI: "Nicaragua",
  PA: "Panamá",
  PY: "Paraguay",
  PE: "Perú",
  DO: "Rep. Dominicana",
  UY: "Uruguay",
  VE: "Venezuela",
  US: "Estados Unidos",
  PT: "Portugal",
  FR: "Francia",
  DE: "Alemania",
  IT: "Italia",
  GB: "Reino Unido",
  CA: "Canadá",
  AU: "Australia",
  JP: "Japón",
  KR: "Corea del Sur",
  CN: "China",
  IN: "India",
  NL: "Países Bajos",
  CH: "Suiza",
  SE: "Suecia",
  NO: "Noruega",
  PL: "Polonia",
  RU: "Rusia",
  UA: "Ucrania",
  TR: "Turquía",
  ZA: "Sudáfrica",
  SG: "Singapur",
  AE: "Emiratos Árabes Unidos",
  MA: "Marruecos",
};

function RankingsSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Podium skeleton */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="qb-skeleton-card rounded-xl p-6 flex flex-col items-center gap-3">
            <div className="qb-skeleton-circle h-10 w-10" />
            <div className="qb-skeleton-circle h-14 w-14" />
            <div className="qb-skeleton-line w-24" />
            <div className="qb-skeleton-line w-16" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="qb-skeleton-card rounded-xl p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="qb-skeleton-circle h-7 w-7" />
            <div className="qb-skeleton-circle h-8 w-8" />
            <div className="flex-1 qb-skeleton-line h-4" />
            <div className="qb-skeleton-line w-16 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingCard({ entry, tab, highlight }: { entry: PublicLeaderboardEntry; tab: LeaderboardTab; highlight?: boolean }) {
  const rankColors: Record<number, string> = {
    1: "from-yellow-400 to-amber-500 text-[#04110d]",
    2: "from-slate-300 to-slate-400 text-[#04110d]",
    3: "from-amber-600 to-amber-700 text-[#04110d]",
  };

  return (
    <div className={`qb-glass qb-elev-1 qb-glass-hover rounded-xl p-4 flex items-center gap-3 ${highlight ? "bg-accent/[0.06]" : ""} animate-fadeIn`}>
      {/* Rank */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
          rankColors[entry.rank]
            ? `bg-gradient-to-br ${rankColors[entry.rank]}`
            : "bg-surface-solid text-muted"
        }`}
      >
        {entry.rank}
      </span>

      {/* Avatar */}
      <div className="shrink-0">
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar_url}
            alt={entry.username}
            className="h-9 w-9 rounded-full border border-line object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-solid metric text-[13px] text-muted">
            {(entry.username ?? "??").slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink truncate">@{entry.username}</p>
        {tab === "country" && entry.country && (
          <p className="metric text-[11px] text-muted">{countryNames[entry.country] ?? entry.country}</p>
        )}
        {entry.tier && (
          <span className="metric text-[10px] uppercase tracking-wider text-accent">{entry.tier}</span>
        )}
      </div>

      {/* QP */}
      <div className="text-right shrink-0">
        <p className="metric text-accent qb-glow-text text-sm font-semibold">
          {entry.qp_earned.toLocaleString()}
        </p>
        <p className="metric text-[10px] text-muted">{entry.tournaments_won} torneos</p>
      </div>
    </div>
  );
}

export default function RankingsPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<RankMode>("global");
  const [tab, setTab] = useState<LeaderboardTab>("qp");
  const [selectedCountry, setCountrySel] = useState<string>("");
  const [rows, setRows] = useState<PublicLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    // En modo país traemos la lista individual para filtrar por profiles.country en cliente
    getGlobalLeaderboard(mode === "country" ? "qp" : tab, 100)
      .then((data) => {
        if (!active) return;
        setRows(data);
        setError(null);
      })
      .catch((e) => {
        if (!active) return;
        setError(
          e instanceof Error ? e.message : "No se pudo cargar el ranking.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mode, tab, retry]);

  // Países presentes en los datos, ordenados alfabéticamente por nombre legible
  const countries = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.country).filter((c): c is string => !!c)),
      ).sort((a, b) =>
        (countryNames[a] ?? a).localeCompare(countryNames[b] ?? b),
      ),
    [rows],
  );
  const withoutCountry = rows.filter((r) => !r.country).length;

  const countrySel = countries.includes(selectedCountry) ? selectedCountry : (countries[0] ?? "");

  // Modo país: solo usuarios del país elegido, re-ranqueados desde 1
  let displayRows = rows;
  if (mode === "country" && countrySel) {
    displayRows = rows
      .filter((r) => r.country === countrySel)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Top 3 podio
  const top3 = displayRows.slice(0, 3);
  const rest = top3.length >= 3 ? displayRows.slice(3) : displayRows;

  return (
    <main className="flex min-h-screen flex-col">
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl animate-fadeIn">
            Ranking de puntos virtuales
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base animate-fadeIn">
            QP y victorias del sistema histórico. Solo se muestran cuentas con actividad en la métrica elegida; los puntos no tienen valor monetario ni miden rentabilidad.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted">Los torneos ML gratuitos no otorgan QP. Sus resultados se comparan únicamente dentro de cada ronda. <Link href="/app/tournaments" className="text-accent underline">Consultar rondas y rankings ML</Link></p>
        </div>
      </section>

      {/* Modo (Global / Por país) + métricas o selector de país */}
      <div className="border-b border-line bg-surface/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1">
              {modeTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { if (t.id !== mode) { setLoading(true); setMode(t.id); } }}
                  className={`h-8 rounded-md px-3 text-[13px] font-semibold transition-colors active:scale-[0.96] ${
                    mode === t.id
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "text-ink hover:text-accent border border-transparent"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {mode === "global" ? (
              <div className="flex items-center gap-1">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { if (t.id !== tab) { setLoading(true); setTab(t.id); } }}
                    className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors active:scale-[0.96] ${
                      tab === t.id
                        ? "bg-accent/15 text-accent border border-accent/30"
                        : "text-muted hover:text-ink border border-transparent"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <label className="flex items-center gap-2">
                <span className="metric text-[10px] uppercase tracking-wider text-muted">
                  País
                </span>
                <select
                  value={countrySel}
                  onChange={(e) => setCountrySel(e.target.value)}
                  disabled={countries.length === 0}
                  className="h-8 rounded-md border border-line bg-surface-solid px-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-50"
                >
                  {countries.length === 0 && (
                    <option value="">Sin países</option>
                  )}
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {countryNames[c] ?? c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {mode === "country" && withoutCountry > 0 && (
            <p className="mt-2 animate-fadeIn text-[11px] text-muted">
              {withoutCountry}{" "}
              {withoutCountry === 1
                ? "usuario sin país especificado"
                : "usuarios sin país especificado"}
              .
            </p>
          )}
        </div>
      </div>

      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          {loading ? (
            <RankingsSkeleton />
          ) : error ? (
            <div className="rounded-lg border border-short/40 bg-short/[0.08] px-4 py-3 text-sm text-short animate-fadeIn">
              {error}
              <button type="button" className="ml-3 underline" onClick={()=>{setLoading(true);setRetry(value=>value+1);}}>Reintentar ranking</button>
            </div>
          ) : displayRows.length === 0 ? (
            <div className="qb-glass qb-elev-1 flex flex-col items-center gap-3 rounded-xl px-6 py-16 text-center animate-fadeIn">
              <p className="text-lg font-semibold text-ink">
                Sin actividad en esta clasificación
              </p>
              <p className="max-w-md text-sm text-muted">
                No hay registros con QP ganados o victorias para este filtro. Puedes consultar la evidencia y los resultados por ronda en Torneos ML.
              </p>
              <Link href="/app/tournaments" className="text-sm text-accent underline">Ir a Torneos ML</Link>
            </div>
          ) : (
            <>
              {/* Podio top 3 */}
              {top3.length >= 3 && (
                <div className="mb-10 grid gap-4 grid-cols-1 sm:grid-cols-3 animate-fadeIn">
                  {[top3[1], top3[0], top3[2]].map((entry, i) => {
                    const isFirst = i === 1;
                    return (
                      <div
                        key={entry.user_id}
                        className={`qb-glass qb-elev-${isFirst ? "2" : "1"} ${
                          isFirst ? "qb-tier-featured -mt-4" : ""
                        } qb-glass-hover flex flex-col items-center rounded-xl p-6 text-center`}
                      >
                        {/* Rank badge */}
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-[16px] font-bold ${
                            i === 0
                              ? "bg-gradient-to-br from-slate-300 to-slate-400 text-[#04110d]"
                              : i === 1
                                ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-[#04110d]"
                                : "bg-gradient-to-br from-amber-600 to-amber-700 text-[#04110d]"
                          }`}
                        >
                          {entry.rank}
                        </span>

                        {/* Avatar */}
                        {entry.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.avatar_url}
                            alt={entry.username}
                            className="h-14 w-14 rounded-full border border-line object-cover mt-3"
                          />
                        ) : (
                          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface-solid metric text-[18px] text-muted mt-3">
                            {(entry.username ?? "??").slice(0, 2).toUpperCase()}
                          </span>
                        )}

                        <p className="text-[15px] font-semibold text-ink mt-3 truncate">
                          @{entry.username}
                        </p>

                        {tab === "country" && entry.country && (
                          <p className="metric text-[12px] text-muted mt-0.5">
                            {countryNames[entry.country] ?? entry.country}
                          </p>
                        )}

                        {entry.tier && (
                          <span className="metric mt-1 text-[10px] uppercase tracking-wider text-accent">
                            {entry.tier}
                          </span>
                        )}

                        <p className="metric text-accent qb-glow-text text-xl font-bold mt-2">
                          {entry.qp_earned.toLocaleString()}
                          <span className="text-xs font-normal text-muted">
                            {" "}
                            QP
                          </span>
                        </p>
                        <p className="metric text-[11px] text-muted mt-0.5">
                          {entry.tournaments_won} torneos
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Mobile: stacked cards */}
              {rest.length > 0 && (
                <div className="block md:hidden space-y-3 animate-fadeIn">
                  {rest.map((entry) => (
                    <RankingCard
                      key={`${mode}-${countrySel}-${entry.user_id}`}
                      entry={entry}
                      tab={tab}
                      highlight={user?.id === entry.user_id}
                    />
                  ))}
                </div>
              )}

              {/* Desktop: table */}
              {rest.length > 0 && (
                <div className="hidden md:block qb-glass overflow-hidden rounded-xl animate-fadeIn">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line bg-surface/40">
                          <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase w-12">
                            #
                          </th>
                          <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                            {tab === "country" ? "País" : "Trader"}
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                            QP Ganados
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                            Torneos
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                            Sharpe
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rest.map((entry) => (
                          <LeaderboardRow
                            key={`${mode}-${countrySel}-${entry.user_id}`}
                            entry={entry}
                            highlight={user?.id === entry.user_id}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
