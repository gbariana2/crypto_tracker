-- ============================================
-- Crypto Tracker — Initial Schema
-- ============================================

-- 1. prices: latest price per coin (upserted by worker)
create table if not exists prices (
  symbol      text primary key,           -- e.g. 'BTCUSDT'
  name        text not null,              -- e.g. 'Bitcoin'
  price       numeric not null,
  change_24h  numeric default 0,          -- 24h % change
  high_24h    numeric,
  low_24h     numeric,
  volume_24h  numeric,
  updated_at  timestamptz not null default now()
);

-- 2. price_history: time-series snapshots for charts
create table if not exists price_history (
  id          bigint generated always as identity primary key,
  symbol      text not null references prices(symbol) on delete cascade,
  price       numeric not null,
  recorded_at timestamptz not null default now()
);

-- Index for fast time-range queries per symbol
create index if not exists idx_price_history_symbol_time
  on price_history (symbol, recorded_at desc);

-- 3. volatility_alerts: flagged coins with extreme 5-min swings
create table if not exists volatility_alerts (
  id              bigint generated always as identity primary key,
  symbol          text not null references prices(symbol) on delete cascade,
  price_start     numeric not null,
  price_end       numeric not null,
  change_pct      numeric not null,       -- % change over window
  window_seconds  int not null default 300, -- 5 minutes
  triggered_at    timestamptz not null default now()
);

create index if not exists idx_volatility_alerts_time
  on volatility_alerts (triggered_at desc);

create index if not exists idx_volatility_alerts_symbol
  on volatility_alerts (symbol, triggered_at desc);

-- ============================================
-- Enable Realtime on prices and volatility_alerts
-- ============================================
alter publication supabase_realtime add table prices;
alter publication supabase_realtime add table volatility_alerts;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
alter table prices enable row level security;
alter table price_history enable row level security;
alter table volatility_alerts enable row level security;

-- Public read access (anon key can read, only service role can write)
create policy "Public read prices"
  on prices for select
  using (true);

create policy "Public read price_history"
  on price_history for select
  using (true);

create policy "Public read volatility_alerts"
  on volatility_alerts for select
  using (true);

-- Service role has full access by default (bypasses RLS),
-- so no explicit insert/update policies needed for the worker.
