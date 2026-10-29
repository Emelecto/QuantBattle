-- QuantBattle: índices para rankings temporales (token_ledger)
-- Acelera consultas de QP por rango de fechas en el dashboard.

create index if not exists idx_ledger_user_created_type
  on public.token_ledger(user_id, created_at desc, type);

create index if not exists idx_ledger_created_type_amount
  on public.token_ledger(created_at, type, amount);
