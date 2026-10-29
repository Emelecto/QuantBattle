-- QuantBattle migración 0024: crédito atómico de QuantPoints.
-- Uso: Emilio la aplica MANUALMENTE en el SQL editor de Supabase.
-- Actualiza balance + lifetime_earned/spent según el signo y registra en el ledger.

create or replace function public.credit_qp(
  p_user uuid,
  p_amount int,
  p_type text,
  p_ref_id uuid,
  p_memo text
) returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  update public.tokens
  set balance = balance + p_amount,
      lifetime_earned = lifetime_earned + greatest(p_amount, 0),
      lifetime_spent = lifetime_spent + greatest(-p_amount, 0),
      updated_at = now()
  where user_id = p_user;

  insert into public.token_ledger (user_id, amount, type, ref_id, memo)
  values (p_user, p_amount, p_type, p_ref_id, p_memo);
end;
$$;

grant execute on function public.credit_qp(uuid, int, text, uuid, text) to service_role;
