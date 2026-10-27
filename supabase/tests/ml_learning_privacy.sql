-- Run after 0032 on a disposable database or within this rollback transaction.
-- Uses dedicated technical identities; no email or storage operations occur.
begin;
insert into auth.users (id,aud,role,email) values
 ('a0320000-0000-4000-8000-000000000001','authenticated','authenticated','ml-learning-a@example.invalid'),
 ('a0320000-0000-4000-8000-000000000002','authenticated','authenticated','ml-learning-b@example.invalid');
insert into public.profiles(id,username) values
 ('a0320000-0000-4000-8000-000000000001','ml-learning-rls-a'),
 ('a0320000-0000-4000-8000-000000000002','ml-learning-rls-b') on conflict (id) do nothing;
insert into public.ml_research_projects(id,user_id,title,protocol) values
 ('a0320000-0000-4000-8000-000000000003','a0320000-0000-4000-8000-000000000001','Own project','daily_return_mae_v1'),
 ('a0320000-0000-4000-8000-000000000004','a0320000-0000-4000-8000-000000000002','Other project','daily_return_mae_v1');
insert into public.ml_project_versions(id,project_id,user_id,snapshot) values
 ('a0320000-0000-4000-8000-000000000005','a0320000-0000-4000-8000-000000000003','a0320000-0000-4000-8000-000000000001','{"note":"own private note"}'),
 ('a0320000-0000-4000-8000-000000000006','a0320000-0000-4000-8000-000000000004','a0320000-0000-4000-8000-000000000002','{"note":"other private note"}');
insert into public.ml_research_publications(author_id,author_name,version_id,title,protocol,description,limitations,license,snapshot,notebook_path,notebook_sha256,status) values
 ('a0320000-0000-4000-8000-000000000002','Technical user B','a0320000-0000-4000-8000-000000000006','Published example','daily_return_mae_v1','technical fixture','not a real notebook','MIT','{}','private/fixture.ipynb','fixture','published');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0320000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0320000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare denied boolean;
begin
  if (select count(*) from public.ml_research_projects) <> 1 then
    raise exception 'Project owner isolation failed';
  end if;
  if (select count(*) from public.ml_project_versions) <> 1 then
    raise exception 'Version owner isolation failed';
  end if;
  if (select count(*) from public.ml_research_publications) <> 0 then
    raise exception 'Private notebook paths leaked via direct table read';
  end if;
  denied := false;
  begin
    insert into public.ml_learning_attempts(user_id,mission,definition_version,answer,result)
    values ('a0320000-0000-4000-8000-000000000001','baseline',1,'{}','{"passed":true}');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client forged a mission result'; end if;
  denied := false;
  begin
    update public.ml_project_versions set snapshot='{}' where id='a0320000-0000-4000-8000-000000000005';
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Client edited an immutable version'; end if;
end $$;
reset role;
rollback;
