import { getCourses, getCourseLessons } from "@/lib/academia/registry";
import type { AcademiaJourneyLesson } from "@/components/academia/AcademiaProgress";
import { AcademiaContinueCta } from "@/components/academia/AcademiaContinueCta";
import { AcademiaCourseCard } from "@/components/academia/AcademiaCourseCard";
import "./academia.css";
import Link from "next/link";

// Hub de Academia: hero compacto + grid de 6 cursos abiertos
// (sin gates ni stats) + CTA continuar (siguiente lección pendiente).
export default function AcademiaPage() {
  const courses = getCourses();
  const lessonsByCourse = courses.map((c) => {
    const lessons = getCourseLessons(c.slug).filter((l) => l.tipo !== "exam");
    return { course: c, lessons };
  });

  const journey: AcademiaJourneyLesson[] = lessonsByCourse.flatMap(({ course, lessons }) =>
    lessons.map((l) => ({
      id: l.id,
      n: l.leccion,
      titulo: `${course.titulo}: ${l.titulo}`,
      minutos: l.duracion_video_min,
      qp: l.qp,
      href: `/app/academia/${course.slug}/${l.leccion}`,
    })),
  );

  return (
    <div className="academia-scope">
      <div>
        <header className="academia-hero">
          <span className="academia-kicker">Academia QuantLab</span>
          <h1>Aprende midiendo</h1>
          <p>Los seis cursos están abiertos. Avanza a tu ritmo, lección a lección.</p>
        </header>
        <div className="academia-cta-row flex flex-wrap gap-4">
          <Link className="text-accent underline underline-offset-4" href="/app/learn/first-tournament">Ruta de primer torneo</Link>
          <Link className="text-accent underline underline-offset-4" href="/app/learn/missions">Misiones de práctica</Link>
          <Link className="text-accent underline underline-offset-4" href="/app/learn/errors">Laboratorio de errores</Link>
          <Link className="text-accent underline underline-offset-4" href="/app/learn/glossary">Glosario visual</Link>
        </div>

        <div className="academia-cta-row">
          <AcademiaContinueCta journey={journey} />
        </div>

        <section>
          <h2 className="academia-section-title">Cursos</h2>
          <div className="academia-course-grid">
            {lessonsByCourse.map(({ course, lessons }, i) => (
              <AcademiaCourseCard
                key={course.slug}
                index={i + 1}
                slug={course.slug}
                titulo={course.titulo}
                nivel={course.nivel}
                lessonCount={lessons.length}
                lessonIds={lessons.map((l) => l.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
