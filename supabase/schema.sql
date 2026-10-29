-- QuantBattle schema (Supabase / Postgres)
-- Aplicar en el SQL editor del proyecto Supabase o vía CLI `supabase db push`.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- profiles (1:1 con auth.users)
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  reputation    text not null default 'Media',   -- Alta | Media | Baja
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------
-- strategies
-- ---------------------------------------------------------
create table if not exists public.strategies (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.strategies(id) on delete set null,  -- fork source
  title       text not null,
  code        text not null default '',
  asset_type  text not null default 'crypto',     -- crypto | stock
  symbol      text not null default 'BTCUSDT',
  timeframe   text not null default '1d',
  capital     numeric not null default 10000,
  commission  numeric not null default 0.1,       -- % por lado
  folds       int not null default 5,
  split       int not null default 70,            -- % train
  is_public   boolean not null default false,
  status      text not null default 'draft',      -- draft | tested
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- backtest_runs
-- ---------------------------------------------------------
create table if not exists public.backtest_runs (
  id              uuid primary key default uuid_generate_v4(),
  strategy_id     uuid not null references public.strategies(id) on delete cascade,
  status          text not null default 'pending',   -- pending|running|done|error
  metrics_json    jsonb,   -- {sharpe_is, sharpe_oos, deflated_sharpe_oos, sortino, maxdd, winrate, n_trades, ret_total, vol}
  equity_curve    jsonb,   -- [{t, is, oos}]
  trades_json     jsonb,   -- [{date, side, entry, exit, pnl, ret, why}]
  integrity       text,    -- Alta | Media | Baja
  vs_baseline     jsonb,   -- {bh_ret, naive_ret, delta}
  drift_json      jsonb,   -- sombra en vivo / paper drift
  error_message   text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------
-- shares (enlaces públicos de solo lectura)
-- ---------------------------------------------------------
create table if not exists public.shares (
  id          uuid primary key default uuid_generate_v4(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  token       text unique not null default encode(gen_random_bytes(9),'base64'),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- índices
-- ---------------------------------------------------------
create index if not exists idx_strategies_user    on public.strategies(user_id);
create index if not exists idx_strategies_public  on public.strategies(is_public);
create index if not exists idx_runs_strategy      on public.backtest_runs(strategy_id);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.strategies     enable row level security;
alter table public.backtest_runs  enable row level security;
alter table public.shares         enable row level security;

-- profiles: lectura pública, escritura propia
create policy "profiles read"      on public.profiles for select using (true);
create policy "profiles insert"    on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update"    on public.profiles for update using (auth.uid() = id);

-- strategies: lectura si pública o es dueño; dueño escribe
create policy "strat public read"  on public.strategies for select using (is_public or auth.uid() = user_id);
create policy "strat owner write"  on public.strategies for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- backtest_runs: visible si la estrategia es pública o propia; dueño escribe
create policy "runs read" on public.backtest_runs for select using (
  exists (select 1 from public.strategies
          where id = strategy_id and (is_public or user_id = auth.uid()))
);
create policy "runs owner write" on public.backtest_runs for all
  using (exists (select 1 from public.strategies
                 where id = strategy_id and user_id = auth.uid()))
  with check (exists (select 1 from public.strategies
                      where id = strategy_id and user_id = auth.uid()));

-- shares: lectura pública
create policy "shares read" on public.shares for select using (true);

-- ---------------------------------------------------------
-- triggers / automatizaciones
-- ---------------------------------------------------------
create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_strategies_updated on public.strategies;
create trigger trg_strategies_updated before update on public.strategies
  for each row execute function public.set_updated_at();

-- crear profile automáticamente al registrarse
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, split_part(new.email,'@',1), split_part(new.email,'@',1))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();
