"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { QuantBattleLogo } from "./QuantBattleLogo";

const labels: Record<string, string> = {
  "/app": "Inicio",
  "/app/tournaments": "Torneos ML",
  "/app/library": "Datasets",
  "/app/academia": "Academia",
  "/app/strategies": "Mis proyectos ML",
  "/app/marketplace": "Biblioteca ML",
  "/app/learn": "Aprender practicando",
  "/app/backtesting": "Backtesting clásico",
  "/app/api-keys": "API y MCP",
  "/app/profile": "Perfil",
};

export function DashboardTopbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const section = labels[pathname] ?? labels[Object.keys(labels).find((path) => path !== "/app" && pathname.startsWith(path)) ?? ""] ?? "Investigación";
  const initial = (user?.user_metadata?.full_name || user?.email || "Q").trim().slice(0, 1).toUpperCase();

  return <header className="qb-light-topbar">
    <div className="qb-light-topbar-brand"><Link href="/app" aria-label="QuantBattle, inicio"><QuantBattleLogo className="qb-light-topbar-mark" /></Link><strong>QuantBattle</strong></div>
    <div className="qb-light-topbar-breadcrumb"><span>Espacio de investigación</span><span aria-hidden="true">/</span><strong>{section}</strong></div>
    <div className="qb-light-topbar-actions"><Link href="/docs#evaluacion">Ayuda y método</Link><Link href="/app/profile" className="qb-light-topbar-avatar" aria-label="Abrir perfil">{initial}</Link></div>
  </header>;
}
