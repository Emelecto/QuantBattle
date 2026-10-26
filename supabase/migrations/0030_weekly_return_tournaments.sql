-- Weekly, four-round prospective return tournament. Existing ML v1 is unchanged.
begin;
create table if not exists public.ml_return_weeks (
  id uuid primary key,
  week_start date not null unique,
  name text not null,
  timezone text not null default 'America/Bogota',
  protocol text not null default 'daily_return_mae_v1',
  status text not null default 'open' check (status in ('open','published','incomplete')),
  release_at timestamptz not null,
  asset_count integer not null check (asset_count >= 30),
  universe_path text not null,
  universe_hash text not null,
  result_path text,
  result_hash text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.ml_return_rounds (
  id uuid primary key,
  week_id uuid not null references public.ml_return_weeks(id),
  ordinal integer not null check (ordinal between 1 and 4),
  observation_day date not null,
  submission_day date not null,
  target_day date not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  target_start timestamptz not null,
  target_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending','building','ready','settled','missed')),
  build_started_at timestamptz,
  published_at timestamptz,
  settled_at timestamptz,
  version text,
  manifest jsonb,
  source_path text,
  source_hash text,
  settlement_path text,
  settlement_hash text,
  unique(week_id,ordinal),
  check (opens_at < closes_at and closes_at <= target_start and target_start < target_end),
  check (target_day = submission_day + 1 and observation_day = submission_day - 1)
);
create table if not exists public.ml_return_submissions (
  id uuid primary key,
  round_id uuid not null references public.ml_return_rounds(id),
  user_id uuid not null references auth.users(id),
  file_path text not null,
  file_sha256 text not null,
  dataset_version text not null,
  row_count integer not null check (row_count > 0),
  experiment jsonb,
  is_selected boolean not null default false,
  status text not null default 'validated' check (status in ('validated','scored')),
  submitted_at timestamptz not null default now(),
  score double precision,
  mae double precision,
  baseline_mae double precision
);
create unique index if not exists ml_return_selected on public.ml_return_submissions(round_id,user_id) where is_selected;
create index if not exists ml_return_submissions_owner on public.ml_return_submissions(user_id,submitted_at desc);
alter table public.ml_return_weeks enable row level security;
alter table public.ml_return_rounds enable row level security;
alter table public.ml_return_submissions enable row level security;
-- API is the only reader, so private fields and pre-release scores cannot be
-- obtained by querying PostgREST directly with an anon/authenticated token.
revoke all on public.ml_return_weeks, public.ml_return_rounds, public.ml_return_submissions from public, anon, authenticated;
grant all on public.ml_return_weeks, public.ml_return_rounds, public.ml_return_submissions to service_role;
create or replace function public.activate_return_submission(p_submission uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare chosen public.ml_return_submissions%rowtype;
declare round_row public.ml_return_rounds%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  select * into chosen from public.ml_return_submissions where id=p_submission;
  if not found or chosen.status <> 'validated' then raise exception 'invalid submission'; end if;
  select * into round_row from public.ml_return_rounds where id=chosen.round_id for update;
  if not found or round_row.status <> 'ready' or now() < round_row.opens_at
    or now() >= round_row.closes_at or chosen.dataset_version is distinct from round_row.version then
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
