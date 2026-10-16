-- Rondas ML verificables. Aplicar después de 0028, antes de desplegar el worker.
-- Las rondas anteriores conservan su puntuación y pueden leerse; el protocolo
-- nuevo se identifica por score_version = 'spearman_era_v1'.

alter table public.ml_datasets
  add column if not exists data_hash text,
  add column if not exists seed bigint,
  add column if not exists params jsonb not null default '{}'::jsonb,
  add column if not exists version text,
  add column if not exists round_type text not null default 'historical',
  add column if not exists score_version text not null default 'legacy',
  add column if not exists published_at timestamptz,
  add column if not exists target_available_at timestamptz,
  add column if not exists scoring_started_at timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists quality_report jsonb not null default '{}'::jsonb,
  add column if not exists benchmarks jsonb not null default '{}'::jsonb;
alter table public.ml_datasets
  add column if not exists target_path text,
  add column if not exists target_hash text,
  add column if not exists mapping_path text,
  add column if not exists mapping_hash text;

update public.ml_datasets set round_type = 'practice' where mode = 'sintetico';
-- El universo real no debe quedar en una tabla legible públicamente.
update public.ml_datasets set params = params - 'universo' where params ? 'universo';

-- RLS filtra filas, no columnas. La tabla contiene rutas y hashes del
-- holdout privado, además de semillas internas; el cliente sólo recibe
-- metadatos públicos. El worker usa service_role y conserva acceso completo.
revoke select on public.ml_datasets from public, anon, authenticated;
grant select (
  id, tournament_id, round_number, mode, kind, status, n_assets, n_eras,
  n_features, feature_cols, bucket_path, row_count, salt_hash, ic_objetivo,
  created_at, closes_at, data_hash, version, round_type, score_version,
  published_at, target_available_at, finalized_at, benchmarks
) on public.ml_datasets to anon, authenticated;
drop policy if exists "ml_datasets read" on public.ml_datasets;
create policy "ml_datasets read" on public.ml_datasets for select using (
  status in ('ready', 'closed', 'awaiting_labels', 'scoring', 'scored')
);

alter table public.ml_datasets drop constraint if exists ml_datasets_status_check;
alter table public.ml_datasets add constraint ml_datasets_status_check
  check (status in ('building', 'ready', 'closed', 'awaiting_labels',
                   'scoring', 'scored', 'failed'));
alter table public.ml_datasets drop constraint if exists ml_datasets_round_type_check;
alter table public.ml_datasets add constraint ml_datasets_round_type_check
  check (round_type in ('practice', 'historical', 'prospective'));

alter table public.prediction_submissions
  add column if not exists file_path text,
  add column if not exists file_sha256 text,
  add column if not exists dataset_version text,
  add column if not exists eval_error text,
  add column if not exists is_selected boolean not null default true,
  add column if not exists qp_earned integer not null default 0;

alter table public.prediction_submissions
  drop constraint if exists prediction_submissions_dataset_id_user_id_key;
alter table public.prediction_submissions
  drop constraint if exists prediction_submissions_status_check;
alter table public.prediction_submissions add constraint prediction_submissions_status_check
  check (status in ('pending', 'validated', 'scoring', 'scored',
                   'disqualified', 'failed'));
create unique index if not exists uq_ml_selected_submission
  on public.prediction_submissions(dataset_id, user_id) where is_selected;
create index if not exists idx_ml_selected_scoring
  on public.prediction_submissions(dataset_id, status) where is_selected;

-- Selección atómica del último archivo válido. Bloquea la ronda para que un
-- envío no pueda entrar mientras el scheduler reclama el cierre.
create or replace function public.activate_ml_submission(p_submission uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare chosen public.prediction_submissions%rowtype;
declare round_row public.ml_datasets%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;
  select * into chosen from public.prediction_submissions
  where id = p_submission;
  if not found or chosen.status <> 'validated' then
    raise exception 'submission not validated';
  end if;
  select * into round_row from public.ml_datasets
  where id = chosen.dataset_id for update;
  if not found or round_row.kind <> 'live' or round_row.status <> 'ready'
     or round_row.closes_at is null or now() >= round_row.closes_at
     or chosen.dataset_version is distinct from round_row.version then
    raise exception 'round closed or dataset version changed';
  end if;
  update public.prediction_submissions set is_selected = false
  where dataset_id = chosen.dataset_id and user_id = chosen.user_id
    and is_selected;
  update public.prediction_submissions set is_selected = true
  where id = p_submission;
  return true;
end;
$$;
revoke all on function public.activate_ml_submission(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_ml_submission(uuid) to service_role;

-- El worker es el único que puede crear y cambiar envíos y puntuaciones.
drop policy if exists "pred_sub write" on public.prediction_submissions;
drop policy if exists "pred_sub read" on public.prediction_submissions;
create policy "pred_sub read" on public.prediction_submissions
  for select using (auth.uid() = user_id);

-- El cliente no puede editar su saldo ni invocar el RPC de crédito genérico.
drop policy if exists "tokens write" on public.tokens;
revoke all on function public.credit_qp(uuid, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.credit_qp(uuid, integer, text, uuid, text)
  to service_role;

-- Los archivos nuevos se guardan como <auth.uid()>/<dataset>/<submission>.csv.
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do update set public = false;
drop policy if exists "submissions read own" on storage.objects;
create policy "submissions read own" on storage.objects for select using (
  bucket_id = 'submissions' and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "submissions write service" on storage.objects;
create policy "submissions write service" on storage.objects for insert with check (
  bucket_id = 'submissions' and auth.role() = 'service_role'
);

-- El holdout completo viaja como un único parquet privado; las rondas
-- anteriores conservan dataset_targets como lectura de compatibilidad.
insert into storage.buckets (id, name, public)
values ('tournament-targets', 'tournament-targets', false)
on conflict (id) do update set public = false;
drop policy if exists "targets service read" on storage.objects;
create policy "targets service read" on storage.objects for select using (
  bucket_id = 'tournament-targets' and auth.role() = 'service_role'
);
drop policy if exists "targets service write" on storage.objects;
create policy "targets service write" on storage.objects for insert with check (
  bucket_id = 'tournament-targets' and auth.role() = 'service_role'
);

-- El crédito de premios y el libro contable se confirman juntos una sola vez.
create table if not exists public.ml_round_awards (
  dataset_id uuid not null references public.ml_datasets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid not null references public.prediction_submissions(id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (dataset_id, user_id)
);
alter table public.ml_round_awards enable row level security;
create or replace function public.award_ml_qp_once(
  p_dataset uuid, p_submission uuid, p_user uuid, p_amount integer
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare inserted_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_amount <= 0 then raise exception 'award must be positive'; end if;
  if not exists (
    select 1 from public.prediction_submissions s
    join public.ml_datasets d on d.id = s.dataset_id
    where s.id = p_submission and s.dataset_id = p_dataset
      and s.user_id = p_user and s.is_selected and s.is_valid
      and s.status = 'scored' and d.status in ('scoring', 'scored')
  ) then raise exception 'submission not eligible'; end if;

  insert into public.ml_round_awards(dataset_id, user_id, submission_id, amount)
  values (p_dataset, p_user, p_submission, p_amount)
  on conflict (dataset_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  insert into public.tokens(user_id, balance, lifetime_earned)
  values (p_user, p_amount, p_amount)
  on conflict (user_id) do update set
    balance = public.tokens.balance + excluded.balance,
    lifetime_earned = public.tokens.lifetime_earned + excluded.lifetime_earned,
    updated_at = now();
  insert into public.token_ledger(user_id, amount, type, ref_id, memo)
  values (p_user, p_amount, 'ml_tournament_prize', p_dataset,
          'Premio de torneo ML');
  update public.prediction_submissions set qp_earned = p_amount
  where id = p_submission;
  return true;
end;
$$;
revoke all on function public.award_ml_qp_once(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.award_ml_qp_once(uuid, uuid, uuid, integer)
  to service_role;
