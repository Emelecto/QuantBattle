import { NextResponse } from "next/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * POST /api/analytics/event — ingesta mínima privacy-first.
 * - Solo acepta eventos de la allowlist (los 5 del funnel).
 * - No acepta ni guarda PII: props limitadas a primitivos cortos.
 * - En dev hace console.info (observable en terminal de `next dev`).
 * - En prod, si hay PLAUSIBLE_API_TOKEN, reenvía a la Events API de Plausible.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const { event, props } = (body ?? {}) as { event?: unknown; props?: unknown };
  if (typeof event !== "string" || !(ANALYTICS_EVENTS as readonly string[]).includes(event)) {
    return NextResponse.json({ ok: false, error: "unknown_event" }, { status: 400 });
  }

  // Sanitizar props: solo primitivos, claves y strings acotados, sin emails ni ids.
  const clean: Record<string, string | number | boolean> = {};
  if (props && typeof props === "object") {
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9_]{1,32}$/.test(k)) continue;
      if (typeof v === "string" && v.length <= 120 && !v.includes("@")) clean[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") clean[k] = v;
    }
  }

  const token = process.env.PLAUSIBLE_API_TOKEN?.trim();
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  if (token && domain) {
    try {
      const ua = req.headers.get("user-agent") ?? "";
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "";
      await fetch("https://plausible.io/api/event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: event,
          url: `${req.headers.get("referer") ?? `https://${domain}/`}`,
          domain,
          props: clean,
        }),
      }).catch(() => undefined);
      void ua;
      void ip;
    } catch {
      /* noop: analytics nunca rompe el flujo */
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[analytics] ${event}`, Object.keys(clean).length ? clean : "");
  }

  return NextResponse.json({ ok: true });
}
