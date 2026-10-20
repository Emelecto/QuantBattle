/**
 * API Route: POST /api/stripe/checkout
 *
 * Crea una sesión de Stripe Checkout para comprar QP (QuantPoints).
 *
 * Body: { plan: 'plus' | 'pro' | 'legend' }
 * Response: { url: string } | { error: string } | { message: string }
 *
 * Si STRIPE_SECRET_KEY no está configurada, devuelve 200 con un mensaje
 * "Stripe no configurado" para no romper la UX.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStripe, PLANS, type PlanId } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    if (process.env.ENABLE_BILLING !== "true") {
      return NextResponse.json({ error: "El prototipo de investigación no tiene pagos habilitados." }, { status: 503 });
    }
    const stripe = getStripe();

    // Stripe no configurado → respuesta amigable (no error 500)
    if (!stripe) {
      return NextResponse.json(
        { message: "Stripe no configurado" },
        { status: 200 },
      );
    }

    // 1. Obtener usuario autenticado
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 },
      );
    }

    // 2. Parsear y validar body
    let body: { plan?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body inválido" },
        { status: 400 },
      );
    }

    const planId = body.plan as PlanId | undefined;
    if (!planId || !PLANS[planId]) {
      return NextResponse.json(
        { error: "Plan inválido" },
        { status: 400 },
      );
    }

    const plan = PLANS[planId];

    // 3. Obtener URL base: NEXT_PUBLIC_SITE_URL > VERCEL_URL > localhost
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
    const vercel = process.env.VERCEL_URL?.trim();
    const baseUrl = explicit
      ? explicit
      : vercel
        ? `https://${vercel}`
        : "http://localhost:3000";

    // 4. Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `QuantLab ${plan.label}`,
              description: `${plan.amount} QuantPoints (QP) por mes`,
              metadata: {
                qp_amount: String(plan.amount),
                plan: planId,
              },
            },
            unit_amount: plan.unit_amount,
            recurring: {
              interval: plan.interval,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/app/wallet?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app/wallet?status=cancel`,
      metadata: {
        user_id: user.id,
        plan: planId,
        qp_amount: String(plan.amount),
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan: planId,
          qp_amount: String(plan.amount),
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "No se pudo crear la sesión de pago" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/checkout] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
