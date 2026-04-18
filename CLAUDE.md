# Crypto Tracker — Architecture

## Overview

Real-time cryptocurrency price tracker with interactive candlestick charts, volatility alerts, and user personalization. Tracks 10 cryptocurrencies via the Binance WebSocket API, supplemented by REST polling. Flags coins with extreme price swings (5%+ in 1 hour). Users sign in via Supabase Auth, favorite coins for a personalized dashboard, and configure preferences.

**Live URL**: https://web-kappa-eight-11.vercel.app

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│ Binance API │─────▶│ Worker (Railway)  │─────▶│ Supabase         │─────▶│ Frontend (Vercel)│
│ WebSocket + │      │ Node.js/TS        │      │ PostgreSQL       │      │ Next.js 16       │
│ REST API    │      │ always-on service │      │ + Realtime       │      │ App Router       │
│ (global +   │      │ 10s poll + WS     │      │ + Auth           │      │ + Tailwind v4    │
│  Binance.us)│      │                   │      │                  │      │ + TradingView    │
└─────────────┘      └──────────────────┘      └──────────────────┘      └─────────────────┘
```

## Components

### Frontend — `apps/web/` (Vercel)

- **Framework**: Next.js 16 with App Router, TypeScript, Tailwind CSS v4
- **Deployment**: Vercel — https://web-kappa-eight-11.vercel.app
- **Auth**: Supabase Auth (email/password) with SSR cookie-based sessions
- **Design**: Dark professional finance theme (light blue accent, green/red for up/down)
- **Features**:
  - Live price table with 10-second auto-refresh and countdown timer
  - Price change animation (green flash up, red flash down, 700ms fade)
  - Time period toggle (24H / 1W / 1M / YTD / ALL) for % change column
  - Click any coin → interactive candlestick chart (TradingView lightweight-charts)
  - Crosshair hover shows historical price + % change vs current price
  - Volatility alerts feed (5%+ swing in 1 hour)
  - Star/unstar coins as favorites (persisted per user)
  - Toggle between "All" and "Favorites" view with favorites sorted to top
  - User preferences (sort order, personal alert threshold)
  - Supabase Realtime subscriptions for instant updates
  - Responsive dark UI
- **Key files**:
  - `app/page.tsx` — main dashboard
  - `app/login/page.tsx` — sign in
  - `app/signup/page.tsx` — registration
  - `app/components/PriceTable.tsx` — live price table with favorites, periods, countdown
  - `app/components/CoinChart.tsx` — candlestick chart modal with crosshair tooltip
  - `app/components/VolatilityAlerts.tsx` — alert feed
  - `app/components/AuthProvider.tsx` — auth context
  - `app/components/Navbar.tsx` — top bar with branding + sign out
  - `app/api/klines/route.ts` — proxies Binance klines for period % changes
  - `app/api/chart/route.ts` — proxies Binance klines for candlestick chart data
  - `middleware.ts` — auth redirect middleware
  - `lib/supabase.ts` — browser Supabase client (lazy init)
  - `lib/supabase-server.ts` — server Supabase client
  - `lib/hooks/useFavorites.ts` — favorites management hook
  - `lib/types.ts` — shared TypeScript interfaces

### Background Worker — `apps/worker/` (Railway)

- **Runtime**: Node.js + TypeScript (compiled with `tsc`)
- **Deployment**: Railway (always-on service, Dockerfile-based)
- **Data source**: Binance API (free, no API key required)
  - Primary: WebSocket `miniTicker` streams (global, falls back to Binance.us)
  - Supplement: REST API poll every 10 seconds for all symbols
  - Auto-reconnect on WebSocket disconnect with cascading fallback
- **Responsibilities**:
  - Connect to Binance WebSocket for live ticker data
  - Batch price updates and upsert to Supabase every 1 second
  - REST poll every 10 seconds to ensure all symbols stay updated
  - Maintain rolling 1-hour price window per symbol
  - Insert volatility alerts when change exceeds 5% threshold
  - Save price_history snapshots every 30 seconds
  - Seed new symbols without overwriting existing prices
- **Key files**:
  - `src/index.ts` — main entry, WebSocket + REST connection, flush loop
  - `src/volatility.ts` — rolling window + alert detection
  - `src/config.ts` — tracked symbols, thresholds, intervals
  - `src/supabase.ts` — service-role Supabase client

### Database — Supabase

- **PostgreSQL** with 5 tables:
  - `prices` — latest price per coin (upserted by worker, Realtime-enabled, REPLICA IDENTITY FULL)
  - `price_history` — time-series snapshots every 30s
  - `volatility_alerts` — flagged coins with 5%+ 1-hour swings (Realtime-enabled)
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
3. **Worker** also REST-polls all symbols every 10 seconds as a supplement
4. **Worker** records each price in a rolling 1-hour window per symbol
5. **Worker** checks if any symbol's price change exceeds 5% threshold
6. **Worker** inserts a `volatility_alerts` row if threshold exceeded
7. **Worker** saves `price_history` snapshot every 30 seconds
8. **Supabase Realtime** broadcasts `prices` UPDATE and `volatility_alerts` INSERT events
9. **Frontend** receives Realtime events + polls every 10 seconds, re-renders live
10. **Frontend** reads/writes `user_favorites` and `user_preferences` for personalized view
11. **Frontend** fetches Binance klines on demand for chart display and period % changes

## Tracked Coins

| Symbol   | Name      |
|----------|-----------|
| BTCUSDT  | Bitcoin   |
| ETHUSDT  | Ethereum  |
| BNBUSDT  | BNB       |
| SOLUSDT  | Solana    |
| XRPUSDT  | XRP       |
| ADAUSDT  | Cardano   |
| DOGEUSDT | Dogecoin  |
| AVAXUSDT | Avalanche |
| DOTUSDT  | Polkadot  |
| POLUSDT  | Polygon   |

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
cd apps/web && npm run dev

# Run worker locally (requires .env in apps/worker/)
cd apps/worker && npx tsx src/index.ts
```

## Deployment

### Frontend → Vercel
- Connected to GitHub repo, auto-deploys on push
- Root directory: `apps/web`
- Framework preset: Next.js
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Live**: https://web-kappa-eight-11.vercel.app

### Worker → Railway
- Connected to GitHub repo, auto-deploys on push
- Root directory: `apps/worker`
- Dockerfile-based build, start command: `node dist/index.js`
- Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Always-on service (not triggered by HTTP)

## Monorepo Structure

```
crypto_tracker/
├── apps/
│   ├── web/                    # Next.js frontend (Vercel)
│   │   ├── app/
│   │   │   ├── api/chart/      # Binance klines proxy for charts
│   │   │   ├── api/klines/     # Binance klines proxy for period changes
│   │   │   ├── auth/callback/  # Supabase auth callback
│   │   │   ├── components/     # PriceTable, CoinChart, VolatilityAlerts, etc.
│   │   │   ├── login/          # Sign in page
│   │   │   └── signup/         # Registration page
│   │   ├── lib/                # Supabase clients, types, hooks
│   │   └── middleware.ts       # Auth redirect middleware
│   └── worker/                 # Background worker (Railway)
│       ├── src/                # TypeScript source
│       ├── Dockerfile          # Multi-stage Docker build
│       └── railway.json        # Railway config
├── supabase/
│   └── migrations/             # SQL schema migrations
├── .mcp.json                   # Supabase MCP server config
├── package.json                # Root (npm workspaces)
├── CLAUDE.md                   # This file
└── .gitignore
```
