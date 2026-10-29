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

const FORMATOS = ["Post", "Hilo", "Encuesta", "Cita+comentario"];

const HOOKS = [
  "Un backtest sin OOS es una opinión con gráfico.",
  "Sharpe 2.5 en muestra y 0.3 fuera de muestra: archívala.",
  "Si calibraste con todos los datos, no validaste nada.",
  "Walk-forward de 5 pliegues o no cuenta como evidencia.",
  "El ensemble venció a casi todos sus miembros en BTC. Diversidad, no magia.",
  "Mira el drawdown antes que el retorno. Siempre.",
  "Los QP son virtuales, el ranking es real. Así competimos.",
  "Sobreajustar es memorizar ruido y llamarlo edge.",
  "Correlación 0.04 en mercados puede ser señal. Contexto importa.",
  "Predicción direccional ≠ señal de entrada. Límites claros.",
];

// Calendario de 30 días para X. Tono honesto y breve, QP siempre virtuales,
// sin promesas de retorno. Solo admin.
const SEEDS: SeedIdea[] = [
  { text: "Día 1 · Hilo: qué es el walk-forward en 5 posts, con ejemplo BTC", pilar: "Walk-forward OOS", formato: "Hilo" },
  { text: "Día 2 · Post: el 90% de los backtests están sobreajustados, cómo detectarlo", pilar: "Overfitting", formato: "Post" },
  { text: "Día 3 · Post: Sharpe in-sample vs OOS, la regla de integridad", pilar: "Métricas", formato: "Post" },
  { text: "Día 4 · Hilo: el ensemble comunitario que leyó BTC en agosto 2026", pilar: "Ensemble", formato: "Hilo" },
  { text: "Día 5 · Encuesta: ¿reservas datos OOS o calibras con todo?", pilar: "Walk-forward OOS", formato: "Encuesta" },
  { text: "Día 6 · Post: drawdown, la métrica que mide cuánto duele", pilar: "Métricas", formato: "Post" },
  { text: "Día 7 · Hilo: Deflated Sharpe, por qué contar tus intentos", pilar: "Métricas", formato: "Hilo" },
  { text: "Día 8 · Post: datos Binance + yfinance, fuente siempre visible", pilar: "Motor y datos", formato: "Post" },
  { text: "Día 9 · Hilo: entrena en 70%, mide en 30% que nunca vio", pilar: "Walk-forward OOS", formato: "Hilo" },
  { text: "Día 10 · Post: torneos semanales con QP virtuales, cómo entrar", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 11 · Cita+comentario: correlación 0.042 en BTC, por qué cuenta", pilar: "Ensemble", formato: "Cita+comentario" },
  { text: "Día 12 · Post: integridad alta = conserva 70% en OOS", pilar: "Métricas", formato: "Post" },
  { text: "Día 13 · Encuesta: ¿qué es el data snooping?", pilar: "Overfitting", formato: "Encuesta" },
  { text: "Día 14 · Post: del editor web al backtest sin instalar nada", pilar: "Motor y datos", formato: "Post" },
  { text: "Día 15 · Hilo: diversidad del ensemble y por qué cancela errores", pilar: "Ensemble", formato: "Hilo" },
  { text: "Día 16 · Post: marketplace, publica y cobra QP virtuales por semana", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 17 · Post: el test va después del train, nunca al revés", pilar: "Walk-forward OOS", formato: "Post" },
  { text: "Día 18 · Hilo: 3 señales de que memorizaste el pasado", pilar: "Overfitting", formato: "Hilo" },
  { text: "Día 19 · Post: detrás de cámaras, backtest BTCUSDT 1d en vivo", pilar: "Motor y datos", formato: "Post" },
  { text: "Día 20 · Cita+comentario: consistencia 0.72 del ensemble", pilar: "Ensemble", formato: "Cita+comentario" },
  { text: "Día 21 · Post: capital, comisión y folds cambian todo", pilar: "Motor y datos", formato: "Post" },
  { text: "Día 22 · Post: ranking y reputación envío a envío", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 23 · Hilo: integridad baja no sirve aunque brille en papel", pilar: "Métricas", formato: "Hilo" },
  { text: "Día 24 · Post: límites honestos, direccional no es entrada", pilar: "Ensemble", formato: "Post" },
  { text: "Día 25 · Encuesta: ¿qué activo backtesteas esta semana?", pilar: "Torneos y QP", formato: "Encuesta" },
  { text: "Día 26 · Post: API con claves qbt_ y servidor MCP para IA", pilar: "Motor y datos", formato: "Post" },
  { text: "Día 27 · Hilo: pasado ≠ futuro, pero el walk-forward evita mentirte", pilar: "Overfitting", formato: "Hilo" },
  { text: "Día 28 · Post: guía del torneo, deadline y evaluación automática", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 29 · Post: lee la curva de equity OOS en 20 segundos", pilar: "Métricas", formato: "Post" },
  { text: "Día 30 · Hilo: resumen del mes, las 5 ideas que más debate dieron", pilar: "Walk-forward OOS", formato: "Hilo" },
];

export default function AdminXPage() {
  return (
    <ContentCabin
      network="X"
      tagline="Cabina de X (solo admin): posts directos, hilos que enseñan y encuestas que conversan. Tono honesto, datos reales y QP siempre virtuales."
      storageKey="ql:admin:x-ideas"
      pilares={PILARES}
      formatos={FORMATOS}
      seeds={SEEDS}
      hooks={HOOKS}
    />
  );
}
