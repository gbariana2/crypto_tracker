import { VOLATILITY_WINDOW_MS, VOLATILITY_THRESHOLD_PCT } from "./config.js";
import { supabase } from "./supabase.js";

interface PricePoint {
  price: number;
  timestamp: number;
}

// Rolling window of recent prices per symbol
const priceWindows: Map<string, PricePoint[]> = new Map();

export function recordPrice(symbol: string, price: number): void {
  const now = Date.now();
  if (!priceWindows.has(symbol)) {
    priceWindows.set(symbol, []);
  }
  const window = priceWindows.get(symbol)!;
  window.push({ price, timestamp: now });

  // Prune entries older than the volatility window
  const cutoff = now - VOLATILITY_WINDOW_MS;
  while (window.length > 0 && window[0].timestamp < cutoff) {
    window.shift();
  }
}

export async function checkVolatility(
  symbol: string,
  currentPrice: number
): Promise<void> {
  const window = priceWindows.get(symbol);
  if (!window || window.length < 2) return;

  const oldest = window[0];
  const changePct =
    ((currentPrice - oldest.price) / oldest.price) * 100;

  if (Math.abs(changePct) >= VOLATILITY_THRESHOLD_PCT) {
    console.log(
      `🚨 VOLATILITY ALERT: ${symbol} moved ${changePct.toFixed(2)}% in ${((Date.now() - oldest.timestamp) / 1000).toFixed(0)}s`
    );

    const { error } = await supabase.from("volatility_alerts").insert({
      symbol,
      price_start: oldest.price,
      price_end: currentPrice,
      change_pct: parseFloat(changePct.toFixed(4)),
      window_seconds: Math.round((Date.now() - oldest.timestamp) / 1000),
    });

    if (error) {
      console.error(`Failed to insert volatility alert for ${symbol}:`, error.message);
    }
  }
}
