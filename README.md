# CryptoTracker

A real-time cryptocurrency dashboard that tracks 10 coins with live price updates, interactive candlestick charts, volatility alerts, and personalized favorites.

**[Live App](https://web-kappa-eight-11.vercel.app)**

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e) ![Railway](https://img.shields.io/badge/Railway-Worker-blueviolet)

---

## Features

- **Live prices** — 10 cryptocurrencies updating every ~10 seconds with green/red flash animations
- **Candlestick charts** — click any coin for an interactive TradingView chart with crosshair showing price + % change vs current
- **Time period toggle** — switch between 24H, 1W, 1M, YTD, and ALL for both the table and charts
- **Volatility alerts** — flags coins with 5%+ price swings in 1 hour
- **User authentication** — sign up / sign in via Supabase Auth
- **Favorites** — star coins for a personalized view, persisted per user
- **Search** — filter coins by name or ticker
- **Countdown timer** — shows seconds until next refresh, displays "No change" when prices are stable
- **Loading skeleton** — shimmer placeholder rows while data loads
- **Dark finance theme** — professional terminal aesthetic with light blue accent

## Architecture

```
Binance API ──▶ Worker (Railway) ──▶ Supabase ──▶ Frontend (Vercel)
  WebSocket       Node.js/TS          PostgreSQL     Next.js 16
  + REST API      always-on           + Realtime     + Tailwind v4
  (global +       10s poll +          + Auth         + TradingView
   Binance.us)    WS stream                          lightweight-charts
```

| Component | Technology | Deployment |
|-----------|-----------|------------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4, TradingView lightweight-charts | Vercel |
| Worker | Node.js, TypeScript, WebSocket + REST polling | Railway |
| Database | PostgreSQL, Realtime subscriptions, Row Level Security | Supabase |
| Auth | Email/password with SSR cookie sessions | Supabase Auth |

### Data Flow

1. Worker connects to Binance WebSocket (with Binance.us + REST fallback)
2. Batches price updates and upserts to Supabase every 1 second
3. REST polls all symbols every 10 seconds as a supplement
4. Monitors rolling 1-hour window for 5%+ swings, inserts volatility alerts
5. Supabase Realtime broadcasts changes to connected frontends
6. Frontend receives updates via Realtime + 10s polling fallback
7. Charts fetch Binance kline data on demand via API routes

## Tracked Coins

BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, DOT, POL

## Getting Started

### Prerequisites

- Node.js 22+
- A [Supabase](https://supabase.com) project
- (For deployment) Vercel and Railway accounts

### Setup

```bash
# Clone the repo
git clone https://github.com/gbariana2/crypto_tracker.git
cd crypto_tracker

# Install dependencies
npm install

# Set up Supabase
# Run supabase/migrations/001_initial_schema.sql in the SQL editor
# Run supabase/migrations/002_user_favorites.sql in the SQL editor
# Enable REPLICA IDENTITY FULL on prices and volatility_alerts tables

# Configure environment variables
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# apps/worker/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Run the worker
cd apps/worker && npx tsx src/index.ts

# Run the frontend (in a separate terminal)
cd apps/web && npm run dev
```

## Project Structure

```
crypto_tracker/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── api/chart/      # Binance klines proxy for charts
│   │   │   ├── api/klines/     # Binance klines proxy for period changes
│   │   │   ├── auth/callback/  # Supabase auth callback
│   │   │   ├── components/     # PriceTable, CoinChart, VolatilityAlerts
│   │   │   ├── login/          # Sign in page
│   │   │   └── signup/         # Registration page
│   │   ├── lib/                # Supabase clients, types, hooks
│   │   └── middleware.ts       # Auth redirect middleware
│   └── worker/                 # Background worker
│       ├── src/                # TypeScript source
│       ├── Dockerfile          # Multi-stage Docker build
│       └── railway.json        # Railway config
├── supabase/migrations/        # SQL schema migrations
├── .mcp.json                   # Supabase MCP server config
├── CLAUDE.md                   # Full architecture documentation
└── package.json                # Root (npm workspaces)
```

## Deployment

**Frontend** — deployed to [Vercel](https://vercel.com) from `apps/web/` with env vars in the dashboard.

**Worker** — deployed to [Railway](https://railway.app) from `apps/worker/` with Dockerfile build and `node dist/index.js` start command.

Both auto-deploy on push to `main`.
