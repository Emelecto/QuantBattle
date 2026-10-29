"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeaderboard, type LeaderboardRow } from "@/lib/db";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

function assetLabel(asset_type: string): string {
  return asset_type === "crypto" ? "Cripto" : "Acción";
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getLeaderboard()
      .then((data) => {
        if (!active) return;
        setRows(data);
        setFetchError(null);
      })
      .catch((e) => {
        if (!active) return;
        setFetchError(
          e instanceof Error ? e.message : "No se pudo cargar el ranking.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Ranking OOS
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            Archivo de ejecuciones públicas del módulo experimental de backtesting,
            ordenado por Sharpe desinflado fuera de muestra. Esta métrica no elimina
            el riesgo de sobreajuste ni acredita rentabilidad futura.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted">Los resultados de torneos ML se consultan por ronda y utilizan Spearman por era. <Link href="/app/tournaments" className="text-accent underline">Ir a Torneos ML</Link></p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="line" className="!h-10" />
              ))}
            </div>
          ) : fetchError ? (
            <div className="rounded-lg border border-short/40 bg-short/[0.08] px-4 py-3 text-sm text-short">
              {fetchError}
            </div>
          ) : rows.length === 0 ? (
            <div className="qb-glass qb-elev-1 flex flex-col items-center gap-3 rounded-xl px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ink">
                Sé el primero en compartir
              </p>
              <p className="max-w-md text-sm text-muted">
                Aún no hay estrategias públicas con backtest. Comparte la tuya
                para entrar al ranking.
              </p>
              <Link
                href="/app/strategies/new"
                className={buttonClasses("primary", "sm")}
              >
                Crear estrategia
              </Link>
            </div>
          ) : (
            <div className="qb-glass overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="metric px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                      #
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                      Estrategia
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                      Autor
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted uppercase">
                      Activo
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                      Deflated Sharpe OOS
                    </th>
                    <th
                      className="hidden px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase md:table-cell"
                      title="Media de los últimos 5 envíos evaluados del autor"
                    >
                      Reputación
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                      MaxDD
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                      Win%
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium tracking-wider text-muted uppercase">
                      <span className="sr-only">Abrir</span>↗
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.strategy_id}
                      className="qb-row border-b border-line last:border-0 transition-colors"
                    >
                      <td className="metric px-4 py-3 text-[13px] text-muted">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-ink">
                        {row.name}
                      </td>
                      <td className="metric px-4 py-3 text-[13px] text-muted">
                        @{row.author ?? "anónimo"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="metric rounded border border-line bg-surface-solid px-1.5 py-0.5 text-[11px] text-muted">
                          {assetLabel(row.asset)}
                        </span>
                      </td>
                      <td className="metric px-4 py-3 text-right text-[13px] font-medium text-long">
                        {row.deflatedSharpeOos.toFixed(2)}
                      </td>
                      <td className="metric hidden px-4 py-3 text-right text-[13px] text-ink md:table-cell">
                        {row.reputation_score != null ? (
                          row.reputation_score.toFixed(2)
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="metric px-4 py-3 text-right text-[13px] text-short">
                        {row.maxDd.toFixed(1)}%
                      </td>
                      <td className="metric px-4 py-3 text-right text-[13px] text-ink">
                        {row.winRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/app/strategies/${row.strategy_id}/results`}
                          aria-label={`Abrir ${row.name}`}
                          className="metric inline-flex h-6 w-6 items-center justify-center rounded border border-line text-muted transition-colors hover:border-accent hover:text-ink"
                        >
                          ↗
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="metric mt-4 text-[12px] text-muted">
            Datos reales · el ranking se calcula sobre corridas verificadas
            fuera de muestra (walk-forward OOS).
          </p>
        </div>
      </section>
    </>
  );
}
