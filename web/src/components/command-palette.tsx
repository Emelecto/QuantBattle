"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Navegación global de la command-palette (⌘K / Ctrl+K). */
export const NAV = [
  { href: "/app", label: "Inicio", group: "General" },
  { href: "/app/tournaments", label: "Competencias", group: "General" },
  { href: "/app/strategies", label: "Mis proyectos ML", group: "General" },
  { href: "/app/marketplace", label: "Biblioteca ML", group: "General" },
  { href: "/app/learn", label: "Aprender practicando", group: "General" },
  { href: "/app/learn/first-tournament", label: "Mi primer torneo", group: "General" },
  { href: "/app/learn/glossary", label: "Glosario visual", group: "General" },
  { href: "/app/backtesting", label: "Backtesting clásico", group: "General" },
  { href: "/app/academia", label: "Academia", group: "General" },
  { href: "/app/library", label: "Datasets", group: "General" },
  { href: "/app/rankings", label: "Rankings", group: "General" },
  { href: "/app/wallet", label: "Wallet QP", group: "General" },
  { href: "/app/api-keys", label: "API y MCP", group: "General" },
  { href: "/app/profile", label: "Perfil", group: "General" },
] as const;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setActive(0);
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open ]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...NAV];
    return NAV.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.href.toLowerCase().includes(q) ||
        n.group.toLowerCase().includes(q),
    );
  }, [query]);


  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-24"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Navegación rápida"
    >
      <div
        className="ql-glass w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              go(results[active].href);
            }
          }}
          placeholder="Ir a… (filtra por nombre o grupo)"
          aria-label="Buscar destino"
          className="ql-input w-full border-0 bg-transparent px-4 py-3 text-sm"
        />
        <ul className="max-h-72 overflow-y-auto border-t border-line py-1">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">Sin resultados.</li>
          )}
          {results.map((n, i) => (
            <li key={n.href}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(n.href)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  i === active ? "bg-surface text-ink" : "text-muted"
                }`}
              >
                <span>{n.label}</span>
                <span className="text-xs uppercase tracking-wider opacity-70">
                  {n.group}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
