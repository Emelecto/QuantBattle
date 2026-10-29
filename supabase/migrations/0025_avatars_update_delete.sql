-- QuantBattle migración 0025: update/delete propios en el bucket de avatares.
-- Uso: Emilio la aplica MANUALMENTE en el SQL editor de Supabase.
-- Solo el dueño de la carpeta (user_id) puede actualizar o borrar sus archivos.

drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar delete own" on storage.objects;
create policy "avatar delete own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
