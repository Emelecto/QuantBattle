-- A separate stock modality; no changes to existing crypto or rank tournaments.
begin;
alter table public.operation_runs drop constraint if exists operation_runs_job_check;
alter table public.operation_runs add constraint operation_runs_job_check
  check (job in ('weekly_return_referee','stock_return_referee'));
create table if not exists public.stock_return_rounds (
  id text primary key check (id ~ '^stocks-oc-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  target_date date not null unique,
  observation_date date not null,
  deadline timestamptz not null,
  target_open timestamptz not null,
  target_close timestamptz not null,
  manifest_path text not null,
  manifest_hash text not null,
  manifest jsonb not null,
  assets jsonb not null check (jsonb_array_length(assets) between 40 and 50),
  status text not null default 'open' check (status in ('open','settled')),
  result_path text,
  result_hash text,
  settled_at timestamptz,
  published_at timestamptz not null default clock_timestamp(),
  check (observation_date < target_date and deadline < target_open and target_open < target_close)
);
create table if not exists public.stock_return_submissions (
  id uuid primary key,
  round_id text not null references public.stock_return_rounds(id),
  user_id uuid not null references auth.users(id),
  file_path text not null,
  file_sha256 text not null,
  manifest_hash text not null,
  row_count integer not null check (row_count between 40 and 50),
  submitted_at timestamptz not null default clock_timestamp(),
  is_selected boolean not null default true,
  status text not null default 'validated' check (status in ('validated','scored')),
  score double precision,
  mae double precision,
  baseline_mae double precision
);
create unique index if not exists stock_return_selected on public.stock_return_submissions(round_id,user_id) where is_selected;
create index if not exists stock_return_owner on public.stock_return_submissions(user_id,submitted_at desc);
alter table public.stock_return_rounds enable row level security;
alter table public.stock_return_submissions enable row level security;
revoke all on public.stock_return_rounds, public.stock_return_submissions from public,anon,authenticated;
grant all on public.stock_return_rounds, public.stock_return_submissions to service_role;

-- Insertion and replacement are a single transaction. Recheck the wall clock
-- AFTER acquiring the lock; now() would permit a late upload waiting on a lock.
create or replace function public.submit_stock_prediction(p_submission jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.stock_return_rounds%rowtype;
declare s public.stock_return_submissions%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  select * into r from public.stock_return_rounds where id=p_submission->>'round_id' for update;
  if not found or r.status <> 'open' or clock_timestamp() >= r.deadline
    or clock_timestamp() < r.published_at or r.manifest_hash is distinct from p_submission->>'manifest_hash'
    or jsonb_array_length(r.assets) <> (p_submission->>'row_count')::integer then
    raise exception 'round closed or dataset changed';
  end if;
  if (select count(*) from public.stock_return_submissions where round_id=r.id
      and user_id=(p_submission->>'user_id')::uuid) >= 50 then
    raise exception 'submission limit reached';
  end if;
  update public.stock_return_submissions set is_selected=false where round_id=r.id
    and user_id=(p_submission->>'user_id')::uuid and is_selected;
  insert into public.stock_return_submissions(id,round_id,user_id,file_path,file_sha256,manifest_hash,row_count)
    values ((p_submission->>'id')::uuid,r.id,(p_submission->>'user_id')::uuid,
      p_submission->>'file_path',p_submission->>'file_sha256',r.manifest_hash,(p_submission->>'row_count')::integer)
    returning * into s;
  return to_jsonb(s);
end;
$$;
revoke all on function public.submit_stock_prediction(jsonb) from public,anon,authenticated;
grant execute on function public.submit_stock_prediction(jsonb) to service_role;
commit;
