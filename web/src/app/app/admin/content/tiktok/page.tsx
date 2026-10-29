"use client";

import { ContentCabin, type SeedIdea } from "@/components/growth/ContentCabin";

const PILARES = [
  "Walk-forward OOS",
  "Overfitting",
  "Métricas",
  "Ensemble",
  "Torneos y QP",
  "Motor y datos",
];

const FORMATOS = ["Video corto", "Serie", "Dúo / Stitch", "En vivo"];

const HOOKS = [
  "POV: tu backtest da Sharpe 3 y en OOS se desinfla a 0.3.",
  "Te calibraron con todos los datos y te lo vendieron como edge.",
  "El truco honesto: entrena en el 70%, mide en el 30%.",
  "5 folds walk-forward o no pasó nada. Así se valida.",
  "El ensemble leyó BTC en agosto mejor que casi todos. Sin magia.",
  "Drawdown: cuánto duele antes de rendirte. Míralo primero.",
  "QP virtuales, ranking real. Compite cada semana.",
  "Memorizar el pasado no es predecir. Es overfitting.",
  "0.04 de correlación puede ser edge. En mercados, sí.",
  "Stitch esto con tu equity OOS. La mía también dolió.",
];

const SEEDS: SeedIdea[] = [
  { text: "Día 1 · Video: el 90% de los backtests están sobreajustados, en 45 s", pilar: "Overfitting", formato: "Video corto" },
  { text: "Día 2 · Serie (1/5): qué es el walk-forward, con papel y lápiz", pilar: "Walk-forward OOS", formato: "Serie" },
  { text: "Día 3 · Video: Sharpe 2.5 vs 0.3, la regla de oro de la integridad", pilar: "Métricas", formato: "Video corto" },
  { text: "Día 4 · Video: el ensemble comunitario y el BTC de agosto 2026", pilar: "Ensemble", formato: "Video corto" },
  { text: "Día 5 · Dúo: reacciona a un backtest perfecto y pide su OOS", pilar: "Overfitting", formato: "Dúo / Stitch" },
  { text: "Día 6 · Serie (2/5): folds y ventanas, cómo se mueve el train/test", pilar: "Walk-forward OOS", formato: "Serie" },
  { text: "Día 7 · Video: drawdown explicado con una caída real", pilar: "Métricas", formato: "Video corto" },
  { text: "Día 8 · Video: datos Binance + yfinance, la fuente siempre visible", pilar: "Motor y datos", formato: "Video corto" },
  { text: "Día 9 · En vivo: corro un backtest SMA en BTCUSDT y leo el OOS contigo", pilar: "Motor y datos", formato: "En vivo" },
  { text: "Día 10 · Video: torneos semanales con QP virtuales, cómo participar", pilar: "Torneos y QP", formato: "Video corto" },
  { text: "Día 11 · Serie (3/5): Deflated Sharpe, por qué contar tus intentos", pilar: "Métricas", formato: "Serie" },
  { text: "Día 12 · Video: diversidad del ensemble, XGBoost + LightGBM + redes", pilar: "Ensemble", formato: "Video corto" },
  { text: "Día 13 · Dúo: stitch a mito de trading con datos del blog OOS", pilar: "Overfitting", formato: "Dúo / Stitch" },
  { text: "Día 14 · Video: del editor web al resultado sin instalar nada", pilar: "Motor y datos", formato: "Video corto" },
  { text: "Día 15 · Serie (4/5): integridad alta, conserva el 70% en datos nuevos", pilar: "Métricas", formato: "Serie" },
  { text: "Día 16 · Video: marketplace, publica y cobra QP por semana", pilar: "Torneos y QP", formato: "Video corto" },
  { text: "Día 17 · Video: el test va después del train, siempre", pilar: "Walk-forward OOS", formato: "Video corto" },
  { text: "Día 18 · Serie (5/5): 3 señales de memorización del pasado", pilar: "Overfitting", formato: "Serie" },
  { text: "Día 19 · Video: correlación 0.042 y FNC 0.038, qué significan", pilar: "Ensemble", formato: "Video corto" },
  { text: "Día 20 · En vivo: Q&A, trae tu equity y la leemos sin humo", pilar: "Métricas", formato: "En vivo" },
  { text: "Día 21 · Video: capital, comisión y timeframe cambian el resultado", pilar: "Motor y datos", formato: "Video corto" },
  { text: "Día 22 · Video: ranking y reputación envío a envío", pilar: "Torneos y QP", formato: "Video corto" },
  { text: "Día 23 · Dúo: stitch a gurú de señales, responde con OOS", pilar: "Overfitting", formato: "Dúo / Stitch" },
  { text: "Día 24 · Video: límites honestos, direccional no es señal de entrada", pilar: "Ensemble", formato: "Video corto" },
  { text: "Día 25 · Video: API qbt_ y MCP para tu flujo con IA", pilar: "Motor y datos", formato: "Video corto" },
  { text: "Día 26 · Video: guía del torneo, deadline y evaluación automática", pilar: "Torneos y QP", formato: "Video corto" },
  { text: "Día 27 · Video: leer la curva de equity OOS en 20 segundos", pilar: "Métricas", formato: "Video corto" },
  { text: "Día 28 · En vivo: cerramos el mes, qué aprendió la comunidad", pilar: "Torneos y QP", formato: "En vivo" },
  { text: "Día 29 · Video: pasado ≠ futuro, pero no te mientas", pilar: "Overfitting", formato: "Video corto" },
  { text: "Día 30 · Video: lo mejor del mes y qué sigue", pilar: "Walk-forward OOS", formato: "Video corto" },
];

export default function AdminTikTokPage() {
  return (
    <ContentCabin
      network="TikTok"
      tagline="Cabina de TikTok (solo admin): videos directos, series por partes y dúos que responden con datos. Ritmo rápido, honestidad intacta y QP siempre virtuales."
      storageKey="ql:admin:tiktok-ideas"
      pilares={PILARES}
      formatos={FORMATOS}
      seeds={SEEDS}
      hooks={HOOKS}
    />
  );
}
