"use client";

import { useEffect, useRef, useState } from "react";
import { call } from "@/lib/tournaments";
import { submitPredictions, type MlDataset, type MlSubmission } from "@/lib/mlTournaments";
import { reviewPredictionCsv, type CsvReview } from "@/lib/prediction-review";
import { buttonClasses } from "@/components/ui/Button";

const input = "mt-2 block w-full ql-input min-h-11 rounded-md px-3 py-2 text-base text-ink";
const date = (value: string) => new Intl.DateTimeFormat("es-CO", {dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota"}).format(new Date(value));

export function MlSubmitPanel({liveDataset, canSubmit}: {liveDataset: MlDataset | null; canSubmit: boolean}) {
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<CsvReview | null>(null);
  const [digest, setDigest] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ok: boolean; message: string} | null>(null);
  const [mine, setMine] = useState<MlSubmission | null>(null);
  const [receiptError, setReceiptError] = useState(false);
  const [receiptRetry, setReceiptRetry] = useState(0);
  const [model, setModel] = useState("");
  const [parameters, setParameters] = useState("{}");
  const [seed, setSeed] = useState("");
  const [note, setNote] = useState("");
  const generation = useRef(0);
  const datasetId = liveDataset?.id;
  useEffect(() => {
    let active = true;
    if (datasetId) void call<{submission: MlSubmission | null}>(`/ml/predictions/mine?dataset_id=${encodeURIComponent(datasetId)}`)
      .then(value => { if (active) setMine(value.submission); })
      .catch(() => { if (active) setReceiptError(true); });
    return () => { active = false; };
  }, [datasetId, receiptRetry]);

  async function inspect(candidate: File) {
    const current = ++generation.current;
    setReview(null); setDigest(""); setFeedback(null); setFile(candidate); setChecking(false);
    if (!candidate.name.toLowerCase().endsWith(".csv") || !candidate.size || candidate.size > 10 * 1024 * 1024) {
      setFeedback({ok:false,message:"Selecciona un CSV entre 1 byte y 10 MB."}); return;
    }
    if (!datasetId) return;
    setChecking(true);
    try {
      const [bytes, index] = await Promise.all([
        candidate.arrayBuffer(),
        call<{dataset_id: string; version: string; columns: string[]; rows: [string,string][]}>(`/ml/datasets/${datasetId}/rows`),
      ]);
      if (index.dataset_id !== datasetId || index.version !== liveDataset?.version || index.columns.join(",") !== "id,era") throw new Error("El índice no coincide con la versión de esta ronda. Vuelve a cargarla.");
      const text = new TextDecoder("utf-8", {fatal:true}).decode(bytes);
      const report = reviewPredictionCsv(text, index.rows);
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value=>value.toString(16).padStart(2,"0")).join("");
      if (current !== generation.current) return;
      setReview(report); setDigest(hash);
    } catch (error) {
      if (current === generation.current) setFeedback({ok:false,message:error instanceof TypeError ? "No se pudo leer el archivo o consultar los IDs. Usa UTF-8 y vuelve a revisar." : error instanceof Error ? error.message : "No se pudo revisar el CSV."});
    } finally { if (current === generation.current) setChecking(false); }
  }

  async function send() {
    if (!file || !review?.valid || !datasetId || !canSubmit || sending || checking) return;
    setFeedback(null);
    try {
      if (!model.trim()) throw new Error("Indica el nombre del modelo para identificar tu experimento.");
      const params = JSON.parse(parameters);
      if (!params || Array.isArray(params) || typeof params !== "object" || new TextEncoder().encode(JSON.stringify(params)).length > 2048) throw new Error("Los parámetros deben ser un objeto JSON de hasta 2 KB.");
      const randomSeed = seed.trim() ? Number(seed) : null;
      if (randomSeed !== null && (!Number.isInteger(randomSeed) || randomSeed < 0 || randomSeed > 4294967295)) throw new Error("La semilla debe ser un entero entre 0 y 4294967295, o quedar vacía.");
      setSending(true);
      const response = await submitPredictions(datasetId, file, {model_name:model.trim(),parameters:params,seed:randomSeed,note:note.trim()});
      if (!response.submission) throw new Error("No se recibió el comprobante. Consulta tu historial antes de reintentar.");
      if (response.submission.file_sha256 !== digest) throw new Error("La huella del comprobante no coincide con el archivo revisado. Consulta el historial.");
      setMine(response.submission); setFile(null); setReview(null);
      setFeedback({ok:true,message:"Envío validado y registrado. Tu ficha está guardada; el score se publica después del cierre."});
      window.dispatchEvent(new Event("quantlab:ml-submitted"));
    } catch (error) {
      setFeedback({ok:false,message:error instanceof SyntaxError ? "Los parámetros no son JSON válido. Ejemplo: {\"learning_rate\": 0.05}" : error instanceof Error ? error.message : "No se pudo registrar el envío."});
    } finally { setSending(false); }
  }

  if (!liveDataset) return <p className="text-muted">Todavía no hay datos de predicción publicados.</p>;
  return <div className="space-y-6">
    <section className="rounded-xl border border-line p-5">
      <h3 className="font-semibold text-ink">{canSubmit ? "Envía tus predicciones" : "Recepción de archivos cerrada"}</h3>
      <p className="mt-2 text-sm text-muted">{canSubmit ? "Revisa el CSV y registra el modelo que lo generó. Solo el último envío válido antes del cierre compite." : "Consulta tu comprobante y los resultados cuando la ronda esté puntuada."}</p>
      {liveDataset.closes_at && <p className="mt-2 text-sm text-muted">Cierre: {date(liveDataset.closes_at)} · Colombia</p>}
    </section>
    {canSubmit && <>
      <div className="rounded-xl border border-dashed border-line p-6" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if (!sending && event.dataTransfer.files[0]) void inspect(event.dataTransfer.files[0]);}}>
        <label className="block text-base text-ink">Archivo de predicciones
          <input aria-label="Archivo de predicciones" type="file" accept=".csv,text/csv" disabled={sending} className="mt-3 block w-full max-w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-ink" onChange={event=>{const selected=event.target.files?.[0];if(selected)void inspect(selected);event.target.value="";}} />
        </label>
        <p className="mt-3 text-sm text-muted">También puedes arrastrar el archivo aquí. Cabecera exacta: <code>id,prediction</code>.</p>
        {file && <p className="mt-2 break-all text-sm text-ink">{file.name} · {file.size.toLocaleString("es-CO")} bytes</p>}
        {checking && <p role="status" className="mt-3 text-sm text-muted">Revisando formato, cobertura y huella del archivo…</p>}
        {file && !checking && !review && <button className={buttonClasses("secondary","sm","mt-3")} onClick={()=>void inspect(file)}>Volver a revisar</button>}
      </div>
      {review && <section aria-label="Revisión previa del CSV" className="rounded-xl border border-line p-5">
        <h3 className="font-semibold text-ink">{review.valid ? "Archivo listo para validar en el servidor" : "Corrige el archivo antes de enviarlo"}</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {[["Filas",review.rows],["Esperadas",review.expected],["IDs repetidos",review.duplicates],["IDs faltantes",review.missing]].map(([label,value])=><div key={String(label)}><dt className="text-muted">{label}</dt><dd className="mt-1 font-mono text-ink">{Number(value).toLocaleString("es-CO")}</dd></div>)}
        </dl>
        {!!review.issues.length && <ul role="alert" className="mt-4 list-disc space-y-1 pl-5 text-sm text-short">{review.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
        <p className="mt-4 text-sm text-muted">Esta revisión usa únicamente IDs y eras públicos. El servidor hace la validación definitiva; no calcula ni anticipa el score.</p>
        <p className="mt-3 break-all font-mono text-xs text-muted">SHA-256: {digest}</p>
      </section>}
      <fieldset disabled={sending} className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <legend className="px-2 font-semibold text-ink">Ficha del experimento</legend>
        <p className="text-sm text-muted">Privada, asociada a este archivo y conservada aunque envíes una corrección. Declara solo los datos que realmente utilizaste.</p>
        <label className="block text-sm text-ink">Nombre del modelo<input value={model} onChange={e=>setModel(e.target.value)} maxLength={100} required className={input} placeholder="Ej.: HistGradientBoosting v1" /></label>
        <label className="block text-sm text-ink">Parámetros (JSON)<textarea aria-label="Parámetros (JSON)" value={parameters} onChange={e=>setParameters(e.target.value)} rows={3} maxLength={2048} spellCheck={false} className={input+" font-mono"} /></label>
        <label className="block text-sm text-ink">Semilla (opcional)<input type="number" min={0} max={4294967295} step={1} value={seed} onChange={e=>setSeed(e.target.value)} className={input} placeholder="Vacía si no utilizaste una semilla" /></label>
        <label className="block text-sm text-ink">Nota del experimento<textarea aria-label="Nota del experimento" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={3} className={input} placeholder="Qué cambiaste y cómo elegiste la configuración." /></label>
      </fieldset>
      <button type="button" disabled={!review?.valid || checking || sending} onClick={()=>void send()} className={buttonClasses("primary","md")}>{sending ? "Verificando…" : "Validar y registrar envío"}</button>
    </>}
    {feedback && <p role={feedback.ok ? "status" : "alert"} className={`rounded-md border border-line p-4 text-sm ${feedback.ok ? "text-long" : "text-short"}`}>{feedback.message}</p>}
    {receiptError && <p role="alert" className="text-sm text-short">No se pudo consultar tu comprobante. <button className="underline" onClick={()=>{setReceiptError(false);setReceiptRetry(value=>value+1);}}>Reintentar consulta</button></p>}
    {mine && <section className="rounded-xl border border-line p-5">
      <h3 className="font-semibold text-ink">Comprobante del envío seleccionado</h3>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Estado</dt><dd>{mine.status === "validated" ? "Validado; esperando cierre" : mine.status}</dd></div>
        <div><dt className="text-muted">Filas</dt><dd>{mine.row_count.toLocaleString("es-CO")}</dd></div>
        <div><dt className="text-muted">Versión</dt><dd className="break-all font-mono">{mine.dataset_version}</dd></div>
        <div><dt className="text-muted">Huella SHA-256</dt><dd className="break-all font-mono">{mine.file_sha256}</dd></div>
      </dl>
      {liveDataset.status === "scored" && mine.score != null && <p className="mt-4">Puntuación final: {mine.score.toFixed(6)}</p>}
      <a className="mt-4 inline-block text-sm text-accent underline" href="/app#historial-ml">Consultar ficha e historial</a>
    </section>}
  </div>;
}
