/**
 * Helper de Stripe para QuantBattle.
 *
 * - `getStripe()` devuelve la instancia de Stripe o null si no hay key configurada.
 * - `PLANS` define los planes de suscripción (QP, precio en USD, intervalo).
 *
 * NOTA: Este helper usa el SDK server-side de Stripe (`stripe`), no el de cliente.
 * Las sesiones de checkout se crean siempre en el servidor.
 */

import Stripe from "stripe";

/* ------------------------------------------------------------------ */
/* Planes                                                              */
/* ------------------------------------------------------------------ */

export type PlanId = "plus" | "pro" | "legend";

export interface Plan {
  id: PlanId;
  label: string;
  amount: number; // QP
  unit_amount: number; // centavos de USD
  interval: "month";
  popular?: boolean;
  bonus?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  plus: {
    id: "plus",
    label: "Plan Plus",
    amount: 100,
    unit_amount: 1000, // $10.00
    interval: "month",
  },
  pro: {
    id: "pro",
    label: "Plan Pro",
    amount: 300,
    unit_amount: 2500, // $25.00
    interval: "month",
    popular: true,
  },
  legend: {
    id: "legend",
    label: "Plan Legend",
    amount: 1000,
    unit_amount: 7500, // $75.00
    interval: "month",
    bonus: "+50%",
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/* ------------------------------------------------------------------ */
/* Instancia Stripe                                                    */
/* ------------------------------------------------------------------ */

let _stripe: Stripe | null | undefined;

/**
 * Devuelve la instancia de Stripe o null si STRIPE_SECRET_KEY no está configurada.
 * La instancia se cachea para no crear una nueva en cada request.
 */
export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    _stripe = null;
    return null;
  }

  _stripe = new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
  });

  return _stripe;
}

/**
 * Indica si Stripe está configurado (hay secret key).
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}