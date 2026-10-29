-- QuantBattle: foto de perfil + username con cooldown de 7 días.
-- Aplicar en el SQL editor (NO ejecuta DDL sobre prod el agente).

-- 1. Columna para rastrear cuándo se cambió el username por última vez.
alter table public.profiles add column if not exists username_updated_at timestamptz;

-- 2. Garantizar unicidad SIEMPRE (aunque haya filas legacy con null).
--    Postgres indexa NULLs por separado, así que esto no choca con filas viejas.
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

-- 3. Trigger: al cambiar username, actualizar username_updated_at y validar cooldown.
create or replace function public.before_profile_update() returns trigger as $$
begin
  -- Si el username cambió
  if new.username is distinct from old.username then
    -- Cooldown de 7 días: solo bloquea si ya se cambió alguna vez.
    if old.username_updated_at is not null
       and old.username_updated_at > now() - interval '7 days' then
      raise exception 'DEBOE: username cooldown activo. Espera hasta %', old.username_updated_at + interval '7 days';
    end if;
    -- Normalizar: recortar y lo que el cliente envíe ya validado.
    new.username = btrim(new.username);
    new.username_updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profile_update on public.profiles;
create trigger trg_profile_update before update on public.profiles
  for each row execute function public.before_profile_update();

-- 4. Bucket público para avatares + política de subida (el dueño sube a su carpeta).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- RLS: cualquier usuario autenticado puede leer (bucket público), pero solo
-- el dueño de la carpeta puede escribir. La carpeta es el user_id.
drop policy if exists "avatar write own" on storage.objects;
create policy "avatar write own" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );