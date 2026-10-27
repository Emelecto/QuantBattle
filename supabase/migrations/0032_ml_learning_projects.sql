-- ML projects are independent of historical trading strategies and subscriptions.
begin;
create table public.ml_research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  hypothesis text not null default '',
  protocol text not null check (protocol in ('daily_return_mae_v1','spearman_era_v1')),
  parent_publication_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ml_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ml_research_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot jsonb not null,
  notebook_path text,
  notebook_sha256 text,
  created_at timestamptz not null default now()
);
create table public.ml_project_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ml_research_projects(id) on delete cascade,
  version_id uuid not null references public.ml_project_versions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  protocol text not null check (protocol in ('daily_return_mae_v1','spearman_era_v1')),
  submission_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, protocol, submission_id)
);
create table public.ml_research_publications (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  version_id uuid not null references public.ml_project_versions(id),
  title text not null,
  protocol text not null check (protocol in ('daily_return_mae_v1','spearman_era_v1')),
  description text not null,
  limitations text not null,
  license text not null check (license in ('MIT','BSD-3-Clause','Apache-2.0','CC0-1.0')),
  snapshot jsonb not null,
  notebook_path text not null,
  notebook_sha256 text not null,
  status text not null default 'pending_review' check (status in ('pending_review','published','rejected','withdrawn')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(author_id, version_id)
);
alter table public.ml_research_projects add constraint ml_project_parent_publication
  foreign key (parent_publication_id) references public.ml_research_publications(id) on delete set null;
create table public.ml_learning_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission text not null,
  definition_version integer not null,
  answer jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create table public.ml_learning_checkpoints (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step text not null check (step in ('read_rules','environment','validation')),
  created_at timestamptz not null default now(),
  primary key (user_id, step)
);
create table public.ml_learning_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission text not null,
  definition_version integer not null,
  created_at timestamptz not null default now(),
  primary key(user_id, mission, definition_version)
);
create index on public.ml_research_projects(user_id, updated_at desc);
create index on public.ml_project_versions(project_id, created_at desc);
create index on public.ml_project_submissions(project_id);
create index on public.ml_research_publications(status, created_at desc);
create index on public.ml_research_publications(author_id, created_at desc);
create index on public.ml_learning_attempts(user_id, created_at desc);
-- Writes go through the authenticated API so version ownership, moderation,
-- notebook cleanup and server-computed mission results cannot be bypassed.
alter table public.ml_research_projects enable row level security;
alter table public.ml_project_versions enable row level security;
alter table public.ml_project_submissions enable row level security;
alter table public.ml_research_publications enable row level security;
alter table public.ml_learning_attempts enable row level security;
alter table public.ml_learning_checkpoints enable row level security;
alter table public.ml_learning_completions enable row level security;
create policy ml_project_owner_read on public.ml_research_projects for select using (auth.uid()=user_id);
create policy ml_version_owner_read on public.ml_project_versions for select using (auth.uid()=user_id);
create policy ml_link_owner_read on public.ml_project_submissions for select using (auth.uid()=user_id);
create policy ml_publication_author_read on public.ml_research_publications for select using (auth.uid()=author_id);
create policy ml_attempt_owner_read on public.ml_learning_attempts for select using (auth.uid()=user_id);
create policy ml_checkpoint_owner_read on public.ml_learning_checkpoints for select using (auth.uid()=user_id);
create policy ml_completion_owner_read on public.ml_learning_completions for select using (auth.uid()=user_id);
revoke all on public.ml_research_projects, public.ml_project_versions, public.ml_project_submissions,
  public.ml_research_publications, public.ml_learning_attempts, public.ml_learning_checkpoints,
  public.ml_learning_completions from anon;
revoke all on public.ml_research_projects, public.ml_project_versions, public.ml_project_submissions,
  public.ml_research_publications, public.ml_learning_attempts, public.ml_learning_checkpoints,
  public.ml_learning_completions from authenticated;
grant select on public.ml_research_projects, public.ml_project_versions, public.ml_project_submissions,
  public.ml_research_publications, public.ml_learning_attempts, public.ml_learning_checkpoints,
  public.ml_learning_completions to authenticated;
grant all on public.ml_research_projects, public.ml_project_versions, public.ml_project_submissions,
  public.ml_research_publications, public.ml_learning_attempts, public.ml_learning_checkpoints,
  public.ml_learning_completions to service_role;
commit;
