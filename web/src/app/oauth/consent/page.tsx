"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { buttonClasses } from "@/components/ui/Button";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

function ConsentContent() {
  const router = useRouter();
  const search = useSearchParams();
  const authorizationId = search.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authorizationId) {
        setError("El enlace de autorización no contiene una solicitud válida.");
        return;
      }
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (detailsError) throw detailsError;
        if (!cancelled) {
          if ("authorization_id" in data) setDetails(data);
          else window.location.replace(data.redirect_url);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo cargar la solicitud de acceso.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [authorizationId, router]);

  async function decide(action: "approve" | "deny") {
    if (!authorizationId || busy) return;
    setBusy(action);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const result = action === "approve"
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (result.error) throw result.error;
      window.location.assign(result.data.redirect_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar tu decisión.");
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
      <section className="qb-glass qb-elev-1 w-full max-w-lg rounded-2xl border border-line p-7 sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-tight text-ink">QuantBattle</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Conexión con agente de IA</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Autoriza el acceso a tu cuenta</h1>
        {!details && !error && <p className="mt-4 text-sm text-muted">Cargando solicitud…</p>}
        {details && (
          <>
            <div className="mt-6 rounded-xl border border-line bg-surface-solid p-4">
              <p className="text-xs text-muted">Aplicación que solicita acceso</p>
              <p className="mt-1 text-lg font-semibold text-ink">{details.client.name || "Agente MCP"}</p>
              {details.client.uri && <p className="mt-1 break-all text-xs text-muted">{details.client.uri}</p>}
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium text-ink">Con este permiso podrá:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
                <li>Consultar torneos, rondas, datasets y resultados públicos.</li>
                <li>Enviar predicciones a los torneos en los que participas.</li>
                <li>Consultar tus propios comprobantes de envío.</li>
              </ul>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-muted">
              La autorización se puede revocar desde la configuración de tu cuenta. El agente no recibirá tu contraseña ni una clave API permanente.
            </p>
            <p className="mt-3 text-xs text-muted">Cuenta: {details.user.email}</p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => void decide("deny")} disabled={busy !== null} className={buttonClasses("secondary", "md")}>
                {busy === "deny" ? "Rechazando…" : "Rechazar"}
              </button>
              <button type="button" onClick={() => void decide("approve")} disabled={busy !== null} className={buttonClasses("primary", "md")}>
                {busy === "approve" ? "Conectando…" : "Autorizar QuantBattle"}
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="mt-5 rounded-lg border border-short/30 bg-short/10 p-4 text-sm text-short" role="alert">
            <p>{error}</p>
            <p className="mt-2 text-xs">Revisa que hayas iniciado sesión y que OAuth esté activado para QuantBattle.</p>
          </div>
        )}
      </section>
    </main>
  );
}

export default function OAuthConsentPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-muted">Cargando…</main>}><ConsentContent /></Suspense>;
}
