"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTournament, getLeaderboard, getMySubmission } from "@/lib/tournaments";
import type { Tournament, LeaderboardEntry, Submission } from "@/lib/tournaments";
import {
  listDatasets,
  downloadDatasetUrl,
  submitPredictions,
  myPrediction,
  mlLeaderboard,
  mlModeLabel,
  mlRoundTypeLabel,
} from "@/lib/mlTournaments";
import type {
  MlDataset,
  MlSubmission,
  MlLeaderboardEntry,
} from "@/lib/mlTournaments";
import { useAuth } from "@/lib/useAuth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";

/* ------------------------------------------------------------------ */
/* Entrada: decide render clásico (código) vs ML (predicciones)        */
/* ------------------------------------------------------------------ */

export default function TournamentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setTournament(await getTournament(id));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-14 text-muted">Cargando...</div>;
  if (!tournament) return <div className="p-14 text-muted">Torneo no encontrado</div>;

  return tournament.type === "ml" ? (
    <MlTournamentDetail id={id} tournament={tournament} />
  ) : (
    <CodeTournamentDetail id={id} tournament={tournament} />
  );
}

/* ------------------------------------------------------------------ */
/* Torneos de código (render original, sin cambios)                    */
/* ------------------------------------------------------------------ */

function CodeTournamentDetail({
  id,
  tournament,
}: {
  id: string;
  tournament: Tournament;
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [mySub, setMySub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [lb, me] = await Promise.all([getLeaderboard(id), getMySubmission(id)]);
        setLeaderboard(lb);
        setMySub(me);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-14 text-muted">Cargando...</div>;

  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">
              {tournament.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {tournament.asset_type} · {tournament.symbols.join(", ")} · {tournament.timeframe}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded border border-line bg-surface px-3 py-1.5 text-sm text-muted">
              {tournament.status === "open" ? "🟢 Abierto" : tournament.status === "closed" ? "🔴 Cerrado" : tournament.status}
            </span>
            <span className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
              {tournament.prize_pool_qp} QP
            </span>
          </div>
        </div>

        {/* Reglas */}
        {tournament.rules_text && (
          <div className="mt-6 ql-glass ql-elev-1 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink">Reglas</h2>
            <p className="mt-2 text-sm text-muted">{tournament.rules_text}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              <span>Métrica: <strong className="text-ink">{tournament.primary_metric}</strong></span>
              <span>Min trades: <strong className="text-ink">{tournament.min_trades}</strong></span>
              <span>Max slippage: <strong className="text-ink">{(tournament.max_slippage_pct * 100).toFixed(2)}%</strong></span>
            </div>
          </div>
        )}

        {/* Mi submission */}
        {mySub && (
          <div className="mt-6 ql-glass ql-elev-1 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink">Mi submission</h2>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <span className="text-muted">Estado: <strong className="text-ink">{mySub.status}</strong></span>
              {mySub.primary_score != null && (
                <span className="text-muted">Score: <strong className="text-accent">{mySub.primary_score.toFixed(3)}</strong></span>
              )}
              {mySub.rank != null && (
                <span className="text-muted">Rank: <strong className="text-ink">#{mySub.rank}</strong></span>
              )}
              {mySub.qp_earned > 0 && (
                <span className="text-muted">QP ganados: <strong className="text-long">+{mySub.qp_earned}</strong></span>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Aún no hay submissions evaluadas.</p>
          ) : (
            <div className="mt-3 ql-glass ql-elev-1 overflow-hidden rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-right">QP</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((e) => (
                    <tr key={e.user_id} className="border-b border-line/50">
                      <td className="px-4 py-3 font-mono text-ink">{e.rank}</td>
                      <td className="px-4 py-3 text-ink">
                        {e.display_name || e.username || e.user_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-accent">
                        {e.score.toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-right text-long">+{e.qp_earned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Botón submit */}
        {tournament.status === "open" && (
          <div className="mt-8">
            <Link
              href={`/app/tournaments/${id}/submit`}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-bg hover:bg-accent/90 transition-colors"
            >
              Enviar estrategia
            </Link>
          </div>
        )}

        {/* Disclaimer */}
        <p className="mt-8 text-[11px] text-muted">
          QuantLab es una herramienta de investigación. No es asesoría financiera ni recomendación de inversión.
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Torneos ML: Datos | Enviar | Ranking                                */
/* ------------------------------------------------------------------ */

type MlTab = "datos" | "enviar" | "ranking";

const TABS: { key: MlTab; label: string }[] = [
  { key: "datos", label: "Datos" },
  { key: "enviar", label: "Enviar" },
  { key: "ranking", label: "Ranking" },
];

const KIND_LABEL: Record<string, string> = {
  train: "Entrenamiento",
  validation: "Validación",
  live: "Predicciones de la ronda",
};

const ML_BADGE_CLASS = "border-[#a78bfa]/35 bg-[#a78bfa]/12 text-[#c4b5fd]";

function num(v: number | null | undefined, digits = 4): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}

function int(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toLocaleString();
}

function MlTournamentDetail({
  id,
  tournament,
}: {
  id: string;
  tournament: Tournament;
}) {
  const [tab, setTab] = useState<MlTab>("datos");
  const [datasets, setDatasets] = useState<MlDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setDatasets(await listDatasets(id));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datasets de la ronda.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const publicos = useMemo(
    () =>
      datasets
        .filter((d) => d.kind === "train" || d.kind === "validation" || d.kind === "live")
        .sort(
          (a, b) =>
            (b.round_number ?? 0) - (a.round_number ?? 0) ||
            a.kind.localeCompare(b.kind),
        ),
    [datasets],
  );

  /**
   * Dataset objetivo para enviar predicciones: el live de la ronda MÁS reciente
   * que esté abierto (status ready) y no haya cerrado (closes_at en el futuro).
   * Antes se tomaba el primer live de la lista (ronda 1, ya cerrada), lo que
   * hacía fallar el envío/intento de evaluación. Usa el de mayor round_number.
   */
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const initial = window.setTimeout(() => setNowMs(Date.now()), 0);
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);
  const liveReady = useMemo(
    () =>
      datasets
        .filter((d) => d.kind === "live" && d.status === "ready" && d.score_version === "spearman_era_v1")
        .sort(
          (a, b) =>
            (b.round_number ?? 0) - (a.round_number ?? 0) ||
            (b.closes_at ?? "").localeCompare(a.closes_at ?? ""),
        )
        .find(
          (d) =>
            !d.closes_at || (nowMs !== null && new Date(d.closes_at).getTime() > nowMs),
        ) ?? null,
    [datasets, nowMs],
  );
  /** Para el ranking sirve cualquier live (aunque la ronda ya esté cerrada). */
  const liveAny = useMemo(
    () => liveReady ?? publicos.find((d) => d.kind === "live") ?? null,
    [publicos, liveReady],
  );
  const roundDatasets = useMemo(
    () => publicos.filter((d) => d.round_number === liveAny?.round_number),
    [publicos, liveAny],
  );

  const modo = liveAny?.mode ?? null;
  const ronda = datasets.length
    ? Math.max(...datasets.map((d) => d.round_number ?? 0))
    : null;

  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        {/* Cabecera */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={ML_BADGE_CLASS}>Predicciones ML</Badge>
              {ronda != null && <Badge tone="neutral">Ronda {ronda}</Badge>}
              {modo && <Badge tone="neutral">{mlModeLabel(modo)}</Badge>}
              {liveAny && <Badge tone="neutral">{mlRoundTypeLabel(liveAny.round_type)}</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
              {tournament.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Descarga los datos, entrena tu modelo y envía <span className="text-ink">id,prediction</span>.
              La puntuación se publica después del cierre.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded border border-line bg-surface px-3 py-1.5 text-sm text-muted">
              {liveReady ? "Abierta" : liveAny?.status === "scored" ? "Finalizada" : "Cerrada"}
            </span>
            <span className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
              {tournament.prize_pool_qp} QP
            </span>
          </div>
        </div>

        {/* Reglas */}
        {tournament.rules_text && (
          <div className="mt-6 ql-glass ql-elev-1 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink">Reglas</h2>
            <p className="mt-2 text-sm text-muted">{tournament.rules_text}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              <span>
                Métrica: <strong className="text-ink">{tournament.primary_metric}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Pestañas */}
        <div
          role="tablist"
          aria-label="Secciones del torneo ML"
          className="mt-8 grid grid-cols-3 gap-2 rounded-lg bg-surface/60 p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={
                "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                (tab === t.key ? "bg-accent text-bg" : "text-muted hover:text-ink")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="ql-skeleton-card h-40 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            {tab === "datos" && <TabDatos datasets={roundDatasets} />}
            {tab === "enviar" && <TabEnviar liveDataset={liveAny} canSubmit={Boolean(liveReady)} />}
            {tab === "ranking" && <TabRanking dataset={liveAny} />}
          </div>
        )}

        {/* Disclaimer */}
        <p className="mt-10 text-[11px] text-muted">
          QuantLab es una herramienta de investigación. No es asesoría financiera ni
          recomendación de inversión.
        </p>
      </div>
    </main>
  );
}

/* --------------------------- Pestaña: Datos --------------------------- */

function TabDatos({ datasets }: { datasets: MlDataset[] }) {
  const [bajando, setBajando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const descargar = useCallback(
    async (ds: MlDataset) => {
      setErr(null);
      setBajando(ds.id);
      try {
        // El endpoint /download resuelve la URL firmada/pública; download_url
        // del listado sirve de respaldo cuando ya viene resuelta.
        let url: string;
        try {
          url = await downloadDatasetUrl(ds.id, ds.kind);
        } catch (e) {
          if (!ds.download_url) throw e;
          url = ds.download_url;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "No se pudo obtener el archivo.");
      } finally {
        setBajando(null);
      }
    },
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {datasets.length > 0 && (
        <div className="ql-glass ql-elev-1 rounded-xl p-5 text-sm text-muted">
          <p className="font-medium text-ink">{mlRoundTypeLabel(datasets[0].round_type)}</p>
          <p className="mt-1">
            Entrenamiento y validación incluyen el resultado conocido. El archivo de predicciones
            contiene solo variables e IDs; su resultado se reserva hasta finalizar la ronda.
          </p>
          {datasets[0].round_type === "historical" && (
            <p className="mt-2">Esta es una evaluación histórica; no representa predicciones futuras en vivo.</p>
          )}
          {datasets[0].version && (
            <p className="mt-2 font-mono text-xs">Versión del dataset: {datasets[0].version}</p>
          )}
        </div>
      )}
      {err && (
        <div className="rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
          {err}
        </div>
      )}

      {datasets.length === 0 ? (
        <div className="ql-glass ql-elev-1 rounded-xl px-6 py-10 text-center text-sm text-muted">
          Todavía no hay datasets publicados para esta ronda.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {datasets.map((ds) => (
            <div key={ds.id} className="ql-glass ql-elev-1 flex flex-col rounded-xl p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">
                    {KIND_LABEL[ds.kind] ?? ds.kind}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Ronda {ds.round_number} · {ds.kind}.parquet
                  </p>
                </div>
                <Badge
                  className={ds.mode === "real" ? undefined : ML_BADGE_CLASS}
                  tone={ds.mode === "real" ? "long" : undefined}
                >
                  {mlModeLabel(ds.mode)}
                </Badge>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="uppercase tracking-wider text-muted">Activos</dt>
                  <dd className="metric text-ink">{int(ds.n_assets)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted">Eras</dt>
                  <dd className="metric text-ink">{int(ds.n_eras)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted">Features</dt>
                  <dd className="metric text-ink">{int(ds.n_features)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted">Filas</dt>
                  <dd className="metric text-ink">{int(ds.row_count)}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => descargar(ds)}
                  disabled={bajando === ds.id || !ds.download_url}
                  className={buttonClasses("primary", "sm")}
                >
                  {bajando === ds.id ? "Obteniendo..." : `Descargar ${ds.kind}.parquet`}
                </button>
                <span className="text-[11px] text-muted">
                  {ds.download_url ? ds.status : "Archivo no disponible en esta ronda"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nota: cómo leer los .parquet */}
      <div className="ql-glass ql-elev-1 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-ink">
          Los archivos <span className="font-mono text-[#c4b5fd]">.parquet</span> no se abren en un editor de texto
        </h3>
        <p className="mt-2 text-sm text-muted">
          <span className="font-mono text-ink">train.parquet</span>,{" "}
          <span className="font-mono text-ink">validation.parquet</span> y{" "}
          <span className="font-mono text-ink">live.parquet</span> son archivos de datos{" "}
                    <strong className="text-ink">comprimidos en columnas</strong>, no texto plano. Si los abres con
                    el Bloc de Notas (o un editor de texto) verás símbolos ilegibles — eso es el formato binario
                    del parquet, no un archivo corrupto ni un error.
        </p>
        <p className="mt-2 text-sm text-muted">
          <strong className="text-ink">Lo correcto:</strong> cárgalos en Python con pandas (
          <span className="font-mono text-ink">pd.read_parquet(...)</span>) o ábrelos con un visor de
          parquet (VS Code + extensión, o Tad). El notebook de abajo te enseña el flujo completo
          hasta generar tu <span className="font-mono text-ink">predictions.csv</span>.
        </p>
      </div>

      {/* Punto 4: notebook de ejemplo */}
      <div className="ql-glass ql-elev-1 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-ink">¿Primera vez?</h3>
        <p className="mt-2 text-sm text-muted">
          El notebook de ejemplo descarga train/validation/live, entrena un modelo pequeño sobre
          las features <span className="text-ink">feature_XX</span> y genera el CSV{" "}
          <span className="text-ink">id,prediction</span> listo para enviar.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="https://colab.research.google.com/github/Emelecto/QuantLab/blob/main/web/public/ml/ejemplo_quantlab.ipynb"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("primary", "sm")}
          >
            Abrir en Colab
          </a>
          <a
            href="/ml/ejemplo_quantlab.ipynb"
            download
            className={buttonClasses("secondary", "sm")}
          >
            Descargar .ipynb
          </a>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Pestaña: Enviar -------------------------- */

function TabEnviar({
  liveDataset,
  canSubmit,
}: {
  liveDataset: MlDataset | null;
  canSubmit: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [mineState, setMineState] = useState<{ datasetId: string; submission: MlSubmission | null } | null>(null);
  const datasetId = liveDataset?.id ?? null;
  const mine = mineState?.datasetId === datasetId ? mineState.submission : null;

  useEffect(() => {
    if (!datasetId) return;
    let active = true;
    void myPrediction(datasetId).then((submission) => {
      if (active) setMineState({ datasetId, submission });
    });
    return () => {
      active = false;
    };
  }, [datasetId]);

  const cargarArchivo = useCallback((candidate: File) => {
    setFile(null);
    setFeedback(null);
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      setFeedback({ type: "err", msg: "Selecciona un archivo .csv." });
      return;
    }
    if (candidate.size === 0 || candidate.size > 10 * 1024 * 1024) {
      setFeedback({ type: "err", msg: "El CSV debe pesar entre 1 byte y 10 MB." });
      return;
    }
    setFile(candidate);
  }, []);

  async function enviar() {
    if (!datasetId || !file || !canSubmit) return;
    setEnviando(true);
    setFeedback(null);
    try {
      const response = await submitPredictions(datasetId, file);
      if (!response.submission) throw new Error("El servidor no devolvió un comprobante.");
      setMineState({ datasetId, submission: response.submission });
      setFile(null);
      setFeedback({
        type: "ok",
        msg: "Envío validado y registrado. Tu puntuación aparecerá cuando cierre la ronda.",
      });
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "No se pudo registrar el envío.",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!liveDataset ? (
        <div className="ql-glass ql-elev-1 rounded-xl px-6 py-10 text-center text-sm text-muted">
          Todavía no hay un dataset de predicciones publicado.
        </div>
      ) : (
        <>
          <div className="ql-glass ql-elev-1 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink">
              {canSubmit ? "Envía tus predicciones" : "Recepción de archivos cerrada"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {canSubmit
                ? "El CSV debe incluir exactamente los IDs de esta ronda y valores entre 0 y 1. Puedes corregirlo hasta el cierre; se selecciona el último envío válido."
                : liveDataset.status === "scored"
                  ? "La puntuación y el ranking final ya están disponibles."
                  : "Estamos preparando los resultados. Tu último envío válido conserva su lugar."}
            </p>
            {liveDataset.closes_at && (
              <p className="mt-2 text-xs text-muted">
                Cierre: {new Date(liveDataset.closes_at).toLocaleString("es-CO")}
              </p>
            )}
          </div>
          {canSubmit && (
            <>
              <div
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const selected = event.dataTransfer.files?.[0];
                  if (selected) cargarArchivo(selected);
                }}
                className={
                  "ql-glass ql-elev-1 rounded-xl border-dashed px-6 py-10 text-center transition-colors " +
                  (dragging ? "border-accent bg-accent/5" : "border-line")
                }
              >
                <p className="text-sm text-ink">Arrastra aquí tu predictions.csv</p>
                <p className="mt-1 text-xs text-muted">
                  Cabecera exacta: <span className="font-mono text-ink">id,prediction</span>
                </p>
                <label className={buttonClasses("secondary", "sm", "mt-4 cursor-pointer")}>
                  Seleccionar archivo
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) cargarArchivo(selected);
                    }}
                  />
                </label>
                {file && <p className="mt-3 text-xs text-muted">{file.name} · {int(file.size)} bytes</p>}
              </div>
              <button
                type="button"
                onClick={enviar}
                disabled={!file || enviando}
                className={buttonClasses("primary", "md")}
              >
                {enviando ? "Verificando..." : "Validar y registrar envío"}
              </button>
            </>
          )}
          {feedback && (
            <div
              role="status"
              className={
                "rounded-md px-4 py-3 text-sm " +
                (feedback.type === "ok"
                  ? "border border-long/30 bg-long/10 text-long"
                  : "border border-short/30 bg-short/10 text-short")
              }
            >
              {feedback.msg}
            </div>
          )}
        </>
      )}
      {mine && (
        <div className="ql-glass ql-elev-1 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink">Comprobante del envío seleccionado</h3>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-muted">Estado</dt><dd className="text-ink">{mine.status === "validated" ? "Validado; esperando cierre" : mine.status}</dd></div>
            <div><dt className="text-muted">Filas</dt><dd className="text-ink">{int(mine.row_count)}</dd></div>
            <div><dt className="text-muted">Versión</dt><dd className="break-all font-mono text-ink">{mine.dataset_version || "—"}</dd></div>
            <div><dt className="text-muted">Huella SHA-256</dt><dd className="break-all font-mono text-ink">{mine.file_sha256 || "—"}</dd></div>
          </dl>
          {mine.submitted_at && (
            <p className="mt-3 text-xs text-muted">
              Recibido {new Date(mine.submitted_at).toLocaleString("es-CO")}
            </p>
          )}
          {liveDataset?.status === "scored" && mine.score != null && (
            <p className="mt-4 text-sm text-ink">
              Puntuación final: <strong className="metric text-accent">{num(mine.score, 4)}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------- Pestaña: Ranking ------------------------- */

function TabRanking({ dataset }: { dataset: MlDataset | null }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<MlLeaderboardEntry[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const datasetId = dataset?.id ?? null;

  useEffect(() => {
    if (!datasetId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const lb = await mlLeaderboard(datasetId);
        if (!alive) return;
        setRows(lb);

        // Nombres visibles desde `profiles`; si falla, se usa el id recortado.
        const ids = Array.from(new Set(lb.map((e) => e.user_id).filter(Boolean)));
        if (ids.length === 0) return;
        try {
          const supabase = createBrowserSupabaseClient();
          let data: Array<{ id: string; display_name?: string | null; username?: string | null }> | null = null;
          const primero = await supabase
            .from("profiles")
            .select("id, display_name, username")
            .in("id", ids);
          if (primero.error) {
            const segundo = await supabase
              .from("profiles")
              .select("id, username")
              .in("id", ids);
            data = segundo.data ?? null;
          } else {
            data = primero.data ?? null;
          }
          if (!alive || !data) return;
          const map: Record<string, string> = {};
          for (const p of data) {
            const nombre = p.display_name || p.username;
            if (p.id && nombre) map[p.id] = nombre;
          }
          setNombres(map);
        } catch {
          /* sin perfiles: fallback al id recortado */
        }
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : "No se pudo cargar el ranking.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [datasetId]);

  if (!datasetId) {
    return (
      <div className="ql-glass ql-elev-1 rounded-xl px-6 py-10 text-center text-sm text-muted">
        Esta ronda todavía no tiene ranking.
      </div>
    );
  }

  if (dataset?.status !== "scored") {
    return (
      <div className="ql-glass ql-elev-1 rounded-xl px-6 py-10 text-center text-sm text-muted">
        El ranking se publicará cuando cierre la recepción y termine la puntuación.
      </div>
    );
  }

  if (loading) return <div className="ql-skeleton-card h-40 rounded-xl" />;

  if (err) {
    return (
      <div className="rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
        {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="ql-glass ql-elev-1 rounded-xl px-6 py-10 text-center text-sm text-muted">
        Aún no hay envíos evaluados en esta ronda.
        {dataset?.benchmarks && Object.keys(dataset.benchmarks).length > 0 && (
          <p className="mt-3">
            Referencias: {Object.entries(dataset.benchmarks).map(([name, score]) =>
              `${name} ${num(score, 4)}`
            ).join(" · ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dataset?.benchmarks && Object.keys(dataset.benchmarks).length > 0 && (
        <div className="ql-glass ql-elev-1 rounded-xl p-5 text-sm text-muted">
          <p className="font-medium text-ink">Referencias de esta ronda</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {Object.entries(dataset.benchmarks).map(([name, score]) => (
              <span key={name}>{name === "random" ? "Aleatorio" : name}: <strong className="font-mono text-ink">{num(score, 4)}</strong></span>
            ))}
          </div>
          <p className="mt-2 text-xs">Estas referencias ayudan a interpretar el score; no participan en el ranking.</p>
        </div>
      )}
      <div className="ql-glass ql-elev-1 overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3 text-right">Spearman medio</th>
              <th className="px-4 py-3 text-right">QP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const esMio = !!user && e.user_id === user.id;
              return (
                <tr
                  key={`${e.user_id}-${i}`}
                  className={
                    "border-b border-line/50 " +
                    (esMio ? "bg-accent/10 text-ink" : "")
                  }
                >
                  <td className="px-4 py-3 font-mono text-ink">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">
                    <span className="inline-flex items-center gap-2">
                      {nombres[e.user_id] || e.user_id.slice(0, 8)}
                      {esMio && <Badge tone="cyan">tú</Badge>}
                      {e.plagio_flag && <Badge tone="short">Similitud alta</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-accent">
                    {num(e.score, 4)}
                  </td>
                  <td className="px-4 py-3 text-right text-long">
                    {e.qp_earned != null ? `+${e.qp_earned}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
