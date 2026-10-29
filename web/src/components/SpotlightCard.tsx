"use client";

import { useCallback, type ReactNode } from "react";

/**
 * SpotlightCard — card cuyo fondo se ilumina siguiendo el cursor
 * (patrón Linear/Vercel). CSS puro vía variables --spot-x/--spot-y.
 */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div className={`qb-spotlight ${className}`} onMouseMove={onMove}>
      {children}
    </div>
  );
}
