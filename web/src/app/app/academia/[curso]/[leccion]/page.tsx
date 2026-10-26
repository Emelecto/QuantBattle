import Link from "next/link";
import { notFound } from "next/navigation";
import { LESSONS, getCourse, getLesson, getLessonHtml, getLessonQuiz, getLessonToc, EXAM_PASS_RATE } from "@/lib/academia/registry";
import { AcademiaQuizPanel } from "@/components/academia/AcademiaQuizPanel";
import { AcademiaVisuals } from "@/components/academia/AcademiaVisuals";
import "../../academia.css";

export function generateStaticParams() {
  return LESSONS.filter((l) => !l.draft).map((l) => ({
    curso: l.curso,
    leccion: String(l.leccion),
  }));
}

// Lector de la lección: MDX (sin frontmatter) → HTML con SVG inline
// intacto + panel del quiz (N preguntas; N/N en lecciones, ≥70% en el examen).
export default async function AcademiaLessonPage({
  params,
}: {
  params: Promise<{ curso: string; leccion: string }>;
}) {
  const { curso, leccion } = await params;
  const lesson = getLesson(curso, Number(leccion));
  if (!lesson || lesson.draft) notFound();

  const [html, quiz] = await Promise.all([
    getLessonHtml(lesson.id),
    Promise.resolve(getLessonQuiz(lesson.id)),
  ]);
  if (html == null) notFound();

  // El título de la lección ya aparece en el encabezado del lector.
  const articleHtml = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");
  const toc = getLessonToc(articleHtml);
  const prev = getLesson(curso, lesson.leccion - 1);
  const next = getLesson(curso, lesson.leccion + 1);
  const total = LESSONS.filter((l) => l.curso === curso).length;

  return (
    <div className="academia-scope">
      <div>
        <Link href={`/app/academia/${curso}`} className="academia-back">
          ← {getCourse(curso).titulo}
        </Link>
        <header className="academia-hero">
          <span className="academia-kicker">
            {lesson.tipo === "exam"
              ? `Examen final · ~${lesson.duracion_video_min} min · +${lesson.xp} XP`
              : `Lección ${lesson.leccion} de ${total} · ~${lesson.duracion_video_min} min · +${lesson.xp} XP`}
          </span>
          <h1>{lesson.titulo}</h1>
        </header>

        {toc.length > 0 && (
          <details className="academia-toc-mobile">
            <summary>En esta lección</summary>
            <ol>
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`}>{t.title}</a>
                </li>
              ))}
            </ol>
          </details>
        )}

        <div className="academia-reader-grid">
          <article className="academia-article" dangerouslySetInnerHTML={{ __html: articleHtml }} />
          {toc.length > 0 && (
            <aside className="academia-toc">
              <div className="academia-toc-title">En esta lección</div>
              <ol>
                {toc.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`}>{t.title}</a>
                  </li>
                ))}
              </ol>
            </aside>
          )}
        </div>

        <AcademiaVisuals lessonId={lesson.id} />

        <div className="academia-quiz exercise">
          {quiz ? (
            <AcademiaQuizPanel lessonId={lesson.id} questions={quiz.questions} qp={lesson.qp} umbral={lesson.tipo === "exam" ? EXAM_PASS_RATE : 1} />
          ) : (
            <p className="quiz-explain">Quiz no disponible para esta lección todavía.</p>
          )}
        </div>

        <nav className="academia-reader-nav">
          {prev ? (
            <Link
              className="academia-btn academia-btn-secondary"
              href={`/app/academia/${curso}/${prev.leccion}`}
            >
              ← L{prev.leccion}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              className="academia-btn academia-btn-primary"
              href={`/app/academia/${curso}/${next.leccion}`}
            >
              Siguiente: L{next.leccion} →
            </Link>
          ) : (
            <Link className="academia-btn academia-btn-primary" href={`/app/academia/${curso}`}>
              Volver al índice 🏁
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
