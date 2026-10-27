"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBalance } from "@/lib/tokens";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationPopover } from "@/components/dashboard/NotificationPopover";
import "./dashboard.css";
import "./dashboard-light.css";

const ADMIN_USER_IDS = ["2ca7b197-86f5-4605-9789-266bf8a0df01"];

export const DASHBOARD_NAV = [
  { href: "/app", label: "Inicio", icon: "home" },
  { href: "/app/tournaments", label: "Torneos ML", icon: "trophy" },
  { href: "/app/library", label: "Datasets", icon: "database" },
  { href: "/app#historial-ml", label: "Mis envíos", icon: "strategies" },
  { href: "/app/academia", label: "Academia", icon: "book" },
  { href: "/app/learn", label: "Aprender practicando", icon: "book" },
  { href: "/app/strategies", label: "Mis proyectos ML", icon: "strategies" },
  { href: "/app/marketplace", label: "Biblioteca ML", icon: "store" },
  { href: "/app/api-keys", label: "API y MCP", icon: "key" },
] as const;

const COLLAPSE_KEY = "ql:sidebar-collapsed";
const WIDTH_KEY = "ql:sidebar-width";
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const COLLAPSED_WIDTH = 72;

const ADMIN_NAV = [
  { href: "/app/admin", label: "Admin", icon: "shield" },
  { href: "/app/admin/notebooks", label: "Revisar notebooks", icon: "book" },
] as const;

const SOCIAL_LINKS = [
  { href: "https://github.com/Emelecto/QuantLab", label: "Repositorio de QuantLab", icon: "code" },
] as const;

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "user":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0116 0v2" /></svg>;
    case "arrow-left":
      return <svg {...common}><path d="M19 12H5m7-7l-7 7 7 7" /></svg>;
    case "arrow-right":
      return <svg {...common}><path d="M5 12h14m-7-7l7 7-7 7" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 3v12m-5-5l5 5 5-5M5 16v5h14v-5" /></svg>;
    case "menu":
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case "code":
      return <svg {...common}><path d="M8 5l-6 7 6 7m8-14l6 7-6 7m-3-17l-2 20" /></svg>;
    case "home":
      return (
        <svg {...common}>
          <path d="M3 12l9-9 9 9" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
          <path d="M17 4h3v2a3 3 0 01-3 3M7 4H4v2a3 3 0 003 3" />
        </svg>
      );
    case "store":
      return (
        <svg {...common}>
          <path d="M3 9l1-5h16l1 5" />
          <path d="M4 9v11h16V9" />
          <path d="M8 14h8" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 4h7a4 4 0 014 4v12H8a4 4 0 01-4-4V4z" />
          <path d="M15 4h5v12h-5" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
          <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="8" cy="14" r="3" />
          <path d="M11 13l9-9" />
          <path d="M17 7l3 3" />
          <path d="M14 10l3 3" />
        </svg>
      );
    case "strategies":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M9 12h6M9 16h6M9 8h1" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "chevrons-left":
      return (
        <svg {...common}>
          <path d="M11 17l-5-5 5-5" />
          <path d="M18 17l-5-5 5-5" />
        </svg>
      );
    case "chevrons-right":
      return (
        <svg {...common}>
          <path d="M13 17l5-5-5-5" />
          <path d="M6 17l5-5-5-5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82.33l.06.06a2 2 0 0 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.33z" />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="var(--ql-bg)" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.17V11.7a4.83 4.83 0 01-3.77-1.78V6.69h3.77z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(248);
  const [dragging, setDragging] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const [user, setUser] = useState<{
    id: string;
    email?: string;
    user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
  } | null>(null);
  const [profile, setProfile] = useState<{
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const widthRef = useRef(width);

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash);
    const frame = window.requestAnimationFrame(syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("hashchange", syncHash); };
  }, [pathname]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const c = localStorage.getItem(COLLAPSE_KEY);
        if (c === "1") setCollapsed(true);
        const w = localStorage.getItem(WIDTH_KEY);
        if (w) {
          const parsed = parseInt(w, 10);
          if (parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
            widthRef.current = parsed;
            setWidth(parsed);
          }
        }
      } catch {
        /* ignore */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          setUser(data.user);
          if (ADMIN_USER_IDS.includes(data.user.id)) {
            setIsAdmin(true);
          }
        }
      } catch {
        /* ignore */
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const loadProfile = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (active && data) setProfile(data);
      } catch {
        /* ignore */
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (collapsed) return;
    let active = true;
    (async () => {
      try {
        const b = await getBalance();
        if (active) setBalance(b.balance);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [collapsed]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + delta),
        );
        widthRef.current = next;
        setWidth(next);
        if (sidebarRef.current) {
          sidebarRef.current.style.width = `${next}px`;
          sidebarRef.current.style.flexBasis = `${next}px`;
        }
      };
      const onMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        try {
          localStorage.setItem(WIDTH_KEY, String(widthRef.current));
        } catch {
          /* ignore */
        }
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, collapsed],
  );

  const isActive = (href: string) =>
    href === "/app#historial-ml" ? pathname === "/app" && activeHash === "#historial-ml"
      : href === "/app" ? pathname === "/app" && activeHash !== "#historial-ml"
        : pathname.startsWith(href);

  const displayName =
    profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Trader";

  const avatarSrc = profile?.avatar_url || user?.user_metadata?.avatar_url;

  return (
    <aside
      ref={sidebarRef}
      className={`ql-sidebar${collapsed ? " collapsed" : ""}`}
      style={{
        width: collapsed ? COLLAPSED_WIDTH : width,
        flexBasis: collapsed ? COLLAPSED_WIDTH : width,
      }}
    >
      {/* Glow vertical sutil en borde izquierdo */}
      <div className="ql-sidebar-glow" />

      <Link href="/app" className="ql-side-brand" title="QuantLab · Inicio">
        <span aria-hidden="true">Q</span>{!collapsed && <strong>QuantLab</strong>}
      </Link>

      {/* Top row: Avatar + Usuario (izquierda) | QP (derecha) */}
      <div className="ql-sidebar-top">
        <Link href="/app/profile" className="ql-user-block" title="Perfil">
          <Avatar src={avatarSrc} name={displayName} size={collapsed ? 32 : 36} />
          {!collapsed && (
            <div className="ql-user-info">
              <span className="ql-user-name">{displayName}</span>
              <span className="ql-user-username">@{profile?.username || displayName.toLowerCase()}</span>
            </div>
          )}
        </Link>

        {!collapsed && (
          <Link
            href="/app/wallet"
            data-tour="qp-badge"
            className="ql-qp-button"
            title="Mi wallet de QuantPoints"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M6 3h12l3 9-9 9-9-9 3-9Z" />
              <path d="M9 8h6" />
            </svg>
            <span className="ql-qp-amount">
              {balance != null ? `${balance.toLocaleString()} QP` : "QP …"}
            </span>
          </Link>
        )}
      </div>

      {/* Nav items */}
      <nav className="ql-nav" aria-label="Navegación principal">
        {DASHBOARD_NAV.map((item, index) => (
          <div key={item.href} className="ql-nav-wrap">
          {!collapsed && (index === 0 || index === 5) && <span className="ql-nav-section">{index === 0 ? "Mi espacio" : "Explorar"}</span>}
          <Link
            key={item.href}
            href={item.href}
            data-tour={
              item.href === "/app/strategies"
                ? "nueva-estrategia"
                : item.href === "/app/tournaments"
                  ? "tournaments-link"
                  : undefined
            }
            className={`ql-nav-item${isActive(item.href) ? " active" : ""}`}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            aria-current={isActive(item.href) ? "page" : undefined}
          >
            <span className="ic">
              <Icon name={item.icon} />
            </span>
            {!collapsed && <span className="ql-nav-label">{item.label}</span>}
          </Link>
          </div>
        ))}

        {/* Admin nav */}
        {isAdmin &&
          ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`ql-nav-item${isActive(item.href) ? " active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="ic">
                <Icon name={item.icon} />
              </span>
              {!collapsed && <span className="ql-nav-label">{item.label}</span>}
            </Link>
          ))}

      </nav>

      <div className="ql-sidebar-spacer" />

      {/* Bottom section */}
      <div className="ql-sidebar-bottom">
        {/* Notificaciones (popover condicional) */}
        <NotificationPopover collapsed={collapsed} />

        {/* Configuración */}
        <Link href="/app/profile/settings" className="ql-nav-item" title="Configuración">
          <span className="ic">
            <Icon name="settings" />
          </span>
          {!collapsed && <span className="ql-nav-label">Configuración</span>}
        </Link>

        {/* Redes sociales */}
        <div className={`ql-social-row${collapsed ? " collapsed" : ""}`}>
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="ql-social-icon"
              title={s.label}
              aria-label={s.label}
            >
              <Icon name={s.icon} size={16} />
            </a>
          ))}
        </div>
      </div>

      {/* Collapse toggle — siempre visible */}
      <button
        className="ql-collapse-toggle"
        type="button"
        onClick={toggle}
        title={collapsed ? "Expandir" : "Colapsar"}
        aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
      >
        <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} size={16} />
      </button>

      {/* Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          className="ql-sidebar-resize"
          style={{
            position: "absolute" as const,
            top: 0,
            right: 0,
            width: 8,
            height: "100%",
            cursor: "col-resize",
            zIndex: 40,
            background: dragging ? "var(--ql-accent)" : "var(--ql-line)",
            opacity: dragging ? 0.7 : 0.25,
            transition: "opacity 0.15s",
          }}
        />
      )}
    </aside>
  );
}
