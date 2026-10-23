"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * /status — Estado del sistema en vivo.
 * Consulta el health del worker midiendo latencia real.
 * Si el fetch falla, muestra CAÍDO (jamás simula éxito).
 */

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? "";

type Status = "ok" | "slow" | "down" | "checking";

const STATUS_META: Record<
  Exclude<Status, "checking">,
  { label: string; dot: string; text: string }
> = {
  ok: {
    label: "Operativo",
    dot: "bg-[#10b981]",
    text: "text-[#10b981]",
  },
  slow: {
    label: "Degradado (lento)",
    dot: "bg-amber-400",
    text: "text-amber-400",
  },
  down: {
    label: "Sin respuesta",
    dot: "bg-short",
    text: "text-short",
  },
};

export default function StatusPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    setLatency(null);
    const start = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55_000);
    try {
      if (!WORKER_URL) throw new Error("WORKER_URL no configurada");
      const res = await fetch(`${WORKER_URL}/health`, { signal: ctrl.signal, cache: "no-store" });
      const ms = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      setLatency(ms);
      setStatus(ms > 2000 ? "slow" : "ok");
      setCheckedAt(new Date().toLocaleTimeString("es-CO", { hour12: false }));
    } catch {
      setStatus("down");
      setCheckedAt(new Date().toLocaleTimeString("es-CO", { hour12: false }));
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), 60_000);
    return () => clearInterval(id);
  }, [check]);

  const meta =
    status === "checking"
      ? { label: "Verificando…", dot: "bg-muted animate-pulse", text: "text-muted" }
      : STATUS_META[status];

  return (
    <main className="flex min-h-screen flex-col">
      <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Estado del sistema
        </h1>
        <p className="mt-2 text-sm text-muted">
          Conectividad y tiempo de respuesta de la API de QuantLab, medidos desde
          tu navegador. Esta consulta no verifica la base de datos, los archivos
          ni la evaluación de una ronda.
        </p>

        <div className="ql-glass ql-elev-1 mt-8 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <div>
                <div className={`text-sm font-semibold ${meta.text}`}>
                  {meta.label}
                </div>
                <div className="metric mt-0.5 text-[11px] text-muted">
                  API de torneos y estrategias
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="metric text-xl font-semibold text-ink tabular-nums">
                {latency != null ? `${latency} ms` : status === "down" ? "—" : "…"}
              </div>
              <div className="metric text-[11px] text-muted">latencia</div>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[12px]">
            <div>
              <dt className="text-muted">Último chequeo</dt>
              <dd className="metric mt-0.5 text-ink">{checkedAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Rondas ML de práctica</dt>
              <dd className="metric mt-0.5 text-ink">Datos sintéticos</dd>
            </div>
          </dl>

          <button
            onClick={() => void check()}
            disabled={status === "checking"}
            className="mt-5 w-full rounded-md border border-line px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
          >
            Revisar de nuevo
          </button>
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          La consulta se repite cada 60 segundos. El primer inicio del servicio
          puede tardar cerca de un minuto. Si no responde, revisa tu conexión y
          vuelve a intentar. La documentación y la evidencia siguen disponibles
          desde la web.
        </p>
        <Link href="/docs#evaluacion" className="mt-4 inline-block text-sm text-accent underline">Consultar evidencia técnica</Link>
      </section>
    </main>
  );
}
