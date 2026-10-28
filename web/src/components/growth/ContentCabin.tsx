"use client";
import { useHydrated } from "@/hooks/useHydrated";

import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";

export interface SeedIdea {
  text: string;
  pilar: string;
  formato: string;
}

interface Idea extends SeedIdea {
  id: string;
  done: boolean;
}

interface ContentCabinProps {
  network: "Instagram" | "TikTok" | "X";
  tagline: string;
  storageKey: string;
  pilares: string[];
  formatos: string[];
  seeds: SeedIdea[];
  hooks: string[];
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

const norm = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

export function ContentCabin(props: ContentCabinProps) {
  const hydrated = useHydrated();
  return hydrated ? <ContentCabinState key={props.storageKey} {...props} /> : null;
}

function ContentCabinState({
  network,
  tagline,
  storageKey,
  pilares,
  formatos,
  seeds,
  hooks,
}: ContentCabinProps) {
  const [ideas, setIdeas] = useState<Idea[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
  });
  const [text, setText] = useState("");
  const [pilar, setPilar] = useState(pilares[0]);
  const [formato, setFormato] = useState(formatos[0]);
  const [hookIdx, setHookIdx] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Persiste cada cambio (tras la carga inicial).
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(ideas));
    } catch {
      /* cuota llena o storage bloqueado: no rompe la página */
    }
  }, [ideas, storageKey]);

  const byPilar = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ideas) m.set(i.pilar, (m.get(i.pilar) ?? 0) + 1);
    return [...m.entries()];
  }, [ideas]);

  const byFormato = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ideas) m.set(i.formato, (m.get(i.formato) ?? 0) + 1);
    return [...m.entries()];
  }, [ideas]);

  const done = ideas.filter((i) => i.done).length;

  function addIdea() {
    const t = text.trim();
    if (!t) return;
    setIdeas((prev) => [
      { id: uid(), text: t, pilar, formato, done: false },
      ...prev,
    ]);
    setText("");
    setNotice(null);
  }

  function toggleDone(id: string) {
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    );
  }

  function removeIdea(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  function loadCalendar() {
    const existing = new Set(ideas.map((i) => norm(i.text)));
    const fresh = seeds.filter((s) => !existing.has(norm(s.text)));
    setIdeas((prev) => [
      ...prev,
      ...fresh.map((s) => ({ ...s, id: uid(), done: false })),
    ]);
    const dupes = seeds.length - fresh.length;
    setNotice(
      fresh.length === 0
        ? "Calendario ya cargado: 0 ideas nuevas, sin duplicados añadidos."
        : `Calendario cargado: ${fresh.length} ideas nuevas` +
            (dupes > 0 ? `, ${dupes} duplicadas omitidas.` : "."),
    );
  }

  function nextHook() {
    if (hooks.length < 2) return;
    setHookIdx((prev) => {
      let n = Math.floor(Math.random() * hooks.length);
      if (n === prev) n = (n + 1) % hooks.length;
      return n;
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      {/* Cabecera */}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Cabina de contenido · {network}
      </p>
      <h1 className="mt-2 font-semibold tracking-tight text-ink">
        Headquarter {network}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
        {tagline}
      </p>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
        Contenido educativo. Los QP son puntos virtuales sin valor monetario.
        Nada aquí promete retornos: el pasado no garantiza el futuro.
      </p>

      {/* Métricas */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { label: "Ideas", value: ideas.length },
          { label: "Hechas", value: done },
          { label: "Pendientes", value: ideas.length - done },
        ].map((s) => (
          <div key={s.label} className="ql-glass px-4 py-3">
            <p className="metric text-2xl font-semibold text-ink">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Composer */}
        <section className="ql-glass p-5">
          <h2 className="text-[15px] font-semibold text-ink">
            Nueva idea
          </h2>
          <label
            htmlFor={`${storageKey}-text`}
            className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted"
          >
            Idea
          </label>
          <textarea
            id={`${storageKey}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej.: Reel explicando qué es el Sharpe OOS con un ejemplo real…"
            rows={3}
            className="ql-input mt-2 w-full rounded-md px-3 py-2 text-sm"
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${storageKey}-pilar`}
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Pilar
              </label>
              <select
                id={`${storageKey}-pilar`}
                value={pilar}
                onChange={(e) => setPilar(e.target.value)}
                className="ql-input mt-2 w-full rounded-md px-3 py-2 text-sm"
              >
                {pilares.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`${storageKey}-formato`}
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Formato
              </label>
              <select
                id={`${storageKey}-formato`}
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                className="ql-input mt-2 w-full rounded-md px-3 py-2 text-sm"
              >
                {formatos.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addIdea}
              disabled={!text.trim()}
              className={buttonClasses("primary", "sm")}
            >
              Añadir idea
            </button>
            <button
              type="button"
              onClick={loadCalendar}
              className={buttonClasses("secondary", "sm")}
            >
              Cargar calendario 30 días
            </button>
          </div>
          {notice && (
            <p className="mt-3 text-xs leading-relaxed text-muted">{notice}</p>
          )}
        </section>

        {/* Generador de hooks */}
        <section className="ql-glass p-5">
          <h2 className="text-[15px] font-semibold text-ink">
            Generador de hook
          </h2>
          <p className="mt-1 text-xs text-muted">
            Primeros 3 segundos: una afirmación honesta, sin humo.
          </p>
          <blockquote className="mt-4 rounded-md border border-line bg-bg/60 px-4 py-4 text-[15px] leading-relaxed text-ink">
            “{hooks[hookIdx]}”
          </blockquote>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={nextHook}
              className={buttonClasses("secondary", "sm")}
            >
              Otro hook
            </button>
            <span className="metric text-xs text-muted">
              {hookIdx + 1} / {hooks.length}
            </span>
          </div>
        </section>
      </div>

      {/* Conteos */}
      <section className="ql-glass mt-4 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Cola por pilar</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {byPilar.length === 0 && (
            <p className="text-xs text-muted">
              Sin ideas todavía. Añade una o carga el calendario.
            </p>
          )}
          {byPilar.map(([p, n]) => (
            <span
              key={p}
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted"
            >
              {p} <span className="metric font-semibold text-ink">{n}</span>
            </span>
          ))}
        </div>
        <h2 className="mt-5 text-[15px] font-semibold text-ink">
          Cola por formato
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {byFormato.length === 0 && (
            <p className="text-xs text-muted">Sin ideas todavía.</p>
          )}
          {byFormato.map(([f, n]) => (
            <span
              key={f}
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted"
            >
              {f} <span className="metric font-semibold text-ink">{n}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Cola de ideas */}
      <section className="mt-4">
        <h2 className="text-[15px] font-semibold text-ink">Cola de ideas</h2>
        {ideas.length === 0 ? (
          <div className="ql-glass mt-3 px-5 py-10 text-center">
            <p className="text-sm text-muted">
              La cola está vacía. Carga el calendario de 30 días o añade tu
              primera idea arriba.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {ideas.map((idea) => (
              <li
                key={idea.id}
                className="ql-glass ql-glass-hover flex items-start gap-3 px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={idea.done}
                  onChange={() => toggleDone(idea.id)}
                  aria-label={idea.done ? "Marcar pendiente" : "Marcar hecha"}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--ql-accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-relaxed ${idea.done ? "text-muted line-through" : "text-ink"}`}
                  >
                    {idea.text}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {idea.pilar} · {idea.formato}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeIdea(idea.id)}
                  aria-label="Eliminar idea"
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
