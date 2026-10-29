"use client";

import { Badge } from "@/components/ui/Badge";

export type SignalAction = "LONG" | "SHORT" | "CLOSE";

export interface Signal {
  id: string;
  strategy_id: string;
  strategy_title: string;
  symbol: string;
  action: SignalAction;
  price: number;
  timestamp: string;
  confidence?: number;
}

const actionConfig: Record<SignalAction, { label: string; tone: "long" | "short" | "neutral" }> = {
  LONG: { label: "LONG", tone: "long" },
  SHORT: { label: "SHORT", tone: "short" },
  CLOSE: { label: "CERRAR", tone: "neutral" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

export function SignalsFeed({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return (
      <div className="qb-glass qb-elev-1 rounded-xl px-6 py-10 text-center">
        <p className="text-sm text-muted">Sin señals recientes</p>
        <p className="mt-1 text-[12px] text-muted">
          Las señales aparecerán aquí cuando la estrategia las genere.
        </p>
      </div>
    );
  }

  return (
    <div className="qb-glass qb-elev-1 rounded-xl overflow-hidden">
      <div className="border-b border-line px-5 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Señales recientes</h3>
        <span className="metric text-[11px] text-muted">{signals.length} señales</span>
      </div>
      <ul className="divide-y divide-line max-h-[400px] overflow-y-auto">
        {signals.map((s) => {
          const cfg = actionConfig[s.action];
          return (
            <li key={s.id} className="qb-row flex items-center gap-3 px-5 py-3">
              <Badge tone={cfg.tone} mono className="shrink-0 w-14 justify-center">
                {cfg.label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink truncate">
                  {s.strategy_title}
                </p>
                <p className="metric text-[11px] text-muted">
                  {s.symbol} · ${s.price.toLocaleString()}
                </p>
              </div>
              {s.confidence != null && (
                <div className="text-right shrink-0">
                  <p className="metric text-[10px] uppercase tracking-wider text-muted">
                    Conf.
                  </p>
                  <p className="metric text-[12px] text-ink">
                    {(s.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              <span className="metric text-[11px] text-muted shrink-0 w-12 text-right">
                {timeAgo(s.timestamp)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}