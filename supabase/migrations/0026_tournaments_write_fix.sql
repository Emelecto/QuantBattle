-- QuantBattle migración 0026: restringir escritura de torneos a su creador.
-- Uso: Emilio la aplica MANUALMENTE en el SQL editor de Supabase.

drop policy if exists "tournaments write" on public.tournaments;

drop policy if exists "tournaments write own" on public.tournaments;
create policy "tournaments write own" on public.tournaments
  for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);
