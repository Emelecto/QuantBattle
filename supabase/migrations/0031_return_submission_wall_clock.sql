-- PostgreSQL now() is frozen at transaction start. A submission waiting for
-- the round lock must instead be checked against the wall clock after the wait.
begin;
create or replace function public.activate_return_submission(p_submission uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare chosen public.ml_return_submissions%rowtype;
declare round_row public.ml_return_rounds%rowtype;
declare checked_at timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  select * into chosen from public.ml_return_submissions where id=p_submission;
  if not found or chosen.status <> 'validated' then raise exception 'invalid submission'; end if;
  select * into round_row from public.ml_return_rounds where id=chosen.round_id for update;
  checked_at := clock_timestamp();
  if not found or round_row.status <> 'ready' or checked_at < round_row.opens_at
    or checked_at >= round_row.closes_at or chosen.dataset_version is distinct from round_row.version then
    raise exception 'round closed or dataset changed';
  end if;
  update public.ml_return_submissions set is_selected=false
    where round_id=chosen.round_id and user_id=chosen.user_id and is_selected;
  update public.ml_return_submissions set is_selected=true where id=p_submission;
  return true;
end;
$$;
revoke all on function public.activate_return_submission(uuid) from public,anon,authenticated;
grant execute on function public.activate_return_submission(uuid) to service_role;
commit;
