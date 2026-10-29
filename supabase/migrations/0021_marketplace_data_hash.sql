-- QuantBattle migración 0021: hash de integridad para estrategias del marketplace.
-- Uso: Emilio la aplica MANUALMENTE en el SQL editor de Supabase.
-- Verificación: select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='marketplace_strategies'
--   and column_name='data_hash';

alter table public.marketplace_strategies
  add column if not exists data_hash text;
