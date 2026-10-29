"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  listNotifications,
  unreadCount,
  markNotificationsRead,
  type Notification,
} from "@/lib/notifications";

/**
 * Popover de notificaciones para el sidebar.
 * Solo visible cuando hay alertas pendientes.
 * Anclado sobre su ícono, con tarjeta redondeada, badge de categoría,
 * botón de cerrar, título, descripción corta y CTA opcional.
 */
export function NotificationPopover({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => Promise.all([listNotifications(true, 5), unreadCount()])
    .then(([notifs, count]) => { setNotifications(notifs); setUnread(count); })
    .catch((e: unknown) => { void e; }), []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [open]);

  const markAllRead = useCallback(async () => {
    setLoading(true);
    try {
      await markNotificationsRead();
      setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const markOneRead = useCallback(async (id: string) => {
    try {
      await markNotificationsRead([id]);
      setNotifications((n) =>
        n.map((x) => (x.id === id ? { ...x, is_read: true } : x)),
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }, []);

  // Badge de categoría por tipo
  const categoryBadge = (type: string): { label: string; tone: string } => {
    const map: Record<string, { label: string; tone: string }> = {
      submission_scored: { label: "Resultado", tone: "accent" },
      tournament_closed: { label: "Torneo", tone: "short" },
      tournament_opened: { label: "Nuevo", tone: "long" },
      badge_earned: { label: "Logro", tone: "accent" },
      referral_joined: { label: "Referido", tone: "long" },
      qp_received: { label: "QP", tone: "accent" },
      strategy_replicated: { label: "Copia", tone: "long" },
    };
    return map[type] ?? { label: "Aviso", tone: "muted" };
  };

  const toneClass = (tone: string) =>
    tone === "accent"
      ? "bg-accent/15 text-accent"
      : tone === "long"
        ? "bg-long/15 text-long"
        : tone === "short"
          ? "bg-short/15 text-short"
          : "bg-surface text-muted";

  // No mostrar ítem fijo si no hay alertas
  if (unread === 0 && !open) return null;

  return (
    <div ref={containerRef} className="relative">
      {/* Ícono trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="qb-nav-item w-full"
        title="Notificaciones"
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        aria-expanded={open}
        aria-controls="dashboard-notifications"
      >
        <span className="ic">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </span>
        <span className="qb-nav-label">{!collapsed && "Notificaciones"}</span>
        {unread > 0 && (
          <span className="qb-notif-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div id="dashboard-notifications" className="qb-notif-popover">
          {/* Header */}
          <div className="qb-notif-popover-header">
            <span className="qb-notif-popover-title">Notificaciones</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={loading}
                  className="qb-notif-mark-all"
                >
                  Leer todas
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="qb-notif-close"
                aria-label="Cerrar notificaciones"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="qb-notif-popover-body">
            {notifications.length === 0 ? (
              <div className="qb-notif-empty">No hay alertas pendientes</div>
            ) : (
              notifications.map((n) => {
                const badge = categoryBadge(n.type);
                const content = (
                  <div className={`qb-notif-item${n.is_read ? " read" : ""}`}>
                    <div className="qb-notif-item-top">
                      <span
                        className={`qb-notif-badge-cat ${toneClass(badge.tone)}`}
                      >
                        {badge.label}
                      </span>
                      <span className="qb-notif-time">
                        {new Date(n.created_at).toLocaleString("es", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <p className="qb-notif-item-title">{n.title}</p>
                    <p className="qb-notif-item-body">{n.body}</p>
                    {n.link && (
                      <span className="qb-notif-item-cta">Ver más →</span>
                    )}
                  </div>
                );

                if (n.link) {
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => {
                        markOneRead(n.id);
                        setOpen(false);
                      }}
                      className="qb-notif-item-link"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markOneRead(n.id)}
                    className="qb-notif-item-btn"
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
