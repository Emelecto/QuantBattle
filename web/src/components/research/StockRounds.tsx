"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import {
  downloadStockFile,
  listStockRounds,
  stockReceipts,
  submitStockFile,
  type StockRound,
  type StockReceipt,
} from "@/lib/stockTournaments";
const date = (s: string) =>
  new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(new Date(s + "T12:00:00Z"));
const timestamp = (s: string) =>
  new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(s));
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "No se pudo completar la solicitud. Vuelve a intentarlo.";
function RoundFiles({ round }: { round: StockRound }) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  async function download(name: string) {
    setBusy(name);
    setError("");
    try {
      await downloadStockFile(round.id, name);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-5">
      <p className="text-sm text-muted">
        Descarga live.csv o live.parquet: contienen los mismos datos, sin
        respuestas futuras. Usa la plantilla para preparar tu envío. Cada
        descarga verifica su SHA-256.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {round.files.map((name) => (
          <button
            key={name}
            type="button"
            disabled={busy !== null}
            onClick={() => void download(name)}
            className={buttonClasses("secondary", "sm")}
          >
            {busy === name ? "Verificando…" : `Descargar ${name}`}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-short">
          {error}
        </p>
      )}
    </div>
  );
}
function RoundSubmission({
  round,
  open,
}: {
  round: StockRound;
  open: boolean;
}) {
  const [receipts, setReceipts] = useState<StockReceipt[] | null>(null),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    stockReceipts(round.id)
      .then((r) => {
        if (active) {
          setReceipts(r.attempts);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [round.id, retry]);
  async function send() {
    if (!file || busy) return;
    if (file.size > 1024 * 1024) {
      setError("Usa un CSV de hasta 1 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await submitStockFile(round.id, file);
      setFile(null);
      setFeedback(
        "Predicciones registradas. El último envío válido antes del cierre es el seleccionado.",
      );
      setRetry((x) => x + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 border-t border-line pt-5">
      {open && (
        <>
          <p className="text-sm text-muted">
            CSV con cabecera id,prediction y todos los IDs de esta ronda, una
            vez cada uno. Usa retornos decimales: 0.02 = +2 %. Máximo 1 MB.
          </p>
          <label className="mt-3 block text-sm font-medium">
            Archivo de predicciones
            <input
              aria-label="CSV de predicciones de acciones"
              className="mt-2 block w-full text-sm"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={!file || busy}
            onClick={() => void send()}
            className={buttonClasses("primary", "md") + " mt-3"}
          >
            {busy ? "Registrando…" : "Enviar predicciones"}
          </button>
        </>
      )}
      {feedback && (
        <p role="status" className="mt-3 text-sm">
          {feedback}
        </p>
      )}
      <h4 className="mt-5 font-semibold">Mis envíos de esta ronda</h4>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-short">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRetry((x) => x + 1)}
          >
            Reintentar consulta
          </button>
        </p>
      ) : receipts === null ? (
        <p role="status" className="mt-2 text-sm">
          Consultando comprobantes…
        </p>
      ) : !receipts.length ? (
        <p className="mt-2 text-sm text-muted">
          Aún no tienes envíos en esta ronda.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {receipts.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <p>
                {timestamp(r.submitted_at)} · {r.row_count} filas ·{" "}
                {r.is_selected ? "Seleccionado" : "No seleccionado"}
                {typeof r.score === "number"
                  ? ` · Score ${r.score.toFixed(4)}`
                  : " · Evaluación pendiente"}
              </p>
              <p className="mt-1 break-all text-xs text-muted">
                SHA-256: {r.file_sha256}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function StockRoundList({ compact = false }: { compact?: boolean }) {
  const [rounds, setRounds] = useState<StockRound[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      listStockRounds()
        .then((r) => {
          if (active) {
            setRounds(r.rounds);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [retry]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section
      id={compact ? "historial-ml" : "rondas-diarias"}
      aria-labelledby={compact ? "daily-home-title" : "daily-title"}
      className="my-8 border-t border-line pt-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id={compact ? "daily-home-title" : "daily-title"}
            className="text-xl font-semibold text-ink"
          >
            Rondas diarias de acciones · Alpaca
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Entrena con el histórico y predice el retorno de apertura a cierre
            de la sesión objetivo. Aquí encontrarás los archivos y el plazo de
            cada ronda.
          </p>
        </div>
        <Link
          href="/app/tournaments/guide"
          className="text-sm text-accent underline underline-offset-4"
        >
          Cómo participar
        </Link>
      </div>
      {error ? (
        <div role="alert" className="mt-5 text-sm text-short">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((x) => x + 1)}
            className={buttonClasses("secondary", "sm") + " mt-2"}
          >
            Reintentar
          </button>
        </div>
      ) : rounds === null ? (
        <p role="status" className="mt-5 text-sm">
          Consultando las rondas publicadas…
        </p>
      ) : rounds.length === 0 ? (
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
          Todavía no hay rondas diarias publicadas. Puedes descargar train y
          validation de Alpaca y preparar tu modelo. Los datos diarios
          aparecerán aquí cuando termine su publicación y verificación.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {(compact ? rounds.slice(0, 3) : rounds).map((round) => {
            const open =
              round.status === "open" && Date.parse(round.deadline) > now;
            return (
              <li key={round.id} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      Sesión del {date(round.target_date)}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {round.rows} acciones · Información hasta{" "}
                      {date(round.observation_date)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Cierre de envíos: {timestamp(round.deadline)} · Colombia
                    </p>
                  </div>
                  <span className="text-sm font-medium text-accent">
                    {round.status === "settled"
                      ? "Evaluada"
                      : open
                        ? "Recibiendo predicciones"
                        : "Envíos cerrados"}
                  </span>
                </div>
                <button
                  type="button"
                  aria-expanded={selected === round.id}
                  onClick={() =>
                    setSelected(selected === round.id ? "" : round.id)
                  }
                  className={buttonClasses("secondary", "md") + " mt-4"}
                >
                  {selected === round.id
                    ? "Cerrar detalle"
                    : "Ver datos y mis envíos"}
                </button>
                {selected === round.id && (
                  <>
                    <RoundFiles key={`files-${round.id}`} round={round} />
                    <RoundSubmission key={round.id} round={round} open={open} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
