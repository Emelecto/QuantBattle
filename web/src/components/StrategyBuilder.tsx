"use client";

import { FormEvent, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { inputClasses } from "@/components/ui/Form";

/**
 * Builder visual de estrategias (sin código). Genera un `code` compatible con
 * el motor (formato fast=XX,slow=YY) y lo propaga al padre vía onChange, para
 * que Monaco y el backtest lo usen. También trae un asistente IA que llama a
 * /api/strategy-ai y vuelca el code generado.
 */
export function StrategyBuilder({
  code,
  onChange,
  onParams,
}: {
  code: string;
  onChange: (code: string) => void;
  /** Propaga comisión/slippage sugeridos por la IA (fracciones). */
  onParams?: (commission: number, slippage: number) => void;
}) {
  // Parseo ligero del code actual para inicializar los sliders.
  const parsed = parseCode(code);
  const [fast, setFast] = useState(parsed.fast);
  const [slow, setSlow] = useState(parsed.slow);
  const [invert, setInvert] = useState(parsed.invert);

  // Sincroniza con cambios externos al code (plantillas, IA, bloques).
  const [previousCode, setPreviousCode] = useState(code);
  if (previousCode !== code) {
    setPreviousCode(code);
    setFast(parsed.fast);
    setSlow(parsed.slow);
    setInvert(parsed.invert);
  }

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  function generate() {
    const f = Math.min(Math.max(fast, 2), 200);
    const s = Math.min(Math.max(slow, f + 1), 400);
    setFast(f);
    setSlow(s);
    const suffix = invert ? ",invert=true" : "";
    onChange(`fast=${f},slow=${s}${suffix}`);
  }

  async function handleAi(e: FormEvent) {
    e.preventDefault();
    setAiError(null);
    setAiLoading(true);
    try {
      const resp = await fetch("/api/strategy-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setAiError(data.error ?? "El asistente falló.");
        return;
      }
      setAiExplanation(data.explanation ?? "");
      if (data.code) {
        onChange(data.code);
        // Refleja en los sliders si el code trae fast/slow.
        const p = parseCode(data.code);
        setFast(p.fast);
        setSlow(p.slow);
        setInvert(p.invert);
      }
      // Aplica comisión/slippage sugeridos por la IA al backtest.
      if (typeof data.commission === "number" && typeof data.slippage === "number") {
        onParams?.(data.commission, data.slippage);
      } else if (typeof data.commission === "number") {
        onParams?.(data.commission, 0.0005);
      }
    } catch {
      setAiError("No se pudo contactar al asistente IA.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Tipo de señal
        </h3>
        <p className="mt-1 text-[12px] text-muted">
          Cruce de medias móviles (SMA). El más sólido y explicables.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[13px] text-accent">
            Cruce de medias (SMA)
          </span>
          <span className="rounded-md border border-line bg-surface-solid px-3 py-1.5 text-[12px] text-muted opacity-60">
            RSI · Momentum · Volumen (próximamente)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Media rápida (fast)
          <input
            type="number"
            min={2}
            max={200}
            value={fast}
            onChange={(e) =>
              setFast(Math.min(200, Math.max(2, Number(e.target.value))))
            }
            className={inputClasses}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Media lenta (slow)
          <input
            type="number"
            min={3}
            max={400}
            value={slow}
            onChange={(e) =>
              setSlow(Math.min(400, Math.max(fast + 1, Number(e.target.value))))
            }
            className={inputClasses}
          />
        </label>
      </div>

      <label className="flex items-center gap-2.5 text-[13px] text-ink">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={invert}
          onChange={(e) => setInvert(e.target.checked)}
        />
        Invertir señal (operar en corto cuando la rápida supera a la lenta)
      </label>

      <button
        onClick={generate}
        className={buttonClasses("primary", "md") + " w-full justify-center"}
      >
        Generar código
      </button>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Asistente IA
        </h3>
        <p className="mt-1 text-[12px] text-muted">
          Describe tu idea y la IA genera la estrategia por ti.
        </p>
        <form onSubmit={handleAi} className="mt-3 flex flex-col gap-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ej: quiero comprar cuando la tendencia corta supera a la larga pero solo en cripto líquida"
            rows={3}
            className={inputClasses + " h-auto resize-y py-2"}
          />
          <button
            type="submit"
            disabled={aiLoading || !aiPrompt.trim()}
            className={buttonClasses("secondary", "md") + " w-full justify-center"}
          >
            {aiLoading ? "Generando…" : "Generar con IA"}
          </button>
        </form>
        {aiError && (
          <p className="mt-2 rounded-md border border-short/30 bg-short/10 px-3 py-2 text-[12px] text-short">
            {aiError}
          </p>
        )}
        {aiExplanation && (
          <p className="mt-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-[12px] leading-relaxed text-ink">
            {aiExplanation}
          </p>
        )}
      </div>
    </div>
  );
}

function parseCode(code: string): {
  fast: number;
  slow: number;
  invert: boolean;
} {
  const f = code.match(/fast\s*=\s*(\d+)/i);
  const s = code.match(/slow\s*=\s*(\d+)/i);
  const inv = /invert\s*=\s*true/i.test(code);
  return {
    fast: f ? Number(f[1]) : 20,
    slow: s ? Number(s[1]) : 50,
    invert: inv,
  };
}
