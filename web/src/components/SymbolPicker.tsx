"use client";

/**
 * SymbolPicker — combobox con búsqueda: dropdown + searchbar para elegir
 * símbolo de un catálogo curado (crypto/stock/etf). Permite ticker libre
 * si no está en la lista (el worker valida contra la fuente real).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_SYMBOLS,
  TIMEFRAMES_BY_ASSET,
  type AssetType,
  type SymbolEntry,
} from "@/lib/symbols";

export function SymbolPicker({
  assetType,
  value,
  onChange,
}: {
  assetType: AssetType;
  value: string;
  onChange: (symbol: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Foco en la searchbar al abrir.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const pool = ALL_SYMBOLS.filter((s) => s.asset_type === assetType);
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 40);
    return pool
      .filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [assetType, query]);

  const exactInPool = poolHas(assetType, value);

  function pick(entry: SymbolEntry) {
    onChange(entry.symbol);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="qb-input flex h-10 w-full items-center justify-between rounded-md px-3 text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "text-ink" : "text-muted"}>
          {value || "Selecciona un símbolo…"}
        </span>
        <svg
          viewBox="0 0 16 16"
          width={12}
          height={12}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-[0_14px_35px_rgba(31,59,96,.14)]"
          role="listbox"
        >
          <div className="border-b border-line p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por ticker o nombre…"
              className="qb-input w-full rounded-md px-3 py-1.5 text-[13px] text-ink"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {results.map((s) => (
              <li key={s.symbol}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-solid ${
                    s.symbol === value ? "bg-surface-solid" : ""
                  }`}
                >
                  <span className="font-mono font-medium text-ink">{s.symbol}</span>
                  <span className="truncate pl-3 text-[12px] text-muted">{s.name}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && query.trim() && (
              <>
                <li className="px-3 py-2.5 text-[12px] text-muted">
                  Sin coincidencias en el catálogo.
                </li>
                {isValidFreeTicker(query) && (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        pick({
                          symbol:
                            assetType === "crypto"
                              ? `${query.trim().toUpperCase()}`
                              : query.trim().toUpperCase(),
                          name: "Ticker personalizado",
                          asset_type: assetType,
                        })
                      }
                      className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-surface-solid"
                    >
                      <span className="text-accent">+</span>
                      <span className="font-mono text-ink">
                        {query.trim().toUpperCase()}
                      </span>
                      <span className="text-[11px] text-muted">usar de todos modos</span>
                    </button>
                  </li>
                )}
              </>
            )}
          </ul>
        </div>
      )}

      {/* Aviso sutil si el valor actual no está en el catálogo (ticker libre). */}
      {value && !exactInPool && !open && (
        <p className="mt-1 text-[11px] text-muted">
          Ticker personalizado — se valida contra la fuente real al correr el backtest.
        </p>
      )}
    </div>
  );
}

function poolHas(assetType: AssetType, symbol: string): boolean {
  if (!symbol) return true;
  const up = symbol.toUpperCase();
  return ALL_SYMBOLS.some(
    (s) => s.asset_type === assetType && s.symbol.toUpperCase() === up,
  );
}

function isValidFreeTicker(q: string): boolean {
  const t = q.trim().toUpperCase();
  return /^[A-Z0-9.\-]{1,12}$/.test(t);
}

/** Timeframes disponibles según el activo — helper exportado para la página. */
export function timeframesFor(assetType: AssetType) {
  return TIMEFRAMES_BY_ASSET[assetType];
}
