import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCourses,
  getCourse,
  getCourseLessons,
  getLessonQuiz,
  totalQP,
  requiredScore,
  PERFECT_BONUS_QP,
} from "@/lib/academia/registry";
import { AcademiaProgress } from "@/components/academia/AcademiaProgress";
import "../academia.css";

export function generateStaticParams() {
  return getCourses().map((c) => ({ curso: c.slug }));
}

// Índice de lecciones del curso (genérico por slug; C1 intacto).
export default async function AcademiaCoursePage({
  params,
}: {
  params: Promise<{ curso: string }>;
}) {
  const { curso } = await params;
  if (!getCourses().some((c) => c.slug === curso)) notFound();
  const course = getCourse(curso);
  const lessons = getCourseLessons(curso);
  const qp = totalQP(curso);
  const lessonCount = lessons.filter((l) => l.tipo !== "exam").length;
  const examCount = lessons.length - lessonCount;

  return (
    <div className="academia-scope">
      <div>
        <Link href="/app/academia" className="academia-back">
          ← Academia
        </Link>
        <header className="academia-hero">
          <span className="academia-kicker">
            {course.nivel} · {lessonCount} lecciones{examCount > 0 ? ` + ${examCount} examen` : ""}
          </span>
          <h1>{course.titulo}</h1>
          <p>
            {lessonCount} lecciones{examCount > 0 ? ` + ${examCount} examen` : ""} · +{qp} QP + {PERFECT_BONUS_QP} bonus todo-perfecto
          </p>
          <AcademiaProgress totalLessons={lessons.length} lessonIds={lessons.map((lesson) => lesson.id)} />
        </header>

        <section>
          <h2 className="academia-section-title">Lecciones</h2>
          <div className="academia-lesson-list">
            {lessons.map((l) => {
              const quizCount = getLessonQuiz(l.id)?.questions.length ?? 0;
              const isExam = l.tipo === "exam";
              return (
                <Link
                  key={l.id}
                  href={`/app/academia/${curso}/${l.leccion}`}
                  className="academia-lesson-row"
                >
                  <div className="academia-lesson-num">{isExam ? "Ex" : `L${l.leccion}`}</div>
                  <div className="academia-lesson-body">
                    <span className="academia-kicker">
                      {isExam ? "Examen final" : `Lección ${l.leccion}`} · ~{l.duracion_video_min} min
                    </span>
                    <h3>{l.titulo}</h3>
                    <span className="academia-lesson-meta academia-lesson-xp">
                      +{l.xp} XP · +{l.qp} QP
                      {quizCount > 0
                        ? ` (quiz ${requiredScore(quizCount, l.tipo)}/${quizCount})`
                        : " (quiz pendiente)"}
                    </span>
                  </div>
                  <span className="academia-lesson-arrow">→</span>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="academia-cta-row">
          <Link className="academia-btn academia-btn-primary" href={`/app/academia/${curso}/1`}>
            Empieza la Lección 1
          </Link>
        </div>
      </div>
    </div>
  );
}
