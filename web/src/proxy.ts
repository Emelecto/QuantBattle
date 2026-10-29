import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Verificación y refresco de sesión al entrar al dashboard protegido.
 *
 * NOTA Next 16: el convenio `middleware.ts` está DEPRECADO y se renombró a
 * `proxy.ts` (v16.0.0). La lógica es idéntica; solo cambia el nombre del
 * archivo y de la función exportada. Mantenerlo como `middleware.ts` compila,
 * pero emite un warning de deprecación en cada build.
 *
 * Al entrar a /app, `supabase.auth.getUser()` valida el token y, si hace falta,
 * lo renueva usando el refresh token. Las rutas públicas como /login no
 * dependen de una llamada de red a Supabase para poder cargar.
 *
 * Las cookies nuevas se escriben en la respuesta mediante `setAll`, de modo
 * que el navegador y los Server Components ven una sesión fresca.
 *
 * Protege todo el dashboard /app en el servidor y mantiene la comprobación de
 * rol para /app/admin. La interfaz nunca se sirve a visitantes anónimos.
 */

// IDs de usuarios admin (puedes agregar más)
const ADMIN_USER_IDS = ["2ca7b197-86f5-4605-9789-266bf8a0df01"];

export async function proxy(request: NextRequest) {
  // 1) Pinneo de dominio canónico: redirige al host de NEXT_PUBLIC_SITE_URL
  // cuando el host entrante difiera (excepto localhost / 127.0.0.1).
  const canonicalRaw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  // El preview debe poder revisarse en su propio host; sus metadatos siguen
  // apuntando al dominio canónico de producción.
  if (canonicalRaw && process.env.VERCEL_ENV !== "preview") {
    try {
      const canonicalHost = new URL(canonicalRaw).host.toLowerCase();
      const incomingHost = request.headers.get("host")?.toLowerCase() ?? "";
      const isLocal =
        incomingHost.startsWith("localhost") ||
        incomingHost.startsWith("127.0.0.1");
      if (incomingHost && !isLocal && incomingHost !== canonicalHost) {
        const canonicalUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, canonicalRaw);
        return NextResponse.redirect(canonicalUrl, 308);
      }
    } catch {
      // NEXT_PUBLIC_SITE_URL malformada: no bloquear el request.
    }
  }

  const { pathname } = request.nextUrl;
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  let supabaseResponse = NextResponse.next({ request });

  // No bloquear landing, login ni endpoints públicos esperando una respuesta
  // de Supabase. La autenticación de servidor solo es necesaria para /app.
  if (!isAppRoute) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin credenciales no es posible verificar la sesión. El dashboard debe
  // fallar cerrado; las rutas públicas siguen funcionando.
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 1) Cookies visibles para el resto del pipeline de este request.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        // 2) Recreamos la respuesta con el request ya actualizado…
        const refreshedResponse = NextResponse.next({ request });

        // 3) …y devolvemos las cookies al navegador (Set-Cookie).
        cookiesToSet.forEach(({ name, value, options }) => {
          refreshedResponse.cookies.set(name, value, options);
        });
        // `supabaseResponse` is replaced after Supabase rotates the cookie.
        supabaseResponse = refreshedResponse;
      },
    },
  });

  // IMPORTANTE: no quitar ni mover. Este await es el que dispara el refresh.
  const { data: { user } } = await supabase.auth.getUser();

  // Bloqueo de servidor para todas las páginas del dashboard. No dependemos
  // de que React hidrate ni de que una página individual recuerde AuthGuard.
  if (isAppRoute && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Proteger ruta /app/admin: solo admins
  if (pathname === "/app/admin" || pathname.startsWith("/app/admin/")) {
    if (!user || !ADMIN_USER_IDS.includes(user.id)) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  /**
   * Corre en todo salvo estáticos, imágenes optimizadas y assets, para no
   * gastar invocaciones ni bloquear CSS/JS. Cubre /app/*, /login, /register
   * y /auth/*.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff|woff2|ttf)$).*)",
  ],
};
