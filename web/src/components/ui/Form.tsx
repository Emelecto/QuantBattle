import { cn } from "@/lib/cn";

/** Clases compartidas para inputs de formularios en tema dark. */
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
    <div className="flex flex-1 items-start justify-center px-5 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="ql-glass rounded-xl p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            {subtitle}
          </p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
