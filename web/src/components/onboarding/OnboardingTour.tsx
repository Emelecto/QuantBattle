"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markOnboardingStart, trackEvent } from "@/lib/analytics";

type TourStep = {
  title: string;
  text: string;
  /**
   * Selector(es) del elemento a destacar, separados por coma = alternativas.
   * null = tooltip centrado sin target (bienvenida).
   */
  selector: string | null;
  /** Botón extra opcional dentro del tooltip que navega a href. */
  cta?: { label: string; href: string };
};

const STEPS: TourStep[] = [
  { title: "Investiga con QuantLab", text: "Participa en torneos de machine learning: descarga datos, entrena un modelo y envía sus predicciones.", selector: null },
  { title: "Consulta las rondas publicadas", text: "La práctica usa datos sintéticos. Cada ronda tiene su propia versión y fecha de cierre; no otorga premios QP.", selector: '[data-tour="tournaments-link"], a[href="/app/tournaments"]', cta: { label: "Ver torneos", href: "/app/tournaments" } },
  { title: "Prepara tu primer envío", text: "La guía explica las particiones train, validation y live, el formato del CSV y cuándo se publica la puntuación.", selector: null, cta: { label: "Leer la guía", href: "/app/tournaments/guide" } },
  { title: "Revisa la evidencia", text: "Puedes inspeccionar el protocolo y los resultados del piloto técnico. La Academia complementa tu aprendizaje.", selector: null, cta: { label: "Ver evidencia", href: "/docs#evaluacion" } },
];

type Rect = { top: number; left: number; width: number; height: number };

const STORAGE_KEY = "ql_onboarded";
export const TOUR_EVENT = "ql:start-tour";

/** Devuelve el primer elemento VISIBLE para los selectores dados.
 *  Usa querySelectorAll: si el primer match está oculto (variante
 *  móvil/desktop del mismo link), prueba los siguientes en lugar de rendirse. */
function findVisibleTarget(selector: string): HTMLElement | null {
  for (const sel of selector.split(",")) {
    const candidates = document.querySelectorAll(sel.trim());
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el as HTMLElement;
    }
  }
  return null;
}

/** Espera a que el rect se estabilice tras un scroll suave (máx 1s). */
function waitStableRect(el: HTMLElement, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    let last = JSON.stringify(el.getBoundingClientRect());
    const start = performance.now();
    const tick = () => {
      const cur = JSON.stringify(el.getBoundingClientRect());
      if (cur === last) {
        resolve();
        return;
      }
      last = cur;
      if (performance.now() - start > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function OnboardingTour() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);
  // Glide: transición de posición SOLO al cambiar de paso. Durante el
  // seguimiento por scroll queda en false → movimiento instantáneo, sin lag.
  const [glide, setGlide] = useState(false);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Altura REAL del tooltip (medida tras render): el texto varía por paso y
  // usar una estimación fija lo cortaba en los bordes del viewport.
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipH, setTipH] = useState(212);

  const goToStep = useCallback((n: number) => {
    setStep(n);
    setGlide(true);
    if (glideTimer.current) clearTimeout(glideTimer.current);
    glideTimer.current = setTimeout(() => setGlide(false), 340);
  }, []);

  useEffect(
    () => () => {
      if (glideTimer.current) clearTimeout(glideTimer.current);
    },
    [],
  );

  // Mide la altura real del tooltip para posicionarlo sin cortes.
  useEffect(() => {
    if (!open) return;
    const el = tipRef.current;
    if (!el) return;
    const update = () => setTipH(el.offsetHeight || 212);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, step]);

  const measure = useCallback(() => {
    const sel = STEPS[step]?.selector;
    if (!open || !sel) {
      setRect(null);
      return;
    }
    const el = findVisibleTarget(sel);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  }, [step, open]);

  // Al cambiar de paso: scroll al elemento (forzado), espera y mide.
  useEffect(() => {
    if (!open) return;
    const sel = STEPS[step]?.selector;
    if (!sel) {
      const frame = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(frame);
    }
    let cancelled = false;
    (async () => {
      const el = findVisibleTarget(sel);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        await waitStableRect(el);
        if (!cancelled) measure();
      } else {
        setRect(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, open, measure]);

  // Sigue al elemento en scroll/resize y re-mide ante cualquier cambio de layout.
  useEffect(() => {
    if (!open) return;
    const track = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
    // El dashboard carga datos asíncronos que mueven el layout después de la
    // medición inicial: ResizeObserver re-mide en vivo mientras el tour esté abierto.
    const ro = new ResizeObserver(track);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", track, true);
      window.removeEventListener("resize", track);
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [open, measure]);

  const finish = useCallback((completed = false) => {
    setOpen(false);
    setStep(0);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    void trackEvent(completed ? "tour_finished" : "tour_skipped", { completed });
  }, []);

  // Auto-inicio en la primera visita, solo cuando el layout haya asentado:
  // window "load" + document.fonts.ready + 600 ms extra.
  useEffect(() => {
    let onboarded = false;
    try {
      onboarded = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* noop */
    }
    if (onboarded) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const startCountdown = () => {
      document.fonts.ready
        .catch(() => undefined)
        .then(() => {
          timer = setTimeout(() => {
            if (cancelled) return;
            setOpen(true);
            markOnboardingStart();
            void trackEvent("tour_started", { auto: true });
          }, 600);
        });
    };

    if (document.readyState === "complete") {
      startCountdown();
    } else {
      window.addEventListener("load", startCountdown, { once: true });
    }

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      window.removeEventListener("load", startCountdown);
    };
  }, []);

  useEffect(() => {
    const onStart = () => {
      setStep(0);
      setOpen(true);
      markOnboardingStart();
      void trackEvent("tour_started");
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const cta = current.cta;

  const next = () => (isLast ? finish(true) : goToStep(step + 1));
  const prev = () => goToStep(Math.max(0, step - 1));

  // Posicionamiento del tooltip: al lado con más espacio. Nunca tapa al target.
  let tooltipStyle: React.CSSProperties;
  let arrow: "top" | "bottom" | "left" | "right" | null = null;
  if (rect) {
    const TW = 340;
    const TH = tipH; // altura real medida
    const GAP = 14;
    const M = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;
    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;

    let top = 0;
    let left = 0;

    if (spaceRight >= TW + GAP * 2 && spaceRight >= spaceLeft) {
      left = Math.min(rect.left + rect.width + GAP, vw - TW - M);
      top = Math.min(Math.max(rect.top, M), Math.max(vh - TH - M, M));
      arrow = "left";
    } else if (spaceLeft >= TW + GAP * 2) {
      left = Math.max(rect.left - TW - GAP, M);
      top = Math.min(Math.max(rect.top, M), Math.max(vh - TH - M, M));
      arrow = "right";
    } else if (spaceBelow >= TH + GAP * 2 || spaceBelow >= spaceAbove) {
      left = Math.min(Math.max(rect.left + rect.width / 2 - TW / 2, M), vw - TW - M);
      top = Math.min(rect.top + rect.height + GAP, Math.max(vh - TH - M, M));
      arrow = "top";
    } else {
      left = Math.min(Math.max(rect.left + rect.width / 2 - TW / 2, M), vw - TW - M);
      top = Math.max(rect.top - TH - GAP, M);
      arrow = "bottom";
    }

    tooltipStyle = { position: "fixed", top, left, maxWidth: TW, width: TW };
  } else {
    // Centrado real en viewport (el tour vive en <body> vía portal).
    tooltipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: 380,
      width: "min(90vw, 380px)",
    };
  }

  // Portal a <body>: si el tour viviera dentro de <main>, el transform
  // residual de ql-fade-in (fill-mode both en el CSS global) volvería a main
  // el containing block de los position:fixed y TODO se desplazaría — tooltip
  // "muy abajo" y spotlights que no apuntan al elemento real.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Tour de bienvenida" className="ql-light-tour">
      <style>{`
        @keyframes ql-tour-fade { from { opacity: 0 } to { opacity: 1 } }
        .ql-tour-glide { transition: top 300ms cubic-bezier(.22,.9,.3,1), left 300ms cubic-bezier(.22,.9,.3,1); }
        @media (prefers-reduced-motion: reduce) { .ql-tour-glide { transition: none; } }
      `}</style>
      {/* Spotlight sobre el elemento objetivo (recorte + halo). */}
      {rect ? (
        <div
          className={`pointer-events-auto fixed z-[90] rounded-xl ${glide ? "ql-tour-glide" : ""}`}
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow:
              "0 0 0 9999px rgba(4,6,10,0.88), 0 0 24px 4px rgba(248,250,252,0.18)",
            outline: "2px solid rgba(248,250,252,0.75)",
            outlineOffset: "-1px",
          }}
          onClick={() => finish(true)}
        />
      ) : (
        <div
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(4,6,10,0.88)" }}
          onClick={() => finish(true)}
        />
      )}

      {/* Tooltip: tarjeta sólida y legible sobre el backdrop oscuro.
          overflow-y-auto por si un viewport muy bajo no cabe la tarjeta. */}
      <div
        ref={tipRef}
        style={{ ...tooltipStyle, zIndex: 100 }}
        className={`ql-elev-2 max-h-[calc(100vh-24px)] overflow-y-auto rounded-lg border border-[#dce6ef] bg-white p-5 shadow-[0_18px_50px_rgba(20,45,78,0.24)] ${glide ? "ql-tour-glide" : ""}`}
      >
        {/* Flechas FUERA del contenedor (sin overflow que las corte) y con
            margen de seguridad para el radio del borde. */}
        {arrow === "left" && (
          <span className="pointer-events-none absolute -left-[9px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[3px] border-l border-b border-[#dce6ef] bg-white" />
        )}
        {arrow === "right" && (
          <span className="pointer-events-none absolute -right-[9px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[3px] border-r border-t border-[#dce6ef] bg-white" />
        )}
        {arrow === "top" && (
          <span className="pointer-events-none absolute -top-[9px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border-l border-t border-[#dce6ef] bg-white" />
        )}
        {arrow === "bottom" && (
          <span className="pointer-events-none absolute -bottom-[9px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border-r border-b border-[#dce6ef] bg-white" />
        )}

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[#172840]">{current.title}</h3>
          <span className="font-mono text-xs text-[#52677d]">
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#52677d]">{current.text}</p>
        {cta && (
          <button
            onClick={() => {
              // Navegar abandona el dashboard: marcar el tour como visto.
              finish(true);
              router.push(cta.href);
            }}
            className="mt-3 w-full rounded-md border border-[#cddced] bg-[#f0f6fd] px-3 py-2 text-xs font-semibold text-[#2455ae] transition-colors hover:bg-[#e4effc]"
          >
            {cta.label}
          </button>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            onClick={() => finish(true)}
            className="text-xs font-medium text-[#52677d] transition-colors hover:text-[#172840]"
          >
            Saltar
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="rounded-md border border-[#cddced] px-3 py-1.5 text-xs font-medium text-[#52677d] transition-colors hover:text-[#172840]"
              >
                Anterior
              </button>
            )}
            <button
              onClick={next}
              className="rounded-md bg-[#245ce5] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#174cbf]"
            >
              {isLast ? "Listo" : "Siguiente"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${i === step ? "w-4 bg-[#245ce5]" : "w-1.5 bg-[#cdd9e7]"}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
