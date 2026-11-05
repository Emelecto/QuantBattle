-- Transactional integration test. No retained user, tournament or prediction.
begin;
do $$
declare owner_id uuid := gen_random_uuid();
declare first_id uuid := gen_random_uuid();
declare second_id uuid := gen_random_uuid();
declare cutoff timestamptz;
declare payload jsonb;
declare assets jsonb;
declare rejected boolean := false;
begin
  insert into auth.users(id,aud,role,email) values(owner_id,'authenticated','authenticated',owner_id::text || '@example.invalid');
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select jsonb_agg(jsonb_build_object('id',n::text,'ticker','FIXTURE')) into assets from generate_series(1,40) n;
  cutoff := clock_timestamp()+interval '2 seconds';
  insert into public.stock_return_rounds(id,target_date,observation_date,deadline,target_open,target_close,
    manifest_path,manifest_hash,manifest,assets)
    values('stocks-oc-2199-01-08','2199-01-08','2199-01-07',cutoff,cutoff+interval '30 minutes',
      cutoff+interval '7 hours','rollback-only','rollback-hash','{}',assets);
  payload := jsonb_build_object('id',first_id,'round_id','stocks-oc-2199-01-08','user_id',owner_id,
    'file_path','rollback-only','file_sha256','test','manifest_hash','rollback-hash','row_count',40);
  perform public.submit_stock_prediction(payload);
  payload := jsonb_set(payload,'{id}',to_jsonb(second_id));
  perform public.submit_stock_prediction(payload);
  if (select count(*) from public.stock_return_submissions where round_id='stocks-oc-2199-01-08' and is_selected) <> 1
      or not exists(select 1 from public.stock_return_submissions where id=second_id and is_selected) then
    raise exception 'Replacement is not atomic';
  end if;
  perform pg_sleep(2.2);
  begin
    perform public.submit_stock_prediction(jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid())));
  exception when raise_exception then
    if sqlerrm <> 'round closed or dataset changed' then raise; end if;
    rejected := true;
  end;
  if not rejected or not exists(select 1 from public.stock_return_submissions where id=second_id and is_selected) then
    raise exception 'Late submission changed the selected prediction';
  end if;
end;
$$;
select 'passed: atomic replacement and wall-clock deadline' as stock_submission_check;
rollback;
