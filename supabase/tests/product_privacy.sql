-- Dedicated identities and data are always rolled back.
begin;
insert into auth.users(id,aud,role,email) values
 ('a0330000-0000-4000-8000-000000000001','authenticated','authenticated','release-a@example.invalid'),
 ('a0330000-0000-4000-8000-000000000002','authenticated','authenticated','release-b@example.invalid');
insert into public.profiles(id,username) values
 ('a0330000-0000-4000-8000-000000000001','release-a'),
 ('a0330000-0000-4000-8000-000000000002','release-b') on conflict(id) do nothing;
insert into public.course_progress(user_id,completed_lessons) values
 ('a0330000-0000-4000-8000-000000000001',array['c1-l1']),
 ('a0330000-0000-4000-8000-000000000002',array['c2-l1']);
insert into public.strategies(id,user_id,title,is_public) values
 ('a0330000-0000-4000-8000-000000000003','a0330000-0000-4000-8000-000000000001','Private A',false),
 ('a0330000-0000-4000-8000-000000000004','a0330000-0000-4000-8000-000000000002','Private B',false);
insert into public.backtest_runs(strategy_id,status) values
 ('a0330000-0000-4000-8000-000000000003','done'),
 ('a0330000-0000-4000-8000-000000000004','done');
insert into public.operation_runs(job,run_id,status) values ('weekly_return_referee','privacy-fixture','running');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0330000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.course_progress where user_id in ('a0330000-0000-4000-8000-000000000001','a0330000-0000-4000-8000-000000000002')) <> 1 then raise exception 'Academia progress isolation failed'; end if;
 if (select count(*) from public.strategies where id in ('a0330000-0000-4000-8000-000000000003','a0330000-0000-4000-8000-000000000004')) <> 1 then raise exception 'Private strategies isolation failed'; end if;
 if (select count(*) from public.backtest_runs where strategy_id in ('a0330000-0000-4000-8000-000000000003','a0330000-0000-4000-8000-000000000004')) <> 1 then raise exception 'Backtest isolation failed'; end if;
 begin
  insert into public.course_progress(user_id) values ('a0330000-0000-4000-8000-000000000002') on conflict(user_id) do update set completed_lessons=array['forged'];
  raise exception 'Forged progress was accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.operation_runs;
  raise exception 'Operation history exposed to authenticated';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.operation_runs;
  raise exception 'Operation history exposed to anonymous';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
