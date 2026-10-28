"use client";

import { Fragment, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

/**
 * Protege rutas del lado del cliente: si no hay sesión (y ya terminó de
 * cargar), redirige a /login. Mientras carga, muestra un placeholder.
 *
 * Uso: export default function MiPagina() { return <AuthGuard>...</AuthGuard> }
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg text-muted">
          Cargando…
        </div>
      );
    }

  return <Fragment key={user.id}>{children}</Fragment>;
}
