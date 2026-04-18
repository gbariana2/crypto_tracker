# Crypto Tracker — Architecture

## Overview

Real-time cryptocurrency price tracker with volatility alerts and user personalization. Tracks 10 key cryptocurrencies via the Binance WebSocket API and flags coins with extreme price swings (2%+) in the past 5 minutes. Users sign in via Supabase Auth and can favorite coins for a personalized view.

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│ Binance API │─────▶│ Worker (Railway)  │─────▶│ Supabase         │─────▶│ Frontend (Vercel)│
│ WebSocket   │      │ Node.js/TS        │      │ PostgreSQL       │      │ Next.js 16       │
│ miniTicker  │      │ always-on service │      │ + Realtime       │      │ App Router       │
│ streams     │      │                   │      │ + Auth           │      │ + Tailwind CSS   │
└─────────────┘      └──────────────────┘      └──────────────────┘      └─────────────────┘
```

## Components

### Frontend — `apps/web/` (Vercel)

- **Framework**: Next.js 16 with App Router, TypeScript, Tailwind CSS v4
- **Deployment**: Vercel
- **Auth**: Supabase Auth (email/password) with SSR cookie-based sessions
- **Features**:
  - Live price table updated via Supabase Realtime subscriptions
  - Flash animation on price changes
  - Volatility alerts feed (2%+ swing in 5 minutes)
  - Star/unstar coins as favorites (persisted per user)
  - Toggle between "All Coins" and "Favorites" view
  - Favorites sorted to the top of the table
  - Responsive dark mode UI
- **Key files**:
  - `app/page.tsx` — main dashboard
  - `app/login/page.tsx` — sign in
  - `app/signup/page.tsx` — registration
  - `app/components/PriceTable.tsx` — live price table with favorites
  - `app/components/VolatilityAlerts.tsx` — alert feed
  - `app/components/AuthProvider.tsx` — auth context
  - `app/components/Navbar.tsx` — top bar with user email + sign out
  - `middleware.ts` — auth redirect middleware
  - `lib/supabase.ts` — browser Supabase client
  - `lib/supabase-server.ts` — server Supabase client
  - `lib/hooks/useFavorites.ts` — favorites management hook

### Background Worker — `apps/worker/` (Railway)

- **Runtime**: Node.js + TypeScript (compiled with `tsc`)
- **Deployment**: Railway (always-on service, Dockerfile-based)
- **Data source**: Binance WebSocket API (`wss://stream.binance.com:9443/ws`)
  - Uses `miniTicker` streams for each tracked symbol
  - Free, no API key required for public endpoints
  - Updates arrive every ~1 second per symbol
- **Responsibilities**:
  - Connect to Binance WebSocket for live ticker data
  - Batch price updates and upsert to Supabase every 1 second
  - Maintain rolling 5-minute price window per symbol
  - Insert volatility alerts when change exceeds 2% threshold
  - Save price_history snapshots every 30 seconds
  - Auto-reconnect on WebSocket disconnect
- **Key files**:
  - `src/index.ts` — main entry, WebSocket connection, flush loop
  - `src/volatility.ts` — rolling window + alert detection
  - `src/config.ts` — tracked symbols, thresholds, intervals
  - `src/supabase.ts` — service-role Supabase client

### Database — Supabase

- **PostgreSQL** with 5 tables:
  - `prices` — latest price per coin (upserted by worker, Realtime-enabled)
  - `price_history` — time-series snapshots every 30s
  - `volatility_alerts` — flagged coins with extreme 5-min swings (Realtime-enabled)
  - `user_favorites` — per-user favorited coins
  - `user_preferences` — per-user settings (sort order, alert threshold)
- **Realtime**: Enabled on `prices` and `volatility_alerts` tables
- **Auth**: Email/password sign up with email confirmation
- **RLS Policies**:
  - `prices`, `price_history`, `volatility_alerts` — public read, service-role write
  - `user_favorites`, `user_preferences` — scoped to `auth.uid()`
- **Migrations**: `supabase/migrations/001_initial_schema.sql`, `002_user_favorites.sql`

## Data Flow

1. **Worker** connects to Binance WebSocket `miniTicker` streams for 10 symbols
2. **Worker** batches incoming tickers and flushes to Supabase every 1 second
3. **Worker** records each price in a rolling 5-minute window per symbol
4. **Worker** checks if any symbol's price change exceeds 2% threshold
5. **Worker** inserts a `volatility_alerts` row if threshold exceeded
6. **Worker** saves `price_history` snapshot every 30 seconds
7. **Supabase Realtime** broadcasts `prices` UPDATE and `volatility_alerts` INSERT events
8. **Frontend** receives Realtime events and re-renders table/alerts live
9. **Frontend** reads/writes `user_favorites` for personalized view

## Tracked Coins

| Symbol    | Name      |
|-----------|-----------|
| BTCUSDT   | Bitcoin   |
| ETHUSDT   | Ethereum  |
| BNBUSDT   | BNB       |
| SOLUSDT   | Solana    |
| XRPUSDT   | XRP       |
| ADAUSDT   | Cardano   |
| DOGEUSDT  | Dogecoin  |
| AVAXUSDT  | Avalanche |
| DOTUSDT   | Polkadot  |
| MATICUSDT | Polygon   |

## Environment Variables

### Frontend — `apps/web/.env.local` (also set in Vercel dashboard)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous/public key

### Worker — `apps/worker/.env` (also set in Railway dashboard)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only)

### MCP Server — `.mcp.json`
- `SUPABASE_ACCESS_TOKEN` — Supabase personal access token (for MCP)

## Development

```bash
# Install all workspace dependencies
npm install

# Run frontend dev server
npm -w apps/web run dev

# Run worker locally (requires .env in apps/worker/)
npm -w apps/worker run dev
```

## Deployment

### Frontend → Vercel
- Connected to GitHub repo, auto-deploys on push
- Root directory: `apps/web`
- Framework preset: Next.js
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Worker → Railway
- Connected to GitHub repo
- Root directory: `apps/worker`
- Dockerfile-based build
- Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Always-on service (not triggered by HTTP)

## Monorepo Structure

```
crypto_tracker/
├── apps/
│   ├── web/                # Next.js frontend (Vercel)
│   │   ├── app/            # App Router pages + components
│   │   ├── lib/            # Supabase clients, types, hooks
│   │   └── middleware.ts   # Auth redirect middleware
│   └── worker/             # Background worker (Railway)
│       ├── src/            # TypeScript source
│       ├── Dockerfile      # Railway build
│       └── railway.json    # Railway config
├── supabase/
│   └── migrations/         # SQL schema migrations
├── .mcp.json               # Supabase MCP server config
├── package.json            # Root (npm workspaces)
├── CLAUDE.md               # This file
└── .gitignore
```
