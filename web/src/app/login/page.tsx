"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { buttonClasses } from "@/components/ui/Button";
import { AuthShell, Field, inputClasses } from "@/components/ui/Form";
import { PasswordField } from "@/components/ui/PasswordField";

/** Mensaje único para el reset: no revela si el email existe o no. */
const RESET_SENT_MESSAGE =
  "Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => searchParams.get("error_description") || searchParams.get("error"));
  const [loading, setLoading] = useState(false);

  // Recuperar contraseña
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.code === "invalid_credentials" || error.message.toLowerCase().includes("invalid")) {
          setError("Credenciales inválidas. Revisa tu correo y contraseña.");
        } else if (error.message.toLowerCase().includes("email not confirmed")) {
          setError("Tu correo aún no está confirmado. Revisa el enlace que te enviamos.");
        } else {
          setError(error.message);
        }
        setLoading(false);
        return;
      }

      // Si el email no está confirmado, Supabase puede no devolver sesión.
      if (!data.session) {
        setError("Tu correo aún no está confirmado. Revisa el enlace que te enviamos.");
        setLoading(false);
        return;
      }

      const requestedNext = searchParams.get("next");
      const next = requestedNext?.startsWith("/oauth/consent?")
        ? requestedNext
        : "/app";
      router.push(next);
      router.refresh();
    } catch {
      setError("Ocurrió un error inesperado. Inténtalo de nuevo.");
      setLoading(false);
    }
  }

  /** Abre/cierra el panel de recuperación, arrastrando el email ya escrito. */
  function toggleReset() {
    setShowReset((open) => {
      const next = !open;
      if (next) {
        setResetEmail((current) => current || email);
        setResetInfo(null);
        setResetError(null);
      }
      return next;
    });
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setResetInfo(null);
    setResetError(null);
    setResetLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/app/profile/settings#security");
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo: redirectTo.toString() });

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          error.code === "over_email_send_rate_limit" ||
          msg.includes("rate limit") ||
          msg.includes("security purposes")
        ) {
          setResetError(
            "Demasiados intentos. Espera unos minutos antes de pedir otro enlace.",
          );
        } else {
          // Cualquier otro error (email inexistente incluido) se responde igual
          // para no filtrar qué cuentas existen.
          setResetInfo(RESET_SENT_MESSAGE);
        }
        setResetLoading(false);
        return;
      }

      setResetInfo(RESET_SENT_MESSAGE);
      setResetLoading(false);
    } catch {
      setResetError(
        "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
      );
      setResetLoading(false);
    }
  }

  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Consulta tus experimentos y participa en los torneos de predicción ML."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link
            href={searchParams.get("next")?.startsWith("/oauth/consent?")
              ? `/register?next=${encodeURIComponent(searchParams.get("next")!)}`
              : "/register"}
            className="font-medium text-cyan transition-colors hover:text-ink"
          >
            Crear cuenta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field id="email" label="Correo electrónico">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={inputClasses}
          />
        </Field>

        <PasswordField
          id="password"
          label="Contraseña"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {error && (
          <p
            role="alert"
            className="rounded-md border border-short/30 bg-short/10 px-3 py-2 text-[13px] text-short"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={buttonClasses("primary", "md", "mt-1 w-full")}
        >
          {loading ? "Entrando…" : "Iniciar sesión"}
        </button>
      </form>

      <div className="mt-4 border-t border-line pt-4">
        <button
          type="button"
          onClick={toggleReset}
          aria-expanded={showReset}
          aria-controls="reset-panel"
          className="text-[13px] font-medium text-muted transition-colors hover:text-cyan"
        >
          ¿Olvidaste tu contraseña?
        </button>

        {showReset && (
          <form
            id="reset-panel"
            onSubmit={handleReset}
            className="mt-3 flex flex-col gap-3"
          >
            <p className="text-[12px] leading-relaxed text-muted">
              Escribe tu correo y te enviamos un enlace para crear una nueva
              contraseña.
            </p>

            <Field id="resetEmail" label="Correo electrónico">
              <input
                id="resetEmail"
                name="resetEmail"
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="tu@correo.com"
                className={inputClasses}
              />
            </Field>

            {resetError && (
              <p
                role="alert"
                className="rounded-md border border-short/30 bg-short/10 px-3 py-2 text-[13px] text-short"
              >
                {resetError}
              </p>
            )}

            {resetInfo && (
              <p
                role="status"
                className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-[13px] text-ink"
              >
                {resetInfo}
              </p>
            )}

            <button
              type="submit"
              disabled={resetLoading}
              className={buttonClasses("secondary", "md", "w-full")}
            >
              {resetLoading ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted">Cargando…</div>}>
      <LoginInner />
    </Suspense>
  );
}
