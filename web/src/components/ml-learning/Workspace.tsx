"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import "./learning.css";
export function Workspace({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="qb-page ml-workspace">
      <header className="ml-heading">
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      <nav aria-label="Investigación y aprendizaje" className="ml-nav">
        <Link href="/app/strategies">Mis proyectos ML</Link>
        <Link href="/app/marketplace">Biblioteca ML</Link>
        <Link href="/app/learn">Aprender</Link>
        <Link href="/app/learn/glossary">Glosario</Link>
      </nav>
      {children}
    </main>
  );
}
export function Feedback({
  error,
  message,
}: {
  error?: string | null;
  message?: string | null;
}) {
  return (
    <>
      {error && (
        <p className="ml-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="ml-notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
export function messageOf(error: unknown): string {
  if (error instanceof SyntaxError)
    return "No se pudo leer el JSON. Revisa el formato del archivo o de los parámetros y vuelve a intentarlo.";
  if (!(error instanceof Error))
    return "No se pudo completar la acción. Vuelve a intentarlo.";
  const code = (error as Error & { code?: string }).code;
  if (code?.startsWith("WORKER_") || /https?:\/\//.test(error.message)) {
    return "No se pudo conectar con QuantBattle. Espera unos segundos y vuelve a intentarlo.";
  }
  const text = error.message.replace(/^\/ml\/[^:]+:\s*/, "").trim();
  if (/inicia sesi[oó]n|HTTP 401/i.test(text))
    return "Tu sesión no está disponible. Inicia sesión de nuevo para continuar.";
  if (/\[object Object\]/.test(text))
    return "No se aceptaron los datos. Revisa los campos y el formato del archivo y vuelve a intentarlo.";
  if (/se libera toda la semana/.test(text))
    return text + ". Vuelve cuando termine y se verifique el torneo.";
  if (/No tienes un envío/.test(text))
    return text + ". Consulta tus comprobantes y elige otra ronda.";
  return /reintenta|vuelve|consulta|revisa|selecciona|crea |adjunta|declara|envía|inicia/i.test(
    text,
  )
    ? text
    : text + ". Revisa los datos y vuelve a intentarlo.";
}
