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

const FORMATOS = ["Reel", "Carrusel", "Historia", "Post"];

const HOOKS = [
  "El 90% de los backtests mienten. Así los desenmascaras.",
  "Sharpe 2.5 en papel y 0.3 en OOS: esa estrategia no sirve.",
  "Deja de calibrar con todos los datos. Reserva el 30% para OOS.",
  "5 pliegues walk-forward: la prueba de fuego de cualquier edge.",
  "El ensemble de agosto leyó BTC mejor que casi todos sus miembros.",
  "Drawdown: la única métrica que te dice cuánto duele perder.",
  "QP virtuales, ranking real: así se compite cada semana.",
  "Sobreajustar es memorizar el pasado. Y el mercado no se repite.",
  "Una correlación de 0.04 en mercados sí significa algo. Te explico por qué.",
  "Publica tu estrategia y cobra QP por semana. Sin promesas, con datos.",
];

// Calendario de 30 días. Tono honesto, QP siempre virtuales, sin promesas
// de retorno. Solo admin.
const SEEDS: SeedIdea[] = [
  { text: "Día 1 · Carrusel: 5 pliegues walk-forward explicados con un dibujo por slide", pilar: "Walk-forward OOS", formato: "Carrusel" },
  { text: "Día 2 · Reel: tu backtest perfecto probablemente miente (overfitting en 30 s)", pilar: "Overfitting", formato: "Reel" },
  { text: "Día 3 · Carrusel: Sharpe in-sample 2.5 vs OOS 0.3, la regla de oro", pilar: "Métricas", formato: "Carrusel" },
  { text: "Día 4 · Post: qué es el ensemble comunitario que leyó BTC en agosto 2026", pilar: "Ensemble", formato: "Post" },
  { text: "Día 5 · Historia: encuesta ¿calibras con todos los datos o reservas OOS?", pilar: "Walk-forward OOS", formato: "Historia" },
  { text: "Día 6 · Reel: drawdown, la métrica que nadie presume pero todos sufren", pilar: "Métricas", formato: "Reel" },
  { text: "Día 7 · Carrusel: Deflated Sharpe, o por qué importa cuántas veces lo intentaste", pilar: "Métricas", formato: "Carrusel" },
  { text: "Día 8 · Reel: datos reales Binance + Bybit + Yahoo, fuente siempre visible", pilar: "Motor y datos", formato: "Reel" },
  { text: "Día 9 · Carrusel: entrena en el 70%, mide en el 30% que nunca vio", pilar: "Walk-forward OOS", formato: "Carrusel" },
  { text: "Día 10 · Post: torneos semanales con QP virtuales, cómo entrar a uno", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 11 · Reel: correlación 0.042 en BTC, por qué en mercados eso cuenta", pilar: "Ensemble", formato: "Reel" },
  { text: "Día 12 · Carrusel: integridad alta = conserva 70% del rendimiento en OOS", pilar: "Métricas", formato: "Carrusel" },
  { text: "Día 13 · Historia: quiz ¿qué es el data snooping?", pilar: "Overfitting", formato: "Historia" },
  { text: "Día 14 · Reel: del editor Monaco al backtest sin instalar nada", pilar: "Motor y datos", formato: "Reel" },
  { text: "Día 15 · Carrusel: diversidad del ensemble (XGBoost, LightGBM, redes) y por qué cancela errores", pilar: "Ensemble", formato: "Carrusel" },
  { text: "Día 16 · Post: marketplace, publica tu estrategia y cobra QP por semana", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 17 · Reel: el test siempre ocurre después del train, nunca al revés", pilar: "Walk-forward OOS", formato: "Reel" },
  { text: "Día 18 · Carrusel: 3 señales de que tu estrategia memorizó el pasado", pilar: "Overfitting", formato: "Carrusel" },
  { text: "Día 19 · Historia: detrás de cámaras, corriendo un backtest de BTCUSDT 1d", pilar: "Motor y datos", formato: "Historia" },
  { text: "Día 20 · Reel: consistencia 0.72 del ensemble, mejor que casi todos los individuos", pilar: "Ensemble", formato: "Reel" },
  { text: "Día 21 · Carrusel: capital, comisión y folds, los parámetros que cambian todo", pilar: "Motor y datos", formato: "Carrusel" },
  { text: "Día 22 · Post: ranking global y reputación, cómo se construyen envío a envío", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 23 · Reel: una estrategia con integridad baja no sirve, aunque brille en papel", pilar: "Métricas", formato: "Reel" },
  { text: "Día 24 · Carrusel: limitaciones honestas, predicción direccional no es señal de entrada", pilar: "Ensemble", formato: "Carrusel" },
  { text: "Día 25 · Historia: pregunta a la comunidad ¿qué activo backtesteas esta semana?", pilar: "Torneos y QP", formato: "Historia" },
  { text: "Día 26 · Reel: API con claves qbt_ y servidor MCP para tu flujo con IA", pilar: "Motor y datos", formato: "Reel" },
  { text: "Día 27 · Carrusel: pasado ≠ futuro, pero el walk-forward evita mentirte", pilar: "Overfitting", formato: "Carrusel" },
  { text: "Día 28 · Post: guía del torneo, rounds con deadline y evaluación automática", pilar: "Torneos y QP", formato: "Post" },
  { text: "Día 29 · Reel: curva de equity OOS, cómo leerla en 20 segundos", pilar: "Métricas", formato: "Reel" },
  { text: "Día 30 · Carrusel: resumen del mes, las 5 ideas que más dieron que hablar", pilar: "Walk-forward OOS", formato: "Carrusel" },
];

export default function AdminInstagramPage() {
  return (
    <ContentCabin
      network="Instagram"
      tagline="Cabina de Instagram (solo admin): carruseles que enseñan, reels que desmontan mitos y historias que conversan. Todo educativo, con datos reales y QP siempre virtuales."
      storageKey="ql:admin:ig-ideas"
      pilares={PILARES}
      formatos={FORMATOS}
      seeds={SEEDS}
      hooks={HOOKS}
    />
  );
}
