import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Callback de autenticación (PKCE / enlaces de email).
 *
 * Supabase redirige aquí con `?code=...` tras confirmar el correo o iniciar
 * sesión por enlace. Intercambiamos el code por una sesión (cookie HttpOnly)
 * y enviamos al usuario a /app. Si no hay code, dejamos pasar a /app y el
 * AuthGuard decide.
 *
 * Los errores recibidos en la query pasan a /login. Los fragmentos de URL
 * no llegan al servidor. El destino siempre permanece en este mismo sitio.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  let next = "/app";
  if (requestedNext?.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\")) {
    const destination = new URL(requestedNext, origin);
    if (destination.origin === origin) next = destination.pathname + destination.search + destination.hash;
  }

  // Errores que Supabase a veces anexa en el hash (p.ej. otp_expired).
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  if (error) {
    const params = new URLSearchParams({ error, error_description: errorDescription ?? "" });
    return NextResponse.redirect(`${origin}/login?${params.toString()}`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const params = new URLSearchParams({
        error: exchangeError.name,
        error_description: exchangeError.message,
      });
      return NextResponse.redirect(`${origin}/login?${params.toString()}`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
