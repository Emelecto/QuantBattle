"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DASHBOARD_NAV, Icon } from "./Sidebar";

const ITEMS = [
  { href: "/app", label: "Inicio", icon: "home" },
  { href: "/app/tournaments", label: "Torneos", icon: "trophy" },
  { href: "/app#historial-ml", label: "Envíos", icon: "strategies" },
  { href: "/app/academia", label: "Academia", icon: "book" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [pathname]);
  const active = (href: string) => href.includes("#") ? pathname === "/app" && hash === "#historial-ml" : href === "/app" ? pathname === "/app" && hash !== "#historial-ml" : pathname.startsWith(href);

  const showBackArrow = pathname !== "/app";

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      router.push("/app");
    }
  }, [router]);

  return (
    <nav className="qb-dash-bottomnav" aria-label="Navegación móvil" onKeyDown={(e) => { if (e.key === "Escape") setMenuOpen(false); }}>
      {menuOpen && (
        <div id="mobile-more" className="qb-mobile-more">
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
          className="qb-back-nav-button"
          onClick={handleBack}
          title="Volver atrás"
          aria-label="Volver atrás"
        >
          <Icon name="arrow-left" size={18} /><span className="qb-mobile-nav-label">Volver</span>
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
              <Icon name={item.icon} size={18} /><span className="qb-mobile-nav-label">{item.label}</span>
        </Link>
      ))}
      <button type="button" className="qb-back-nav-button" aria-label={menuOpen ? "Cerrar menú" : "Más secciones"} aria-expanded={menuOpen} aria-controls="mobile-more" onClick={() => setMenuOpen((open) => !open)}><Icon name="menu" /><span className="qb-mobile-nav-label">Más</span></button>
    </nav>
  );
}
