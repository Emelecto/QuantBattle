"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { buttonClasses } from "@/components/ui/Button";
import { AuthShell, Field, inputClasses } from "@/components/ui/Form";
import { PasswordField } from "@/components/ui/PasswordField";
import { trackReferral } from "@/lib/referrals";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const referralCode = searchParams.get("ref");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanUser = username.trim();
    if (cleanUser.length < 3 || cleanUser.length > 20) {
      setError("El nombre de usuario debe tener entre 3 y 20 caracteres.");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
      setError("Solo letras, números, guiones y puntos en el nombre de usuario.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { username: cleanUser, display_name: cleanUser },
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (error.code === "user_already_exists" || msg.includes("already registered")) {
          setError("El email ya está registrado. Inicia sesión en su lugar.");
        } else if (error.code === "weak_password" || msg.includes("password")) {
          setError("Contraseña muy corta (mín. 8 caracteres)");
        } else {
          setError(error.message);
        }
        setLoading(false);
        return;
      }

      // Guardamos el username en la tabla profiles (el trigger ya creó la fila).
      if (data.user) {
        const { error: profErr } = await supabase
          .from("profiles")
          .upsert(
            { id: data.user.id, username: cleanUser, display_name: cleanUser },
            { onConflict: "id" },
          );
        if (profErr) {
          // No bloquea el registro; el usuario puede editarlo luego.
          console.warn("No se pudo guardar el username:", profErr.message);
        }
      }

      // Sesión presente => confirmación de email desactivada: entramos directo.
      if (data.session) {
        // Trackear referido si existe
        if (referralCode) {
          try {
            await trackReferral(referralCode);
          } catch (e) {
            console.warn("No se pudo trackear referido:", e);
          }
        }
        router.push("/app");
        router.refresh();
        return;
      }

      // Sin sesión => Supabase espera verificación por email.
      setInfo(
        "¡Cuenta creada! Te enviamos un enlace de confirmación a tu correo. " +
          "Ábrelo para activar tu cuenta y entra automáticamente.",
      );
      setLoading(false);
    } catch {
      setError("Ocurrió un error inesperado. Inténtalo de nuevo.");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setInfo("Enlace reenviado. Revisa tu correo (también la bandeja de spam).");
    } catch {
      setError("No pudimos reenviar el enlace. Revisa tu conexión e inténtalo en unos minutos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Entrena modelos y valida tus predicciones en rondas de investigación."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-cyan transition-colors hover:text-ink"
          >
            Iniciar sesión
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

        <Field id="username" label="Nombre de usuario">
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="tu_alias"
            className={inputClasses}
          />
        </Field>

        <PasswordField
          id="password"
          label="Contraseña"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          placeholder="Mínimo 8 caracteres"
        />

        <PasswordField
          id="confirmPassword"
          label="Confirmar contraseña"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={8}
          placeholder="Repite tu contraseña"
        />

        {error && (
          <p
            role="alert"
            className="rounded-md border border-short/30 bg-short/10 px-3 py-2 text-[13px] text-short"
          >
            {error}
          </p>
        )}

        {info && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-md border border-long/30 bg-long/10 px-3 py-2 text-[13px] text-long"
          >
            <span>{info}</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="self-start text-[12px] font-medium text-long underline-offset-2 hover:underline"
            >
              Reenviar enlace
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={buttonClasses("primary", "md", "mt-1 w-full")}
        >
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        <p className="text-[12px] leading-relaxed text-muted">
          Al crear una cuenta aceptas que QuantLab es una herramienta de
          investigación y no asesoría financiera.
        </p>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-muted text-center py-10">Cargando...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
