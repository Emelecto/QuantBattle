"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { StrategyEditor, DEFAULT_STRATEGY_CODE } from "@/components/Editor";
import { RiskAdvisor, StrategyExplainer } from "@/components/studio";
import { SymbolPicker, timeframesFor } from "@/components/SymbolPicker";
import { buttonClasses } from "@/components/ui/Button";
import {
  runBacktest,
  validateStrategy,
  BacktestError,
  type StrategyConfig,
  type BacktestResult,
} from "@/lib/api";
import { saveRun } from "@/lib/runs";
import { setStrategyPublic, saveBacktestRun } from "@/lib/db";
import { markStep } from "@/lib/activation";
import { markOnboardingStart, trackFirstBacktest } from "@/lib/analytics";
import {
  publishStrategy,
  submitToTournament,
  listTournaments,
  type Tournament,
} from "@/lib/tournaments";

// Esta página usa useSearchParams (demo/clone) → debe ser dinámica, no prerender.
export const dynamic = "force-dynamic";

export default function NewStrategyPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted">Cargando editor…</div>}>
      <NewStrategyPageRoute />
    </Suspense>
  );
}

function NewStrategyPageRoute() {
  const params = useSearchParams();
  return <NewStrategyPageInner key={params.toString()} demo={!!params.get("demo")} clone={params.get("clone")} />;
}

function NewStrategyPageInner({ demo, clone }: { demo: boolean; clone: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<StrategyConfig>(() => ({
    code: clone || DEFAULT_STRATEGY_CODE,
    asset_type: "crypto",
    symbol: "BTCUSDT",
    timeframe: "1d",
    capital: 1000,
    commission: 0.001,
    slippage: 0.0005,
    folds: 3,
    split: 70,
    start: demo ? new Date(Date.now() - 365 * 86400 * 1000).toISOString().slice(0, 10) : "",
    end: demo ? new Date().toISOString().slice(0, 10) : "",
  }));
  const [isPublic, setIsPublic] = useState(false);
  const [running, setRunning] = useState(false);
  const [wakeMsg, setWakeMsg] = useState<string | null>(null);
  // Modo demo (landing → ?demo=1): config precargada lista para correr.
  const [demoMode, setDemoMode] = useState(demo);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(demo ? "Modo demo: estrategia SMA clásica con datos reales de BTC. Solo pulsa Ejecutar." : null);

  // Compartir / torneo
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishPrice, setPublishPrice] = useState(0);
  const [publishDesc, setPublishDesc] = useState("");
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [tournamentId, setTournamentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function loadTournaments() {
    if (tournaments) return;
    try {
      const list = await listTournaments();
      setTournaments(list.filter((t) => t.status === "open"));
    } catch {
      setTournaments([]);
    }
  }

  /** Publica la estrategia actual en el marketplace. */
  async function handlePublish() {
    setPublishing(true);
    setShareMsg(null);
    try {
      const res = await publishStrategy({
        title:
          config.code.split("\n")[0]?.replace(/^#|def\s+|strategy|:/gi, "").trim().slice(0, 60) ||
          `Estrategia ${config.symbol}`,
        description: publishDesc.trim() || undefined,
        asset_type: config.asset_type,
        symbol: config.symbol,
        timeframe: config.timeframe,
        code: config.code,
        is_public_code: true,
        config: { ...config },
        price_qp_week: Math.max(0, Math.round(publishPrice)),
      });
      setPublishedId(res.id);
      setShareMsg(res.status === "published" ? "Estrategia publicada con métricas guardadas." : "Estrategia guardada, pendiente de evidencia. Todavía no aparece en el catálogo público.");
      if (res.status === "published") markStep("publica");
    } catch (e) {
      setShareMsg(`❌ ${e instanceof Error ? e.message : "No se pudo publicar."}`);
    } finally {
      setPublishing(false);
    }
  }

  /** Envía la estrategia actual a un torneo. */
  async function handleSubmitToTournament() {
    if (!tournamentId) return;
    setSubmitting(true);
    setShareMsg(null);
    try {
      const res = await submitToTournament(tournamentId, config.code, { ...config }, 0);
      setShareMsg(`✅ Enviada al torneo (submission ${res.id.slice(0, 8)}…, estado ${res.status}).`);
      markStep("compite");
    } catch (e) {
      setShareMsg(`❌ ${e instanceof Error ? e.message : "No se pudo enviar al torneo."}`);
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function changeAsset(asset: "crypto" | "stock" | "etf") {
    setConfig((c) => ({
      ...c,
      asset_type: asset,
      // Resetea símbolo y timeframe a defaults coherentes con el nuevo activo.
      symbol: asset === "crypto" ? "BTCUSDT" : asset === "etf" ? "SPY" : "AAPL",
      timeframe: "1d",
    }));
  }

  // ------------------------------------------------------------------
  // Import / Export de estrategia (JSON completo: código + config)
  // ------------------------------------------------------------------
  function exportStrategy() {
    const payload = {
      quantbattle_strategy: true,
      version: 1,
      exported_at: new Date().toISOString(),
      config,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quantbattle-${config.symbol.toLowerCase()}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importStrategy(file: File) {
    setImportMsg(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        // Acepta el formato exportado por QuantBattle o un config plano.
        const cfg = raw?.config ?? raw;
        if (typeof cfg.code !== "string" || !cfg.code.trim()) {
          throw new Error("El archivo no contiene código de estrategia ('code').");
        }
        setConfig((c) => ({
          ...c,
          code: String(cfg.code),
          ...(cfg.asset_type ? { asset_type: normalizeAsset(cfg.asset_type) } : {}),
          ...(cfg.symbol ? { symbol: String(cfg.symbol).toUpperCase() } : {}),
          ...(cfg.timeframe
            ? { timeframe: String(cfg.timeframe) as StrategyConfig["timeframe"] }
            : {}),
          ...(typeof cfg.capital === "number" ? { capital: cfg.capital } : {}),
          ...(typeof cfg.commission === "number" ? { commission: cfg.commission } : {}),
          ...(typeof cfg.slippage === "number" ? { slippage: cfg.slippage } : {}),
          ...(typeof cfg.folds === "number" ? { folds: cfg.folds } : {}),
          ...(typeof cfg.split === "number" ? { split: cfg.split } : {}),
          ...(cfg.start ? { start: String(cfg.start) } : {}),
          ...(cfg.end ? { end: String(cfg.end) } : {}),
        }));
        setImportMsg(`Estrategia "${file.name}" importada correctamente.`);
      } catch (e) {
        setError(
          `No se pudo importar: ${e instanceof Error ? e.message : "archivo inválido"}`,
        );
      }
    };
    reader.readAsText(file);
  }

  async function handleBacktest() {
    setRunning(true);
    setError(null);
    setWakeMsg(null);
    setDemoMode(false); // el banner demo desaparece al ejecutar
    try {
      const validation = await validateStrategy(config);
      if (!validation.valid) {
        setError(validation.warnings.join(" · "));
        setRunning(false);
        return;
      }
      if (validation.warnings.length) {
        console.warn("[QuantBattle warnings]", validation.warnings);
      }

      const result: BacktestResult = await runBacktest(config, (attempt, max) => {
        if (attempt > 1) {
          setWakeMsg(`Despertando worker… reintento ${attempt}/${max}`);
        }
      });

      const run: BacktestResult = {
        id: result.id || crypto.randomUUID(),
        config,
        created_at: new Date().toISOString(),
        metrics: result.metrics,
        integrity_label: result.integrity_label,
        equity_curve: result.equity_curve,
        report: result.report,
      };
      await saveRun(run);

      try {
        // saveRun ya hizo upsert de la estrategia (mismo id que el run) con
        // code/params/metrics. Aquí solo marcamos visibilidad pública si toca
        // y ligamos el run en backtest_runs. NO se crea una segunda fila.
        if (isPublic) await setStrategyPublic(run.id, true);
        await saveBacktestRun(run.id, result);
      } catch (dbErr) {
        console.warn("No se pudo completar el guardado en la nube:", dbErr);
      }
      markOnboardingStart();
      trackFirstBacktest("studio");
      markStep("crea");
      markStep("corre");
      router.push(`/app/strategies/${run.id}/results`);
    } catch (err) {
      if (err instanceof BacktestError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Error inesperado.");
      setRunning(false);
      setWakeMsg(null);
    }
  }

  const tfs = timeframesFor(config.asset_type as "crypto" | "stock" | "etf");

  return (
    <main className="flex min-h-screen flex-col">
      <section className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 py-10 lg:grid-cols-[1fr_360px]">
        {/* Columna principal: editor + asistente IA */}
        <div className="flex flex-col gap-3">
          {/* Barra de acciones del editor */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              Nueva estrategia
            </h1>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importStrategy(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={buttonClasses("secondary", "sm")}
                title="Importar estrategia desde archivo JSON"
              >
                Importar
              </button>
              <button
                type="button"
                onClick={exportStrategy}
                className={buttonClasses("secondary", "sm")}
                title="Exportar estrategia como JSON"
              >
                Exportar
              </button>
            </div>
          </div>

          {demoMode && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-accent/25 bg-accent/[0.06] px-3 py-2">
              <p className="text-[12px] text-ink">
                <strong className="font-semibold">Modo demo:</strong>{" "}
                configuración lista con datos reales de BTC. Solo pulsa{" "}
                <em>Ejecutar backtest OOS</em>.
              </p>
              <button
                type="button"
                onClick={() => setDemoMode(false)}
                aria-label="Salir del modo demo"
                className="text-muted transition-colors hover:text-ink"
              >
                ✕
              </button>
            </div>
          )}
          {importMsg && !demoMode && (
            <p className="rounded-md border border-long/30 bg-long/[0.08] px-3 py-2 text-[12px] text-long">
              {importMsg}
            </p>
          )}
          {error && (
            <p className="rounded-md border border-short/30 bg-short/10 px-3 py-2 text-[12px] text-short">
              {error}
            </p>
          )}

          <div className="qb-glass qb-elev-2 overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                strategy.py
              </span>
              <span className="text-xs text-muted">Python</span>
            </div>
            <StrategyEditor value={config.code} onChange={(v) => update("code", v)} />
          </div>

          {/* Chat IA */}
          <div className="qb-glass qb-elev-1 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" />
              Asistente IA
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Describe tu idea y genera código real para el motor.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem("ai-prompt") as HTMLTextAreaElement;
                const prompt = input.value.trim();
                if (!prompt) return;
                input.value = "";
                setAiLoading(true);
                setAiError(null);
                try {
                  const res = await fetch("/api/strategy-ai", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt,
                      asset_type: config.asset_type,
                      symbol: config.symbol,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setAiError(data.error ?? "Error del asistente.");
                  } else {
                    if (data.code) update("code", data.code);
                    if (typeof data.commission === "number") update("commission", data.commission);
                    if (typeof data.slippage === "number") update("slippage", data.slippage);
                    setAiExplanation(data.explanation ?? "");
                  }
                } catch {
                  setAiError("No se pudo contactar con la IA.");
                } finally {
                  setAiLoading(false);
                }
              }}
              className="mt-3 flex flex-col gap-2"
            >
              <textarea
                name="ai-prompt"
                rows={2}
                placeholder="Ej: comprar cuando la media de 10 cruza sobre la de 30"
                className="qb-input resize-y rounded-md px-3 py-2 text-sm text-ink"
              />
              <button
                type="submit"
                disabled={aiLoading}
                className={buttonClasses("secondary", "md") + " w-full justify-center"}
              >
                {aiLoading ? "Generando…" : "Generar código"}
              </button>
            </form>
            {aiError && (
              <p className="mt-2 rounded-md border border-short/30 bg-short/10 px-3 py-2 text-[12px] text-short">
                {aiError}
              </p>
            )}
            {aiExplanation && (
              <p className="mt-2 rounded-md border border-line bg-surface-solid px-3 py-2 text-[12px] leading-relaxed text-ink">
                {aiExplanation}
              </p>
            )}
          </div>
        </div>

        {/* Panel lateral: configuración + riesgo + explicador */}
        <aside className="flex flex-col gap-4">
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h2 className="text-sm font-semibold tracking-tight text-ink">Configuración</h2>
            <div className="mt-4 flex flex-col gap-3.5">
              {/* Tipo de activo */}
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted">
                  Tipo de activo
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { k: "crypto", label: "Cripto" },
                      { k: "stock", label: "Acción" },
                      { k: "etf", label: "ETF" },
                    ] as const
                  ).map((a) => (
                    <button
                      key={a.k}
                      type="button"
                      onClick={() => changeAsset(a.k)}
                      className={
                        "rounded-md border px-2 py-2 text-[13px] font-medium transition-colors " +
                        (config.asset_type === a.k
                          ? "border-accent bg-surface-solid text-ink"
                          : "border-line text-muted hover:text-ink")
                      }
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </label>

              {/* Símbolo — combobox con búsqueda */}
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted">
                  Símbolo
                </span>
                <SymbolPicker
                  assetType={config.asset_type as "crypto" | "stock" | "etf"}
                  value={config.symbol}
                  onChange={(s) => update("symbol", s)}
                />
              </label>

              {/* Timeframe */}
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted">
                  Temporalidad
                </span>
                <select
                  value={config.timeframe}
                  onChange={(e) =>
                    update("timeframe", e.target.value as StrategyConfig["timeframe"])
                  }
                  className="qb-input h-10 w-full rounded-md px-3 text-sm text-ink"
                >
                  {tfs.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.value})
                    </option>
                  ))}
                </select>
              </label>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-muted">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={config.start}
                    max={config.end || undefined}
                    onChange={(e) => update("start", e.target.value)}
                    className="qb-input h-10 w-full rounded-md px-3 text-sm text-ink"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-muted">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={config.end}
                    min={config.start || undefined}
                    onChange={(e) => update("end", e.target.value)}
                    className="qb-input h-10 w-full rounded-md px-3 text-sm text-ink"
                  />
                </label>
              </div>
              {!config.start || !config.end ? (
                <p className="text-[11px] text-muted">
                  Elige el rango de datos históricos para el backtest.
                </p>
              ) : null}

              {/* Capital */}
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted">
                  Capital inicial (USD)
                </span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={config.capital}
                  onChange={(e) => update("capital", Number(e.target.value))}
                  className="qb-input h-10 w-full rounded-md px-3 text-sm text-ink"
                />
              </label>

              {/* Comisión / slippage */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-muted">
                    Comisión %
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={config.commission}
                    onChange={(e) => update("commission", Number(e.target.value))}
                    className="qb-input h-10 w-full rounded-md px-3 text-sm text-ink"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-muted">
                    Slippage %
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={config.slippage}
                    onChange={(e) => update("slippage", Number(e.target.value))}
                    className="qb-input h-10 w-full rounded-md px-3 text-sm text-ink"
                  />
                </label>
              </div>

              {/* Compartir */}
              <label className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-solid px-3 py-2.5">
                <span className="text-[13px] text-ink">Compartir en la comunidad</span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-[#f8fafc]"
                />
              </label>
            </div>

            <button
              onClick={handleBacktest}
              disabled={running}
              className={buttonClasses("primary", "lg") + " mt-5 w-full justify-center"}
            >
              {running ? (wakeMsg ?? "Ejecutando backtest…") : "Ejecutar backtest OOS"}
            </button>
            {running && (
              <p role="status" aria-live="polite" className="mt-2 text-center text-[11px] text-muted">
                {wakeMsg ?? "Ejecutando backtest…"}
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-muted">
              Walk-forward · {config.folds} folds · split {config.split}/{100 - config.split}
            </p>

            {/* Compartir: marketplace o torneo */}
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink">Comparte tu estrategia</h3>
              {shareMsg && (
                <p
                  className={`mt-2 rounded-md border px-3 py-2 text-[12px] ${
                    shareMsg.startsWith("✅")
                      ? "border-long/30 bg-long/10 text-long"
                      : "border-short/30 bg-short/10 text-short"
                  }`}
                >
                  {shareMsg}
                </p>
              )}

              {/* Publicar al marketplace */}
              {!publishedId ? (
                <div className="mt-3 flex flex-col gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">
                      Precio (QP/semana, 0 = gratis)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={publishPrice}
                      onChange={(e) => setPublishPrice(Number(e.target.value))}
                      className="qb-input h-9 w-full rounded-md px-3 text-sm text-ink"
                    />
                  </label>
                  <textarea
                    rows={2}
                    value={publishDesc}
                    onChange={(e) => setPublishDesc(e.target.value)}
                    placeholder="Descripción corta para el marketplace…"
                    className="qb-input resize-y rounded-md px-3 py-2 text-[13px] text-ink"
                  />
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    className={buttonClasses("secondary", "sm") + " w-full justify-center"}
                  >
                    {publishing ? "Publicando…" : "Publicar en el marketplace"}
                  </button>
                </div>
              ) : (
                <Link
                  href="/app/marketplace/trading"
                  className="mt-3 block rounded-md border border-long/30 bg-long/10 px-3 py-2 text-center text-[13px] text-long transition-colors hover:bg-long/15"
                >
                  Verla en el marketplace →
                </Link>
              )}

              {/* Enviar a torneo */}
              <div className="mt-4 border-t border-line pt-4" onFocus={loadTournaments}>
                <button
                  type="button"
                  onClick={() => {
                    loadTournaments();
                  }}
                  onMouseEnter={loadTournaments}
                  className="mb-2 w-full text-left text-[11px] font-medium text-muted hover:text-accent"
                >
                  ▤ Enviar a un torneo semanal →
                </button>
                {tournaments == null ? null : tournaments.length === 0 ? (
                  <p className="text-[11px] text-muted">No hay torneos abiertos.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <select
                      value={tournamentId}
                      onChange={(e) => setTournamentId(e.target.value)}
                      className="qb-input h-9 w-full rounded-md px-3 text-[13px] text-ink"
                    >
                      <option value="">Elige un torneo abierto…</option>
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.symbols?.join(", ")})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleSubmitToTournament}
                      disabled={!tournamentId || submitting}
                      className={buttonClasses("secondary", "sm") + " w-full justify-center"}
                    >
                      {submitting ? "Enviando…" : "Enviar al torneo"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <RiskAdvisor
            onApply={(p) => {
              if (p.commission !== undefined) update("commission", p.commission);
            }}
          />
          <StrategyExplainer code={config.code} />
        </aside>
      </section>
    </main>
  );
}

function normalizeAsset(v: unknown): "crypto" | "stock" | "etf" {
  const s = String(v).toLowerCase().trim();
  return s === "stock" ? "stock" : s === "etf" ? "etf" : "crypto";
}
