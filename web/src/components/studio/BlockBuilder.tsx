"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { inputClasses } from "@/components/ui/Form";

/**
 * Constructor por bloques (estilo "Scratch para trading") sin librerías de DnD.
 * El usuario añade filas [Indicador + Condición + Acción] y genera un `code`
 * compatible (formato fast/slow cuando aplica). Llama onGenerate(code).
 */
type Indicator = "SMA" | "RSI" | "Precio";
type Condition = "cruza_arriba" | "cruza_debajo" | "mayor_que";
type Action = "Comprar" | "Vender";

type Rule = {
  indicator: Indicator;
  fast: number;
  slow: number;
  condition: Condition;
  action: Action;
};

const DEFAULT_RULE: Rule = {
  indicator: "SMA",
  fast: 20,
  slow: 50,
  condition: "cruza_arriba",
  action: "Comprar",
};

export function BlockBuilder({
  onGenerate,
}: {
  onGenerate: (code: string) => void;
}) {
  const [rules, setRules] = useState<Rule[]>([{ ...DEFAULT_RULE }]);

  function update(i: number, patch: Partial<Rule>) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRules((rs) => [...rs, { ...DEFAULT_RULE }]);
  }
  function remove(i: number) {
    setRules((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));
  }

  function generate() {
    // Por ahora el motor solo entiende cruce SMA; usamos la primera regla SMA.
    const sma = rules.find((r) => r.indicator === "SMA") ?? rules[0];
    const f = Math.min(200, Math.max(2, sma.fast));
    const s = Math.min(400, Math.max(f + 1, sma.slow));
    const invert =
      sma.condition === "cruza_debajo" ||
      (sma.condition === "mayor_que" && sma.action === "Vender");
    const code = `fast=${f},slow=${s}${invert ? ",invert=true" : ""}`;
    onGenerate(code);
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Constructor por bloques
        </h3>
        <button
          onClick={add}
          className={buttonClasses("ghost", "sm") + " text-accent"}
        >
          + Añadir regla
        </button>
      </div>

      <p className="text-[12px] text-muted">
        Une indicadores, condiciones y acciones. Cada regla es una señal.
      </p>

      <div className="flex flex-col gap-2">
        {rules.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-solid p-3"
          >
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Indicador
              <select
                className={inputClasses + " h-9"}
                value={r.indicator}
                onChange={(e) =>
                  update(i, { indicator: e.target.value as Indicator })
                }
              >
                <option value="SMA">SMA</option>
                <option value="RSI">RSI</option>
                <option value="Precio">Precio</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Rápida
              <input
                type="number"
                min={2}
                max={200}
                value={r.fast}
                onChange={(e) => update(i, { fast: Number(e.target.value) })}
                className={inputClasses + " h-9 w-20"}
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Lenta
              <input
                type="number"
                min={3}
                max={400}
                value={r.slow}
                onChange={(e) => update(i, { slow: Number(e.target.value) })}
                className={inputClasses + " h-9 w-20"}
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Condición
              <select
                className={inputClasses + " h-9"}
                value={r.condition}
                onChange={(e) =>
                  update(i, { condition: e.target.value as Condition })
                }
              >
                <option value="cruza_arriba">cruza arriba</option>
                <option value="cruza_debajo">cruza debajo</option>
                <option value="mayor_que">mayor que</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Acción
              <select
                className={inputClasses + " h-9"}
                value={r.action}
                onChange={(e) =>
                  update(i, { action: e.target.value as Action })
                }
              >
                <option value="Comprar">Comprar</option>
                <option value="Vender">Vender</option>
              </select>
            </label>

            <button
              onClick={() => remove(i)}
              className="ml-auto text-[12px] text-muted hover:text-short"
              aria-label="Eliminar regla"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={generate}
        className={buttonClasses("primary", "md") + " w-full justify-center"}
      >
        Generar código
      </button>
    </div>
  );
}
