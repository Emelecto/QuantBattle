-- QuantBattle migración 0023: bucket privado para submissions de torneos.
-- Uso: Emilio la aplica MANUALMENTE en el SQL editor de Supabase.
-- Solo el dueño lee sus archivos (prefijo de name = auth.uid());
-- solo service_role escribe (el worker sube con la service key).

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

drop policy if exists "submissions read own" on storage.objects;
create policy "submissions read own" on storage.objects
  for select using (
    bucket_id = 'submissions'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "submissions write service" on storage.objects;
create policy "submissions write service" on storage.objects
  for insert with check (
    bucket_id = 'submissions'
    and auth.role() = 'service_role'
  );
