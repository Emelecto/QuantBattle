import Link from "next/link";

/**
 * /legal — Hub de documentos legales de QuantBattle.
 */

const DOCUMENTS = [
  {
    href: "/legal/terms",
    title: "Términos de Servicio",
    desc: "Naturaleza del servicio, QP como puntos virtuales sin valor monetario, cuentas y claves API, contenido de la comunidad y limitación de responsabilidad.",
  },
  {
    href: "/legal/privacy",
    title: "Política de Privacidad",
    desc: "Qué datos recogemos, cookies de sesión, proveedores involucrados y cómo solicitar la eliminación de tu cuenta.",
  },
  {
    href: "/disclaimer",
    title: "Disclaimer",
    desc: "QuantBattle es una herramienta de investigación, no asesoría financiera. El desempeño pasado no garantiza resultados futuros.",
  },
];

export const metadata = {
  title: "Legales — QuantBattle",
};

export default function LegalPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Legales
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
        Documentos que regulan el uso de QuantBattle. Usar el servicio implica
        aceptar los Términos de Servicio y la Política de Privacidad.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {DOCUMENTS.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="qb-glass qb-elev-1 group rounded-xl px-5 py-4 transition-colors hover:border-accent"
          >
            <span className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-ink">
                {doc.title}
              </span>
              <span
                aria-hidden
                className="metric text-[12px] text-muted transition-colors group-hover:text-accent"
              >
                →
              </span>
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-muted">
              {doc.desc}
            </span>
          </Link>
        ))}
      </div>

      <p className="metric mt-12 text-[11px] text-muted">
        Esto no es asesoría legal profesional.
      </p>
    </section>
  );
}
