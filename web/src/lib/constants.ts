// Constantes de la economía QP.

export const QP_PRICES = [
  { amount: 100, usd: 10, label: "Plan Plus" },
  { amount: 300, usd: 25, label: "Plan Pro", popular: true },
  { amount: 1000, usd: 75, label: "Plan Legend", bonus: "+50%" },
] as const;

export const TIER = {
  free: { label: "Free", color: "--qb-muted", minQp: 0 },
  plus: { label: "Plus", color: "--qb-accent", minQp: 100 },
  pro: { label: "Pro", color: "--qb-long", minQp: 300 },
  legend: { label: "Legend", color: "--qb-accent", minQp: 1000 },
} as const;

export const BADGES = {
  first_strategy: { name: "Primera estrategia", icon: "📈" },
  tournament_winner: { name: "Campeón", icon: "🏆" },
  tournament_podium: { name: "Podio", icon: "🥉" },
  streak_5: { name: "Racha x5", icon: "🔥" },
  sharpe_1_5: { name: "Sharpe > 1.5", icon: "⭐" },
  deflated_sharpe_1: { name: "Deflated > 1", icon: "💎" },
  maxdd_10: { name: "MaxDD < 10%", icon: "🛡️" },
  trader_100: { name: "100 operaciones", icon: "📊" },
} as const;

export const QP_EARNING = {
  copy_income: 10,
  tournament_first: 200,
  tournament_second: 100,
  tournament_third: 50,
  contribution: 20,
  referral: 30,
} as const;

export const FALLBACK_AVATAR =
  "https://api.dicebear.com/7.x/identicon/svg?seed=QuantBattle";

export const SPONSOR_PLACEHOLDER = [
  {
    id: "alpaca",
    name: "Alpaca",
    slug: "alpaca",
    logo_url: "/logos/alpaca.svg",
    website: "https://alpaca.markets",
    prize_type: "account",
    prize_desc: "Cuenta de paper trading con $10,000",
    prize_value_usd: 10000,
  },
  {
    id: "tradingview",
    name: "TradingView",
    slug: "tradingview",
    logo_url: "/logos/tradingview.svg",
    website: "https://tradingview.com",
    prize_type: "subscription",
    prize_desc: "1 año de plan Premium",
    prize_value_usd: 400,
  },
  {
    id: "datacamp",
    name: "DataCamp",
    slug: "datacamp",
    logo_url: "/logos/datacamp.svg",
    website: "https://datacamp.com",
    prize_type: "course",
    prize_desc: "Curso de trading algorítmico",
    prize_value_usd: 100,
  },
];
