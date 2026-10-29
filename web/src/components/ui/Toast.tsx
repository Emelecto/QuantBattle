"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error";

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  notify: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => remove(id), DURATION_MS);
      timers.current.set(id, timer);
    },
    [remove],
  );

  const success = useCallback((m: string) => notify(m, "success"), [notify]);
  const error = useCallback((m: string) => notify(m, "error"), [notify]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ notify, success, error }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={
              "qb-glass qb-elev-1 pointer-events-auto flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm " +
              (t.type === "success"
                ? "border-long/40"
                : "border-short/40")
            }
          >
            <span
              aria-hidden
              className={
                "mt-1 inline-block h-2 w-2 shrink-0 rounded-full " +
                (t.type === "success" ? "bg-long" : "bg-short")
              }
            />
            <span className="leading-snug text-ink/90">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Cerrar notificación"
              className="ml-auto text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Acceso al sistema de toasts. Fuera del provider es un no-op seguro. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { notify: () => {}, success: () => {}, error: () => {} };
  }
  return ctx;
}
