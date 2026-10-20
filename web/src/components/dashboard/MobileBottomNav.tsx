"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { DASHBOARD_NAV, Icon } from "./Sidebar";

const ITEMS = [
  { href: "/app", label: "Inicio", icon: "home" },
  { href: "/app/tournaments", label: "Competencias", icon: "trophy" },
  { href: "/app/academia", label: "Academia", icon: "book" },
  { href: "/app/profile", label: "Perfil", icon: "user" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = (href: string) => href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  const showBackArrow = pathname !== "/app";

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign("/app");
    }
  }, []);

  return (
    <nav className="ql-dash-bottomnav" aria-label="Navegación móvil" onKeyDown={(e) => { if (e.key === "Escape") setMenuOpen(false); }}>
      {menuOpen && (
        <div id="mobile-more" className="ql-mobile-more">
          {[...DASHBOARD_NAV, { href: "/app/profile/settings", label: "Configuración", icon: "settings" }, { href: "/app/rankings", label: "Rankings", icon: "trophy" }].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={active(item.href) ? "page" : undefined}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
      {showBackArrow && (
        <button
          type="button"
          className="ql-back-nav-button"
          onClick={handleBack}
          title="Volver atrás"
          aria-label="Volver atrás"
        >
          <Icon name="arrow-left" size={18} />
        </button>
      )}
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={active(item.href) ? "on" : ""}
          aria-label={item.label}
          aria-current={active(item.href) ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Icon name={item.icon} size={18} />
        </Link>
      ))}
      <button type="button" className="ql-back-nav-button" aria-label={menuOpen ? "Cerrar menú" : "Más secciones"} aria-expanded={menuOpen} aria-controls="mobile-more" onClick={() => setMenuOpen((open) => !open)}><Icon name="menu" /></button>
    </nav>
  );
}
