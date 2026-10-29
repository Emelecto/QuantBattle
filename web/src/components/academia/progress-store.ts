"use client";

import { useEffect, useMemo } from "react";
import { notifyStorageChange, useStorageValue } from "@/hooks/useStorageValue";

// Progreso local de Academia (multi-curso C1–C6). Clave propia, separada del
// progreso heredado de la Ruta Aprendiz. La sincronización con Supabase
// (completed_lessons) se intenta en el panel del quiz; si la columna aún
// no existe, el curso sigue funcionando con localStorage.

export interface AcademiaProgressState {
  completed: string[]; // ids de lección con quiz superado, p. ej. "c1-l1" ("c6-examen" con ≥70%)
  perfect: string[]; // ids con N/N en lecciones (C1 otorgó 1 QP, C2–C6 otorgan 2 QP) o examen aprobado
}

const STORAGE_KEY = "quantbattle.academia.v1";
const LEGACY_STORAGE_KEY = "quantlab.academia.v1";

export function useAcademiaProgress(): AcademiaProgressState {
  const raw = useStorageValue(STORAGE_KEY);
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== null) return;
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy === null) return;
      localStorage.setItem(STORAGE_KEY, legacy);
      notifyStorageChange(STORAGE_KEY);
    } catch {
      /* storage may be disabled by the browser */
    }
  }, []);
  return useMemo(() => {
    try {
      const parsed = JSON.parse(raw || "{}") as Partial<AcademiaProgressState>;
      return {
        completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id): id is string => typeof id === "string") : [],
        perfect: Array.isArray(parsed.perfect) ? parsed.perfect.filter((id): id is string => typeof id === "string") : [],
      };
    } catch { return { completed: [], perfect: [] }; }
  }, [raw]);
}

export function loadAcademiaProgress(): AcademiaProgressState {
  if (typeof window === "undefined") return { completed: [], perfect: [] };
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw !== null) {
        localStorage.setItem(STORAGE_KEY, raw);
        notifyStorageChange(STORAGE_KEY);
      }
    }
    if (!raw) return { completed: [], perfect: [] };
    const parsed = JSON.parse(raw) as Partial<AcademiaProgressState>;
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      perfect: Array.isArray(parsed.perfect) ? parsed.perfect : [],
    };
  } catch {
    return { completed: [], perfect: [] };
  }
}

function saveAcademiaProgress(state: AcademiaProgressState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    notifyStorageChange(STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
}

export function markLessonComplete(lessonId: string, perfect: boolean): AcademiaProgressState {
  const current = loadAcademiaProgress();
  const completed = current.completed.includes(lessonId)
    ? current.completed
    : [...current.completed, lessonId];
  const perfectIds =
    perfect && !current.perfect.includes(lessonId)
      ? [...current.perfect, lessonId]
      : current.perfect;
  const next = { completed, perfect: perfectIds };
  saveAcademiaProgress(next);
  return next;
}
