# Crypto Tracker — Architecture

## Overview

Real-time cryptocurrency price tracker with volatility alerts. Tracks key cryptocurrencies via the Binance API and flags coins with extreme price swings in the past 5 minutes.

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│ Binance API │─────▶│ Worker (Railway)  │─────▶│ Supabase         │─────▶│ Frontend (Vercel)│
│ WebSocket/  │      │ Node.js service   │      │ PostgreSQL       │      │ Next.js App      │
│ REST API    │      │ polls prices,     │      │ + Realtime       │      │ Router + Tailwind│
│             │      │ computes          │      │ + Auth           │      │                  │
│             │      │ volatility        │      │                  │      │                  │
└─────────────┘      └──────────────────┘      └──────────────────┘      └─────────────────┘
```

## Components

### Frontend — `apps/web/` (Vercel)

- **Framework**: Next.js with App Router, TypeScript, Tailwind CSS
- **Deployment**: Vercel
- **Responsibilities**:
  - Display live crypto prices via Supabase Realtime subscriptions
  - Show volatility alerts for coins with significant 5-minute swings
  - Dashboard UI with price charts and alert indicators
  - User authentication via Supabase Auth

### Background Worker — `worker/` (Railway)

- **Runtime**: Node.js
- **Deployment**: Railway (always-on service)
- **Responsibilities**:
  - Connect to Binance API (WebSocket for live tickers, REST for snapshots)
  - Poll/stream price data for tracked cryptocurrencies
  - Compute 5-minute volatility (percentage change, standard deviation)
  - Write price updates and volatility flags to Supabase
  - Runs continuously — not serverless, needs persistent connections

### Database — Supabase

- **PostgreSQL**: Stores crypto prices, historical snapshots, volatility events
- **Realtime**: Pushes price updates and volatility alerts to connected frontend clients
- **Auth**: User authentication for the dashboard
- **Key tables** (planned):
  - `prices` — latest price per coin (symbol, price, timestamp, change_24h)
  - `price_history` — time-series data for charts
  - `volatility_alerts` — flagged coins with extreme 5-min swings

## Data Flow

1. **Worker** connects to Binance WebSocket / polls REST API every few seconds
2. **Worker** computes rolling 5-minute price changes for each tracked coin
3. **Worker** upserts latest prices into Supabase `prices` table
4. **Worker** inserts into `volatility_alerts` if a coin exceeds the threshold
5. **Supabase Realtime** broadcasts row changes to subscribed clients
6. **Frontend** receives updates via Realtime subscription and re-renders live

## Tracked Coins (initial set)

BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, DOT, MATIC

## Environment Variables

### Frontend (`apps/web/.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous/public key

### Worker (`worker/.env`)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only)
- `BINANCE_API_KEY` — (optional, public endpoints don't require auth)

## Development

```bash
# Install all workspace dependencies
npm install

# Run frontend dev server
npm -w apps/web run dev

# Run worker locally
npm -w worker run dev
```

## Monorepo Structure

```
crypto_tracker/
├── apps/
│   └── web/              # Next.js frontend
├── worker/               # Background worker
├── package.json          # Root (npm workspaces)
├── CLAUDE.md             # This file
└── .gitignore
```
