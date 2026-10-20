/** Shared data: safe to import from server routes and browser components. */
export const ANALYTICS_EVENTS = [
  "onboarding_started", "tour_started", "tour_finished", "tour_skipped",
  "first_backtest", "activation_step",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const FUNNEL_STEPS: ReadonlyArray<{ event: AnalyticsEventName; label: string }> = [
  { event: "onboarding_started", label: "Inicio de onboarding" },
  { event: "tour_started", label: "Tour iniciado" },
  { event: "tour_finished", label: "Tour completado" },
  { event: "first_backtest", label: "Primer backtest (aha-moment)" },
  { event: "activation_step", label: "Paso de activación" },
];
