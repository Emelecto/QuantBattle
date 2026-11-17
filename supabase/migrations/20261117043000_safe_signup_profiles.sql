-- Create the profile with the chosen alias inside Auth's transaction. Email
-- local parts are neither unique usernames nor appropriate public fallbacks.
begin;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  chosen text := btrim(new.raw_user_meta_data->>'username');
  label text := nullif(left(btrim(new.raw_user_meta_data->>'display_name'),80),'');
  candidate text;
  attempt integer := 0;
  conflict_name text;
begin
  if chosen is null or chosen !~ '^[A-Za-z0-9_.-]{3,20}$' then
    chosen := 'qb_' || left(md5(new.id::text),17);
  end if;
  candidate := chosen;
  loop
    begin
      insert into public.profiles(id,username,display_name)
      values(new.id,candidate,coalesce(label,candidate))
      on conflict(id) do nothing;
      return new;
    exception when unique_violation then
      get stacked diagnostics conflict_name = constraint_name;
      if conflict_name not in ('profiles_username_key','profiles_username_unique') or attempt >= 8 then
        raise;
      end if;
      attempt := attempt + 1;
      candidate := 'qb_' || left(md5(new.id::text || ':' || attempt::text),17);
    end;
  end loop;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
commit;
