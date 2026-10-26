"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { earnQP } from "@/lib/tokens";
import type { AcademiaQuizQuestion } from "@/lib/academia/registry";
import { loadAcademiaProgress, markLessonComplete } from "./progress-store";
import "./academia-quiz.css";

// Panel del quiz de la lección. Renderiza N preguntas (N varía por
// lección) y otorga lesson.qp QP con N/N en lecciones (1 en C1, 2 en C2–C6)
// o con ≥70% en el examen final (prop `umbral`, 7 QP con 14/20 en C6).
// Acredita vía earnQP con la sesión del navegador y persiste el progreso
// local; además sincroniza completed_lessons (best-effort: si la migración
// aún no está aplicada, no tumba la UI).

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function AcademiaQuizPanel({
  lessonId,
  questions,
  qp = 1,
  umbral = 1,
}: {
  lessonId: string;
  questions: AcademiaQuizQuestion[];
  qp?: number;
  /** Fracción de aciertos para aprobar (1 = N/N; 0.7 = examen final). */
  umbral?: number;
}) {
  const total = questions.length;
  const required = Math.min(total, Math.ceil(total * umbral));
  const isExam = umbral < 1;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [awarded, setAwarded] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [awardSynced, setAwardSynced] = useState(false);
  const awardTried = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAnswers({});
      setRevealed(false);
      setAwarded(loadAcademiaProgress().perfect.includes(lessonId));
      setAwardSynced(false);
      awardTried.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [lessonId]);

  const answeredCount = questions.filter((_, i) => answers[i] != null).length;
  const allAnswered = answeredCount === total;
  const score = questions.filter((q, i) => answers[i] === q.answer).length;
  const passed = revealed && score >= required;
  const isPerfect = revealed && score === total;

  const awardQP = useCallback(async () => {
    if (awardTried.current) return;
    awardTried.current = true;
    setAwarding(true);
    markLessonComplete(lessonId, true);
    setAwarded(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await earnQP(qp, isExam ? "examen_aprobado" : "quiz_perfect", lessonId, isExam ? `Examen ${lessonId} aprobado (${score}/${total})` : `Quiz ${lessonId} perfecto (${total}/${total})`);
        setAwardSynced(true);
        try {
          const { data } = await supabase
            .from("course_progress")
            .select("completed_lessons")
            .eq("user_id", user.id)
            .maybeSingle();
          const prev = (data?.completed_lessons as string[] | null) ?? [];
          if (!prev.includes(lessonId)) {
            await supabase.from("course_progress").upsert(
              { user_id: user.id, completed_lessons: [...prev, lessonId] },
              { onConflict: "user_id" },
            );
          }
        } catch {
          /* columna aún no aplicada: el progreso local ya guardó el avance */
        }
      }
    } catch {
      /* visitante o sin red: el progreso local ya guardó el avance */
    } finally {
      setAwarding(false);
    }
  }, [lessonId, total, qp, isExam, score]);

  function retry() {
    setAnswers({});
    setRevealed(false);
  }

  return (
    <div className="academia-quiz">
      <div className="academia-quiz-head">
        <div>
          <span className="academia-quiz-kicker">
            Quiz · {total} preguntas · necesitas {required}/{total} para {qp} QP
          </span>
          <h2 className="academia-quiz-title">Comprueba lo aprendido</h2>
        </div>
        <span className="academia-quiz-counter">
          {answeredCount}/{total} respondidas
        </span>
      </div>
      <div className="academia-quiz-dots" aria-hidden="true">
        {questions.map((_, i) => (
          <span key={i} className="academia-quiz-dot" data-on={answers[i] != null} />
        ))}
      </div>

      {questions.map((q, i) => (
        <div className="academia-quiz-q" key={i}>
          <p className="academia-quiz-prompt">Pregunta {i + 1} de {total}</p>
          <p className="academia-quiz-question">{q.q}</p>
          <ul className="academia-quiz-opts">
            {q.options.map((opt, o) => {
              const chosen = answers[i] === o;
              const isAns = q.answer === o;
              const state = revealed
                ? isAns
                  ? "correcta"
                  : chosen
                    ? "incorrecta"
                    : "atenuada"
                : chosen
                  ? "elegida"
                  : "pendiente";
              return (
                <li key={o}>
                  <button
                    type="button"
                    className="academia-quiz-opt"
                    data-state={state}
                    aria-pressed={chosen}
                    disabled={revealed}
                    onClick={() => !revealed && setAnswers((a) => ({ ...a, [i]: o }))}
                  >
                    <span className="academia-quiz-letter" aria-hidden="true">
                      {LETTERS[o] ?? o + 1}
                    </span>
                    <span>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {revealed && (
            <p className="academia-quiz-explain">
              <strong>Explicación: </strong>
              {q.explain}
            </p>
          )}
        </div>
      ))}

      <div className="academia-quiz-actions">
        {!revealed && (
          <button
            type="button"
            className="academia-quiz-cta"
            onClick={() => {
              setRevealed(true);
              if (score >= required && !awarded) void awardQP();
            }}
            disabled={!allAnswered}
          >
            Revisar respuestas
          </button>
        )}
        {revealed && !passed && (
          <button type="button" className="academia-quiz-secondary" onClick={retry}>
            Reintentar
          </button>
        )}
        {revealed && (
          <span className="academia-quiz-score">
            Aciertos: {score}/{total}
          </span>
        )}
      </div>

      {passed && (
        <div className="academia-quiz-perfect" role="status">
          <span className="academia-quiz-qpbadge">{awardSynced ? `+${qp} QP` : "✓"}</span>
          <span>
            {awarding
              ? `Acreditando ${qp} QP…`
              : awarded
                ? awardSynced
                  ? isPerfect
                    ? `Quiz perfecto. Se acreditaron ${qp} QP.`
                    : `Examen aprobado (${score}/${total}). Se acreditaron ${qp} QP.`
                  : "Progreso guardado en este navegador. No se pudo confirmar la acreditación de QP."
                : null}
          </span>
        </div>
      )}
      {revealed && !passed && (
        <p className="academia-quiz-retry-note">
          Te faltaron {required - score}. Reintenta: el QP se otorga con {required}/{total} o más.
        </p>
      )}
    </div>
  );
}
