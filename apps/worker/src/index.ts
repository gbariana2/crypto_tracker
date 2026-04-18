import "dotenv/config";
import WebSocket from "ws";
import { supabase } from "./supabase.js";
import { recordPrice, checkVolatility } from "./volatility.js";
import {
  TRACKED_SYMBOLS,
  BINANCE_WS_URL,
  BINANCE_WS_URL_US,
  BINANCE_API_URL,
  BINANCE_API_URL_US,
  HISTORY_INTERVAL_MS,
} from "./config.js";

// Map symbol -> name for easy lookup
const symbolNames = new Map(TRACKED_SYMBOLS.map((s) => [s.symbol.toLowerCase(), s.name]));

// Track which Binance endpoint works
let activeApiUrl = BINANCE_API_URL;
let activeWsUrl = BINANCE_WS_URL;

// Seed the prices table with all tracked symbols
async function seedPrices(): Promise<void> {
  for (const { symbol, name } of TRACKED_SYMBOLS) {
    const { error } = await supabase
      .from("prices")
      .upsert({ symbol, name, price: 0, change_24h: 0 }, { onConflict: "symbol" });
    if (error) {
      console.error(`Failed to seed ${symbol}:`, error.message);
    }
  }
  console.log(`Seeded ${TRACKED_SYMBOLS.length} symbols in prices table`);
}

// ─── REST API polling ───

interface BinanceTicker24h {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  priceChangePercent: string;
}

async function pollRestApi(): Promise<void> {
  try {
    const symbols = TRACKED_SYMBOLS.map((s) => s.symbol);
    const url = `${activeApiUrl}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
    const res = await fetch(url);

    // If global Binance blocked, try Binance.us
    if (!res.ok && activeApiUrl === BINANCE_API_URL) {
      console.log("Global Binance API blocked, trying Binance.us...");
      activeApiUrl = BINANCE_API_URL_US;
      return pollRestApi();
    }

    if (!res.ok) {
      console.error(`REST API error: ${res.status} ${res.statusText}`);
      return;
    }

    const tickers: BinanceTicker24h[] = await res.json();

    const rows = tickers.map((t) => {
      const price = parseFloat(t.lastPrice);
      const open = parseFloat(t.openPrice);
      const change24h = open > 0 ? ((price - open) / open) * 100 : 0;

      return {
        symbol: t.symbol,
        name: symbolNames.get(t.symbol.toLowerCase()) ?? t.symbol,
        price,
        change_24h: parseFloat(change24h.toFixed(4)),
        high_24h: parseFloat(t.highPrice),
        low_24h: parseFloat(t.lowPrice),
        volume_24h: parseFloat(t.volume),
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("prices")
      .upsert(rows, { onConflict: "symbol" });

    if (error) {
      console.error("Failed to upsert prices (REST):", error.message);
    } else {
      console.log(`REST poll: updated ${rows.length} prices`);
    }

    for (const row of rows) {
      recordPrice(row.symbol, row.price);
      await checkVolatility(row.symbol, row.price);
    }
  } catch (err) {
    console.error("REST poll failed:", (err as Error).message);
  }
}

// ─── WebSocket streaming ───

interface BinanceMiniTicker {
  e: string;   // event type
  s: string;   // symbol
  c: string;   // close price (current)
  o: string;   // open price (24h)
  h: string;   // high (24h)
  l: string;   // low (24h)
  v: string;   // total traded base asset volume
}

function buildStreamUrl(): string {
  const streams = TRACKED_SYMBOLS.map(
    (s) => `${s.symbol.toLowerCase()}@miniTicker`
  ).join("/");
  return `${activeWsUrl}/${streams}`;
}

// Batch price updates — collect and flush every second
let pendingUpdates: Map<string, BinanceMiniTicker> = new Map();

async function flushPriceUpdates(): Promise<void> {
  if (pendingUpdates.size === 0) return;

  const updates = [...pendingUpdates.values()];
  pendingUpdates = new Map();

  const rows = updates.map((ticker) => {
    const price = parseFloat(ticker.c);
    const open = parseFloat(ticker.o);
    const change24h = open > 0 ? ((price - open) / open) * 100 : 0;

    return {
      symbol: ticker.s,
      name: symbolNames.get(ticker.s.toLowerCase()) ?? ticker.s,
      price,
      change_24h: parseFloat(change24h.toFixed(4)),
      high_24h: parseFloat(ticker.h),
      low_24h: parseFloat(ticker.l),
      volume_24h: parseFloat(ticker.v),
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("prices")
    .upsert(rows, { onConflict: "symbol" });

  if (error) {
    console.error("Failed to upsert prices:", error.message);
  } else {
    console.log(`WS flush: updated ${rows.length} prices (${rows.map(r => r.symbol).join(", ")})`);
  }

  for (const row of rows) {
    recordPrice(row.symbol, row.price);
    await checkVolatility(row.symbol, row.price);
  }
}

// Save price_history snapshots at regular intervals
async function saveHistorySnapshot(): Promise<void> {
  const { data, error } = await supabase
    .from("prices")
    .select("symbol, price");

  if (error) {
    console.error("Failed to fetch prices for history:", error.message);
    return;
  }

  if (!data || data.length === 0) return;

  const historyRows = data.map((row) => ({
    symbol: row.symbol,
    price: row.price,
    recorded_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("price_history")
    .insert(historyRows);

  if (insertError) {
    console.error("Failed to insert price history:", insertError.message);
  }
}

let wsConnected = false;
let wsFailCount = 0;

function connectWebSocket(): void {
  const url = buildStreamUrl();
  console.log(`Connecting to Binance WebSocket (${activeWsUrl === BINANCE_WS_URL ? "global" : "US"})...`);
  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("Connected to Binance WebSocket");
    wsConnected = true;
    wsFailCount = 0;
  });

  ws.on("message", (raw: WebSocket.Data) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Combined streams wrap data in {"stream":"...","data":{...}}
      const ticker: BinanceMiniTicker = msg.data ?? msg;
      if (ticker.e === "24hrMiniTicker" && ticker.s) {
        pendingUpdates.set(ticker.s, ticker);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on("close", () => {
    wsConnected = false;
    console.log("WebSocket closed, reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err: Error) => {
    console.error("WebSocket error:", err.message);
    wsFailCount++;

    // After 3 failures on global, try Binance.us WebSocket
    if (wsFailCount === 3 && activeWsUrl === BINANCE_WS_URL) {
      console.log("Global WebSocket blocked, trying Binance.us WebSocket...");
      activeWsUrl = BINANCE_WS_URL_US;
      ws.removeAllListeners();
      connectWebSocket();
      return;
    }

    // After 3 more failures (6 total), give up on WS and use REST
    if (wsFailCount >= 6 && !wsConnected) {
      console.log("WebSocket unavailable. Switching to REST API polling.");
      ws.removeAllListeners();
      startRestPolling();
      return;
    }

    ws.close();
  });
}

let restPollingStarted = false;

function startRestPolling(): void {
  if (restPollingStarted) return;
  restPollingStarted = true;
  console.log("Starting REST API polling every 3 seconds...");
  pollRestApi(); // immediate first poll
  setInterval(pollRestApi, 3000);
}

async function main(): Promise<void> {
  console.log("🚀 Crypto Tracker Worker starting...");
  console.log(`Tracking ${TRACKED_SYMBOLS.length} symbols`);

  await seedPrices();
  connectWebSocket();

  // Flush WebSocket price updates to Supabase every 1 second
  setInterval(flushPriceUpdates, 1000);

  // Save history snapshots at configured interval
  setInterval(saveHistorySnapshot, HISTORY_INTERVAL_MS);

  console.log("Worker running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
