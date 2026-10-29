-- QuantBattle v2 — Torneos + Marketplace + QP (QuantPoints)
-- Aplicar DESPUÉS del schema base existente (profiles, strategies, backtest_runs, shares)

-- ---------------------------------------------------------
-- 1. TOKENS (wallet QP por usuario)
-- ---------------------------------------------------------
create table if not exists public.tokens (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  balance     int not null default 0,
  lifetime_earned  int not null default 0,
  lifetime_spent  int not null default 0,
  tier        text not null default 'free',
  updated_at  timestamptz not null default now()
);

create table if not exists public.token_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      int not null,
  type        text not null,
  ref_id      uuid,
  memo        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ledger_user       on public.token_ledger(user_id, created_at desc);
create index if not exists idx_ledger_type       on public.token_ledger(type);

-- ---------------------------------------------------------
-- 2. TORNEOS
-- ---------------------------------------------------------
create table if not exists public.tournaments (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text unique not null,
  type                  text not null,
  status                text not null default 'draft',
  asset_type            text not null,
  symbols               text[] not null,
  timeframe             text not null default '1d',
  data_start            date not null,
  data_end              date not null,
  eval_end              date not null,
  submission_deadline   timestamptz not null,
  prize_pool_qp         int not null default 0,
  sponsor_id            uuid,
  sponsor_prize_desc    text,
  primary_metric        text not null default 'deflated_sharpe_oos',
  min_trades            int not null default 10,
  max_slippage_pct      float not null default 0.005,
  rules_text            text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now()
);

create table if not exists public.submissions (
  id                uuid primary key default gen_random_uuid(),
  tournament_id     uuid not null references public.tournaments(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  code              text not null,
  config            jsonb not null,
  metrics           jsonb,
  integrity_label   text,
  primary_score     float,
  rank              int,
  qp_staked         int not null default 0,
  qp_earned         int not null default 0,
  status            text not null default 'pending',
  eval_error        text,
  submitted_at      timestamptz not null default now(),
  evaluated_at      timestamptz,
  unique(tournament_id, user_id)
);

create index if not exists idx_sub_tournament  on public.submissions(tournament_id);
create index if not exists idx_sub_user        on public.submissions(user_id);

create table if not exists public.leaderboard_entries (
  tournament_id     uuid not null references public.tournaments(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  submission_id     uuid references public.submissions(id),
  rank              int not null,
  score             float not null,
  qp_earned         int not null default 0,
  badge_earned      text,
  primary key (tournament_id, user_id)
);

-- ---------------------------------------------------------
-- 3. MARKETPLACE
-- ---------------------------------------------------------
create table if not exists public.marketplace_strategies (
  id                  uuid primary key default gen_random_uuid(),
  author_id           uuid not null references public.profiles(id) on delete cascade,
  title               text not null,
  slug                text unique not null,
  description         text,
  tags                text[],
  asset_type          text not null,
  symbol              text not null,
  timeframe           text not null,
  code                text,
  is_public_code      boolean not null default false,
  config              jsonb not null,
  backtest_metrics    jsonb,
  backtest_equity     jsonb,
  price_qp_week       int not null default 0,
  subscribers         int not null default 0,
  total_copies        int not null default 0,
  avg_rating          float,
  status              text not null default 'draft',
  created_at          timestamptz not null default now(),
  published_at        timestamptz
);

create index if not exists idx_market_status   on public.marketplace_strategies(status);
create index if not exists idx_market_author   on public.marketplace_strategies(author_id);

create table if not exists public.strategy_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid not null references public.marketplace_strategies(id) on delete cascade,
  subscriber_id   uuid not null references public.profiles(id) on delete cascade,
  copy_config     jsonb,
  is_paper        boolean not null default true,
  broker_account  text,
  status          text not null default 'active',
  started_at      timestamptz not null default now(),
  expires_at      timestamptz,
  last_paid_at    timestamptz,
  qp_spent_total  int not null default 0,
  paper_pnl       float,
  unique(strategy_id, subscriber_id)
);

create table if not exists public.signals (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid not null references public.marketplace_strategies(id) on delete cascade,
  symbol          text not null,
  direction       text not null,
  strength        float,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_signals_strategy  on public.signals(strategy_id, created_at desc);

-- ---------------------------------------------------------
-- 4. SPONSORS
-- ---------------------------------------------------------
create table if not exists public.sponsors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null,
  logo_url        text,
  website         text,
  contact_email   text,
  prize_type      text not null,
  prize_desc      text,
  prize_value_usd float,
  total_given     int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 5. MARKET CACHE
-- ---------------------------------------------------------
create table if not exists public.market_cache (
  symbol          text not null,
  timeframe       text not null,
  bucket          timestamptz not null,
  data            jsonb not null,
  source          text not null,
  cached_at       timestamptz not null default now(),
  primary key (symbol, timeframe, bucket)
);

create index if not exists idx_market_cache_lookup on public.market_cache(symbol, timeframe);

-- ---------------------------------------------------------
-- 6. PROFILES EXTENDED
-- ---------------------------------------------------------
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists total_qp_earned int not null default 0;
alter table public.profiles add column if not exists tournaments_won int not null default 0;
alter table public.profiles add column if not exists current_streak int not null default 0;
alter table public.profiles add column if not exists best_streak int not null default 0;

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------
alter table public.tokens               enable row level security;
alter table public.token_ledger         enable row level security;
alter table public.tournaments          enable row level security;
alter table public.submissions          enable row level security;
alter table public.leaderboard_entries  enable row level security;
alter table public.marketplace_strategies enable row level security;
alter table public.strategy_subscriptions enable row level security;
alter table public.signals              enable row level security;
alter table public.sponsors             enable row level security;
alter table public.market_cache         enable row level security;

-- tokens
create policy "tokens read"   on public.tokens for select using (true);
create policy "tokens write"  on public.tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ledger
create policy "ledger read"   on public.token_ledger for select using (auth.uid() = user_id);

-- tournaments
create policy "tournaments read"    on public.tournaments for select using (true);
create policy "tournaments write"   on public.tournaments for all
  using (auth.uid() = created_by or created_by is null)
  with check (auth.uid() = created_by or created_by is null);

-- submissions
create policy "sub read"   on public.submissions for select using (true);
create policy "sub write"  on public.submissions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- leaderboard
create policy "leaderboard read" on public.leaderboard_entries for select using (true);

-- marketplace
create policy "market read"  on public.marketplace_strategies for select using (status = 'published' or author_id = auth.uid());
create policy "market write" on public.marketplace_strategies for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- subscriptions
create policy "subscr read"  on public.strategy_subscriptions for select using (auth.uid() = subscriber_id or exists (select 1 from public.marketplace_strategies where id = strategy_id and author_id = auth.uid()));
create policy "subscr write" on public.strategy_subscriptions for all using (auth.uid() = subscriber_id) with check (auth.uid() = subscriber_id);

-- signals
create policy "signals read" on public.signals for select using (exists (select 1 from public.marketplace_strategies where id = strategy_id and (author_id = auth.uid() or status = 'published')));

-- sponsors
create policy "sponsors read" on public.sponsors for select using (true);

-- cache
create policy "cache read" on public.market_cache for select using (true);
