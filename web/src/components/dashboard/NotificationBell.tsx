"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  listNotifications,
  unreadCount,
  markNotificationsRead,
  type Notification,
} from "@/lib/notifications";

const TYPE_ICON: Record<string, string> = {
  submission_scored: "📊",
  tournament_closed: "🏁",
  tournament_opened: "🟢",
  badge_earned: "🏆",
  referral_joined: "👥",
  qp_received: "💰",
  strategy_replicated: "✅",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => Promise.all([listNotifications(true, 10), unreadCount()])
    .then(([notifs, count]) => { setNotifications(notifs); setUnread(count); })
    .catch((e: unknown) => { void e; }), []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresca cada 30s
    return () => clearInterval(interval);
  }, [load]);

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-muted hover:bg-surface hover:text-ink transition-colors"
        aria-label="Notificaciones"
      >
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
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-short px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 qb-glass qb-elev-2 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Notificaciones</h3>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={loading}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                >
                  Marcar todas como leídas
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  No hay notificaciones nuevas
                </div>
              ) : (
                notifications.map((n) => {
                  const content = (
                    <div
                      className={`flex gap-3 px-4 py-3 border-b border-line/50 transition-colors ${
                        n.is_read ? "opacity-60" : "bg-accent/[0.03]"
                      }`}
                    >
                      <span className="text-lg flex-shrink-0">
                        {TYPE_ICON[n.type] ?? "🔔"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-muted line-clamp-2">
                          {n.body}
                        </p>
                        <p className="text-[10px] text-muted mt-1">
                          {new Date(n.created_at).toLocaleString("es", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-accent mt-1.5" />
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
                        className="block hover:bg-surface/50"
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
                      className="w-full text-left hover:bg-surface/50 block"
                    >
                      {content}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
