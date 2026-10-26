"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadAcademiaProgress } from "./progress-store";
import "./academia-progress.css";

// Nodo del journey del hub (datos estáticos desde el servidor; el estado
// hecha/en curso/pendiente se resuelve en cliente desde progress-store).
export interface AcademiaJourneyLesson {
  id: string;
  n: number;
  titulo: string;
  minutos: number;
  qp: number;
  href: string;
}

// Barra de progreso de Academia (lee el store local; multi-curso).
// Si recibe `journey`, además renderiza el journey con estado real.
export function AcademiaProgress({
  totalLessons = 7,
  journey,
}: {
  totalLessons?: number;
  journey?: AcademiaJourneyLesson[];
}) {
  const [done, setDone] = useState(0);
  const [perfect, setPerfect] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = loadAcademiaProgress();
      setDone(saved.completed.length);
      setPerfect(saved.perfect.length);
      setCompletedIds(saved.completed);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const pct = totalLessons > 0 ? Math.round((done / totalLessons) * 100) : 0;
  const currentId = journey?.find((l) => !completedIds.includes(l.id))?.id;

  return (
    <div className="academia-progress">
      <div className="academia-progress-top">
        <span className="academia-progress-label">Tu progreso</span>
        <span className="academia-progress-text">
          {done}/{totalLessons} lecciones · {perfect} QP ganados
        </span>
      </div>
      <div
        className="academia-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso en Academia"
      >
        <div className="academia-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {journey && (
        <ol className="academia-journey">
          {journey.map((l) => {
            const isDone = completedIds.includes(l.id);
            const isCurrent = !isDone && l.id === currentId;
            const state = isDone ? "hecha" : isCurrent ? "encurso" : "pendiente";
            const pill = isDone ? "Completada" : isCurrent ? "En curso" : "Pendiente";
            return (
              <li key={l.id} className="academia-journey-node" data-state={state}>
                <span className="academia-journey-dot" aria-hidden="true">
                  {isDone ? "✓" : l.n}
                </span>
                <Link className="academia-journey-card" href={l.href}>
                  <span className="academia-journey-body">
                    <span className="academia-journey-kicker">
                      Lección {l.n} · ~{l.minutos} min · +{l.qp} QP
                    </span>
                    <p className="academia-journey-title">{l.titulo}</p>
                  </span>
                  <span className="academia-journey-pill">{pill}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
