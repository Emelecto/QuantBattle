import { cn } from "@/lib/cn";
import Link from "next/link";
import "./auth-shell.css";

/** Clases compartidas para inputs de formularios. */
export const inputClasses = cn(
  "ql-input h-11 w-full rounded-md px-3 text-base",
  "outline-none",
);

export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Card centrada para /login y /register. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="ql-auth-page">
      <div className="ql-auth-layout">
        <section className="ql-auth-card" aria-labelledby="auth-title">
          <span className="ql-auth-kicker">TU ESPACIO DE INVESTIGACIÓN</span>
          <h1 id="auth-title" className="text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="ql-auth-subtitle mt-3 text-base leading-relaxed text-muted">
            {subtitle}
          </p>
          <div className="ql-auth-form mt-6">{children}</div>
          <p className="ql-auth-footer text-sm text-muted">{footer}</p>
        </section>
        <aside className="ql-auth-aside" aria-label="Cómo funciona QuantLab">
          <span className="ql-auth-aside-kicker">QUANTLAB / DEEPFIN</span>
          <h2>De los datos a una predicción verificable.</h2>
          <p>Explora una ronda, entrena con datos versionados y registra tus predicciones. La evaluación se publica después del cierre.</p>
          <ol>
            <li><span>01</span> Descarga los datos</li>
            <li><span>02</span> Construye tu modelo</li>
            <li><span>03</span> Valida tu envío</li>
            <li><span>04</span> Revisa el resultado</li>
          </ol>
          <Link href="/docs#evaluacion">Conoce el método y el piloto técnico ↗</Link>
          <small>Piloto sintético. No representa rentabilidad ni asesoría financiera.</small>
        </aside>
      </div>
    </div>
  );
}
