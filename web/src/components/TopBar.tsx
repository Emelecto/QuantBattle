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

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm bg-accent"
          />
          QuantLab
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link href="/docs#evaluacion" className="hidden text-sm text-muted transition-colors hover:text-ink md:inline">
            Investigación
          </Link>
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
                className={buttonClasses("primary", "sm")}
              >
                Acceder
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
              <Link
                href="/login"
                className="text-sm text-muted transition-colors hover:text-ink"
              >
                Iniciar sesión
              </Link>
              <Link href="/register" className={buttonClasses("primary", "sm")}>
                Empieza gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
