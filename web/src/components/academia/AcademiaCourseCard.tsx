"use client";

import Link from "next/link";
import { useAcademiaProgress } from "./progress-store";

// Card grande del hub: nº de curso, título, nivel, nº de lecciones,
// barra de progreso propia (store local) y CTA de entrada.
// Todos los cursos están abiertos; el QP no bloquea nada.
export function AcademiaCourseCard({
  index,
  slug,
  titulo,
  nivel,
  lessonCount,
  lessonIds,
}: {
  index: number;
  slug: string;
  titulo: string;
  nivel: string;
  lessonCount: number;
  lessonIds: string[];
}) {
  const saved = useAcademiaProgress();
  const done = lessonIds.filter((id) => saved.completed.includes(id)).length;

  const pct = lessonCount > 0 ? Math.round((done / lessonCount) * 100) : 0;

  return (
    <Link href={`/app/academia/${slug}`} className="academia-course-card">
      <div className="academia-course-top">
        <div className="academia-lesson-num">C{index}</div>
        <span className="academia-kicker">
          Curso {index} · {nivel}
        </span>
      </div>
      <h3>{titulo}</h3>
      <span className="academia-course-meta">
        {lessonCount} lecciones · {done}/{lessonCount} completadas
      </span>
      <div
        className="academia-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de ${titulo}`}
      >
        <div className="academia-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="academia-course-cta">Entrar →</span>
    </Link>
  );
}
