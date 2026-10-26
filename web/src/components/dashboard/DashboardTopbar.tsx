"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

const labels: Record<string, string> = {
  "/app": "Inicio",
  "/app/tournaments": "Torneos ML",
  "/app/library": "Datasets",
  "/app/academia": "Academia",
  "/app/strategies": "Estrategias",
  "/app/marketplace": "Marketplace",
  "/app/api-keys": "API Keys",
  "/app/profile": "Perfil",
};

export function DashboardTopbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const section = labels[pathname] ?? labels[Object.keys(labels).find((path) => path !== "/app" && pathname.startsWith(path)) ?? ""] ?? "Investigación";
  const initial = (user?.user_metadata?.full_name || user?.email || "Q").trim().slice(0, 1).toUpperCase();

  return <header className="ql-light-topbar">
    <div className="ql-light-topbar-brand"><Link href="/app" className="ql-light-topbar-mark" aria-label="QuantLab, inicio">Q</Link><strong>QuantLab</strong></div>
    <div className="ql-light-topbar-breadcrumb"><span>Espacio de investigación</span><span aria-hidden="true">/</span><strong>{section}</strong></div>
    <div className="ql-light-topbar-actions"><Link href="/docs#evaluacion">Ayuda y método</Link><Link href="/app/profile" className="ql-light-topbar-avatar" aria-label="Abrir perfil">{initial}</Link></div>
  </header>;
}
