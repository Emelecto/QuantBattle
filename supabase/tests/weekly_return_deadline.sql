-- Run against the configured database after 0031. Everything is rolled back:
-- this creates no visible tournament, upload, user, or retained test record.
-- Requires the existing confirmed technical pilot account.
begin;
do $$
declare week_id uuid := gen_random_uuid();
declare round_id uuid := gen_random_uuid();
declare submission_id uuid := gen_random_uuid();
declare selected_id uuid := gen_random_uuid();
declare owner_id uuid;
declare cutoff timestamptz;
declare rejected boolean := false;
begin
  select id into strict owner_id from auth.users where email='returns-technical@quantlab.example';
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.ml_return_weeks
    (id,week_start,name,release_at,asset_count,universe_path,universe_hash)
    values (week_id,'2199-01-07','Transactional rollback deadline test',
      clock_timestamp()+interval '7 days',30,'rollback-only','rollback-only');
  cutoff := clock_timestamp()+interval '200 milliseconds';
  insert into public.ml_return_rounds
    (id,week_id,ordinal,observation_day,submission_day,target_day,
     opens_at,closes_at,target_start,target_end,status,version)
    values (round_id,week_id,1,'2199-01-06','2199-01-07','2199-01-08',
      cutoff-interval '1 minute',cutoff,cutoff,cutoff+interval '1 day','ready','rollback-only');
  insert into public.ml_return_submissions
    (id,round_id,user_id,file_path,file_sha256,dataset_version,row_count)
    values (selected_id,round_id,owner_id,'rollback-only','rollback-only','rollback-only',30);
  perform public.activate_return_submission(selected_id);
  insert into public.ml_return_submissions
    (id,round_id,user_id,file_path,file_sha256,dataset_version,row_count)
    values (submission_id,round_id,owner_id,'rollback-only','rollback-only','rollback-only',30);
  -- Models a transaction that began before cutoff and resumes after a lock wait.
  perform pg_sleep(0.4);
  if not (now() < cutoff and clock_timestamp() >= cutoff) then
    raise exception 'Deadline fixture did not straddle the transaction clock';
  end if;
  begin
    perform public.activate_return_submission(submission_id);
  exception when raise_exception then
    if sqlerrm <> 'round closed or dataset changed' then raise; end if;
    rejected := true;
  end;
  if not rejected or exists (
    select 1 from public.ml_return_submissions where id=submission_id and is_selected
  ) or not exists (
    select 1 from public.ml_return_submissions where id=selected_id and is_selected
  ) then
    raise exception 'Late submission was accepted using a stale transaction clock';
  end if;
end;
$$;
select 'passed: timely accepted, expired rejected, prior selected preserved' as deadline_check;
rollback;
