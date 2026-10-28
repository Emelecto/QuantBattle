"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { submitToTournament } from "@/lib/tournaments";
import { getMyStrategies, type MyStrategy } from "@/lib/db";
import { useAuth } from "@/lib/useAuth";
import { buttonClasses } from "@/components/ui/Button";
import { StrategyEditor } from "@/components/Editor";

type Mode = "existing" | "import";

const ASSET_TYPES = [
  { value: "crypto", label: "Crypto" },
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
];

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w", "1M"];

function buildConfig(input: {
  assetType: string;
  symbol: string;
  timeframe: string;
  commissionPct: number;
  capital?: number;
  folds?: number;
  split?: number;
}) {
  return {
    asset_type: input.assetType,
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe,
    commission: input.commissionPct / 100,
    slippage: 0.0005,
    fast: 20,
    slow: 50,
    folds: input.folds ?? 3,
    split: input.split ?? 70,
    start: "2023-01-01",
    end: "2023-12-31",
    capital: input.capital ?? 1000,
  };
}

export function SubmitStrategyModal({
  tournamentId,
  tournamentName,
  onClose,
}: {
  tournamentId: string;
  tournamentName: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("existing");

  const [strategies, setStrategies] = useState<MyStrategy[]>([]);
  const [stratLoading, setStratLoading] = useState(false);
  const [stratError, setStratError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  const [code, setCode] = useState<string>("");
  const [assetType, setAssetType] = useState<string>("crypto");
  const [symbol, setSymbol] = useState<string>("");
  const [timeframe, setTimeframe] = useState<string>("1d");
  const [commissionPct, setCommissionPct] = useState<number>(0.1);
  const [capital, setCapital] = useState<number>(1000);
  const [folds, setFolds] = useState<number>(3);
  const [split, setSplit] = useState<number>(70);
  const [qpStake, setQpStake] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  // Si ya hay una submission en este torneo, el worker responde 400 y aquí
  // ofrecemos reemplazarla en vez de dejar al usuario bloqueado.
  const [needsReplace, setNeedsReplace] = useState(false);

  // Espejo del id seleccionado: el auto-select inicial no debe re-disparar la carga.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const applyStrategy = useCallback((s: MyStrategy) => {
    setCode(s.code ?? "");
    setAssetType(s.asset_type || "crypto");
    setSymbol(s.symbol || "");
    setTimeframe(s.timeframe || "1d");
    setCommissionPct(
      typeof s.commission === "number" ? Math.round(s.commission * 1000) / 10 : 0.1,
    );
    setCapital(typeof s.capital === "number" ? s.capital : 1000);
    setFolds(typeof s.folds === "number" ? s.folds : 3);
    setSplit(typeof s.split === "number" ? s.split : 70);
  }, []);

  // Cargar estrategias del usuario al abrir en modo "existente".
  useEffect(() => {
    if (mode !== "existing" || !user) return;
    let alive = true;
    (async () => {
      setStratLoading(true);
      setStratError(null);
      try {
        const list = await getMyStrategies();
        if (!alive) return;
        setStrategies(list);
        if (list.length > 0 && !selectedIdRef.current) {
          applyStrategy(list[0]);
          setSelectedId(list[0].id);
        }
      } catch (e: unknown) {
        if (!alive) return;
        setStratError(e instanceof Error && e.message ? e.message : "No se pudieron cargar tus estrategias.");
      } finally {
        if (alive) setStratLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, user, applyStrategy]);

  function handleSelectStrategy(id: string) {
    setSelectedId(id);
    const s = strategies.find((x) => x.id === id);
    if (s) applyStrategy(s);
  }

  async function handleEnviar(replace = false) {
    if (!code.trim()) {
      setFeedback({ type: "err", msg: "Pega o selecciona el código de la estrategia." });
      return;
    }
    if (!symbol.trim()) {
      setFeedback({ type: "err", msg: "Indica el símbolo del activo." });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const cfg = buildConfig({
        assetType,
        symbol,
        timeframe,
        commissionPct,
        capital,
        folds,
        split,
      });
      await submitToTournament(tournamentId, code, cfg, qpStake, replace);
      setNeedsReplace(false);
      setFeedback({
        type: "ok",
        msg: replace
          ? "¡Estrategia reemplazada en el torneo!"
          : "¡Estrategia enviada al torneo!",
      });
      window.setTimeout(() => onClose(), 1400);
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message ? e.message : "Error al enviar la estrategia.";
      // El worker avisa que ya existe una submission: ofrecer reemplazo.
      if (/ya enviaste/i.test(msg)) setNeedsReplace(true);
      setFeedback({ type: "err", msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Enviar estrategia al torneo"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="ql-glass ql-elev-2 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              Enviar estrategia al torneo
            </h2>
            <p className="mt-0.5 text-xs text-muted">{tournamentName}</p>
          </div>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!user ? (
            <div className="rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
              Inicia sesión para enviar una estrategia al torneo.
            </div>
          ) : (
            <>
              {/* Selector de modo */}
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface/60 p-1">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                    (mode === "existing"
                      ? "bg-accent text-bg"
                      : "text-muted hover:text-ink")
                  }
                >
                  Estrategia existente
                </button>
                <button
                  type="button"
                  onClick={() => setMode("import")}
                  className={
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                    (mode === "import"
                      ? "bg-accent text-bg"
                      : "text-muted hover:text-ink")
                  }
                >
                  Importar código
                </button>
              </div>

              {/* Modo: estrategia existente */}
              {mode === "existing" && (
                <div className="mt-5 flex flex-col gap-4">
                  {stratLoading ? (
                    <div className="ql-skeleton-card h-10 rounded-md" />
                  ) : stratError ? (
                    <div className="rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
                      {stratError}
                    </div>
                  ) : strategies.length === 0 ? (
                    <div className="rounded-md border border-line bg-surface/40 px-4 py-4 text-sm text-muted">
                      Aún no tienes estrategias guardadas. Créalas en el editor o usa
                      <span className="text-ink"> “Importar código”</span>.
                    </div>
                  ) : (
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Tu estrategia
                      <select
                        value={selectedId}
                        onChange={(e) => handleSelectStrategy(e.target.value)}
                        className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                      >
                        {strategies.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title || s.symbol || "Estrategia"} · {s.symbol || "—"} ·{" "}
                            {s.timeframe || "—"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {mode === "existing" && strategies.length > 0 && (
                    <div className="ql-glass ql-elev-1 overflow-hidden rounded-xl">
                      <div className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
                        strategy.py
                      </div>
                      <StrategyEditor value={code} onChange={setCode} />
                    </div>
                  )}
                </div>
              )}

              {/* Modo: importar código */}
              {mode === "import" && (
                <div className="mt-5 flex flex-col gap-4">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Código de la estrategia (Python)
                    <textarea
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={"def indicator(data):\n    ...\n\ndef signal(fast, slow):\n    ..."}
                      rows={12}
                      spellCheck={false}
                      className="ql-input resize-y rounded-md px-3 py-2 font-mono text-[13px] leading-relaxed text-ink"
                    />
                  </label>
                </div>
              )}

              {/* Campos comunes: símbolo / timeframe / asset_type */}
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Activo
                  <select
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                  >
                    {ASSET_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Símbolo
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="BTCUSDT"
                    className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Timeframe
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                  >
                    {TIMEFRAMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Campos avanzados (compactos) */}
              <details className="mt-4 group">
                <summary className="cursor-pointer list-none text-xs font-medium text-muted transition-colors hover:text-ink">
                  <span className="inline-flex items-center gap-1">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      className="transition-transform"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Parámetros avanzados
                  </span>
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Comisión (%)
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={commissionPct}
                      onChange={(e) => setCommissionPct(Number(e.target.value))}
                      className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Capital
                    <input
                      type="number"
                      min={1}
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Folds (walk-forward)
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={folds}
                      onChange={(e) => setFolds(Number(e.target.value))}
                      className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Split entrenamiento (%)
                    <input
                      type="number"
                      min={10}
                      max={95}
                      value={split}
                      onChange={(e) => setSplit(Number(e.target.value))}
                      className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                    QP a apostar (opcional)
                    <input
                      type="number"
                      min={0}
                      value={qpStake}
                      onChange={(e) => setQpStake(Number(e.target.value))}
                      className="ql-input rounded-md px-3 py-2 text-sm text-ink"
                    />
                  </label>
                </div>
              </details>

              {/* Feedback */}
              {feedback && (
                <div
                  className={
                    "mt-4 rounded-md px-4 py-3 text-sm " +
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={() => !loading && onClose()}
            className={buttonClasses("secondary", "sm")}
          >
            Cancelar
          </button>
          {needsReplace ? (
            <button
              type="button"
              onClick={() => handleEnviar(true)}
              disabled={loading || !user}
              className={buttonClasses("primary", "sm")}
            >
              {loading ? "Reemplazando..." : "Reemplazar mi envío"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleEnviar(false)}
              disabled={loading || !user}
              className={buttonClasses("primary", "sm")}
            >
              {loading ? "Enviando..." : "Enviar estrategia"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
