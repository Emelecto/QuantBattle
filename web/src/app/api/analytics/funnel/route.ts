import { NextResponse } from "next/server";
import { FUNNEL_STEPS } from "@/lib/analytics-events";

/**
 * GET /api/analytics/funnel — definición del funnel básico de activación.
 * El cómputo vive en Plausible (Funnels) con estos pasos en orden;
 * este endpoint documenta el contrato para el dashboard y para QA local.
 */
export async function GET() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim() ?? null;
  return NextResponse.json({
    name: "Activación QuantBattle",
    steps: FUNNEL_STEPS,
    dashboard: domain
      ? `https://plausible.io/${domain}/funnels (pasos: ${FUNNEL_STEPS.map((s: { event: string }) => s.event).join(" → ")})`
      : "Configura NEXT_PUBLIC_PLAUSIBLE_DOMAIN y crea el funnel en Plausible con estos pasos en orden.",
  });
}
