-- ============================================
-- User Favorites & Preferences
-- ============================================

-- Users can favorite specific coins to see them highlighted
create table if not exists user_favorites (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null references prices(symbol) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, symbol)
);

create index if not exists idx_user_favorites_user
  on user_favorites (user_id);

-- User preferences (e.g. sort order, theme, alert threshold)
create table if not exists user_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  sort_by             text not null default 'volume_24h',  -- column to sort by
  sort_ascending      boolean not null default false,
  volatility_threshold numeric not null default 2.0,       -- personal alert threshold
  updated_at          timestamptz not null default now()
);

-- ============================================
-- RLS Policies
-- ============================================

alter table user_favorites enable row level security;
alter table user_preferences enable row level security;

-- Users can only read/write their own favorites
create policy "Users manage own favorites"
  on user_favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can only read/write their own preferences
create policy "Users manage own preferences"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
