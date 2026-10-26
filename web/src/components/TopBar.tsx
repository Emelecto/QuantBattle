"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  // Si ya estamos en el dashboard, no hace falta el botón Acceder.
  const inApp = pathname?.startsWith("/app");
  const isLanding = pathname === "/";

  return (
    <header className={`ql-public-header sticky top-0 z-50 border-b border-line bg-bg${isLanding ? " ql-public-header--landing" : ""}`}>
      <div className="ql-public-header-inner mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link
          href="/"
          className="ql-public-brand flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
        >
          <span aria-hidden className="ql-public-mark">Q</span>
          QuantLab
          {isLanding && <span className="ql-public-brand-origin">Semillero DeepFin<br />Universidad EIA</span>}
        </Link>

        <div className="ql-public-nav ml-auto flex items-center gap-3">
          {isLanding && <Link href="/app/tournaments" className="ql-public-nav-secondary hidden md:inline">Torneos</Link>}
          <Link href="/docs#evaluacion" className="ql-public-nav-secondary hidden text-sm text-muted transition-colors hover:text-ink md:inline">{isLanding ? "Metodología" : "Investigación"}</Link>
          {isLanding && <a href="/research/judge-pilot.json" className="ql-public-nav-secondary hidden md:inline">Evidencia</a>}
          {user && inApp ? (
            <button
              onClick={handleSignOut}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Cerrar sesión
            </button>
          ) : user ? (
            <>
              <Link
                href="/app"
                className={isLanding ? "ql-public-nav-cta" : buttonClasses("primary", "sm")}
              >
                {isLanding ? "Entrar a la plataforma ↗" : "Acceder"}
              </Link>
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              {!isLanding && <Link href="/login" className="text-sm text-muted transition-colors hover:text-ink">Iniciar sesión</Link>}
              <Link href={isLanding ? "/app/tournaments" : "/register"} className={isLanding ? "ql-public-nav-cta" : buttonClasses("primary", "sm")}>
                {isLanding ? "Entrar a la plataforma ↗" : "Empieza gratis"}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
