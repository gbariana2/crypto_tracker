import WebSocket from "ws";
import { supabase } from "./supabase.js";
import { recordPrice, checkVolatility } from "./volatility.js";
import {
  TRACKED_SYMBOLS,
  BINANCE_WS_URL,
  HISTORY_INTERVAL_MS,
} from "./config.js";

// Map symbol -> name for easy lookup
const symbolNames = new Map(TRACKED_SYMBOLS.map((s) => [s.symbol.toLowerCase(), s.name]));

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

// Binance combined stream: !miniTicker@arr gives all tickers
// We'll use individual streams for our tracked symbols for efficiency
function buildStreamUrl(): string {
  const streams = TRACKED_SYMBOLS.map(
    (s) => `${s.symbol.toLowerCase()}@miniTicker`
  ).join("/");
  return `${BINANCE_WS_URL}/${streams}`;
}

interface BinanceMiniTicker {
  e: string;   // event type
  s: string;   // symbol
  c: string;   // close price (current)
  o: string;   // open price (24h)
  h: string;   // high (24h)
  l: string;   // low (24h)
  v: string;   // total traded base asset volume
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
  }

  // Record prices for volatility tracking and check alerts
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

function connectWebSocket(): void {
  const url = buildStreamUrl();
  console.log("Connecting to Binance WebSocket...");
  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("Connected to Binance WebSocket");
  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const ticker: BinanceMiniTicker = JSON.parse(data.toString());
      if (ticker.e === "24hrMiniTicker") {
        pendingUpdates.set(ticker.s, ticker);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on("close", () => {
    console.log("WebSocket closed, reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err: Error) => {
    console.error("WebSocket error:", err.message);
    ws.close();
  });
}

async function main(): Promise<void> {
  console.log("🚀 Crypto Tracker Worker starting...");
  console.log(`Tracking ${TRACKED_SYMBOLS.length} symbols`);

  await seedPrices();
  connectWebSocket();

  // Flush price updates to Supabase every 1 second
  setInterval(flushPriceUpdates, 1000);

  // Save history snapshots at configured interval
  setInterval(saveHistorySnapshot, HISTORY_INTERVAL_MS);

  console.log("Worker running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
