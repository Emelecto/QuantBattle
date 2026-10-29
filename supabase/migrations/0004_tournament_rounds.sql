-- QuantBattle v2 — Rondas de torneo con deadline
-- Idempotente: seguro de reaplicar. Solo AÑADE columnas; no recrea tablas.
--
-- round_number: número de ronda activa del torneo (default 1; los torneos
--   semanales lo incrementan al abrir una nueva ronda).
-- closes_at: cierre de la ronda actual. NULL = sin deadline (la ronda
--   permanece abierta).

alter table public.tournaments add column if not exists round_number integer default 1;
alter table public.tournaments add column if not exists closes_at timestamptz;
