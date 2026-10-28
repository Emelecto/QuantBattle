-- Private, durable referee heartbeat. Never stores market sources or credentials.
begin;
create table public.operation_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job = 'weekly_return_referee'),
  run_id text not null unique,
  commit_sha text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  error_code text
);
create index operation_runs_latest on public.operation_runs(job, started_at desc);
alter table public.operation_runs enable row level security;
revoke all on public.operation_runs from anon, authenticated;
grant select, insert, update, delete on public.operation_runs to service_role;
commit;
