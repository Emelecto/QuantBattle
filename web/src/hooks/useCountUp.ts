"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anima un número desde su valor anterior hasta `target` con ease-out.
 * Respeta prefers-reduced-motion (devuelve el target sin animar).
 */
export function useCountUp(target: number, duration = 400): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  // Espejo del último valor para el cleanup sin leer estado en el efecto.
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = target;
      const frame = requestAnimationFrame(() => { setValue(target); valueRef.current = target; });
      return () => cancelAnimationFrame(frame);
    }

    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = valueRef.current;
    };
  }, [target, duration]);

  return value;
}
