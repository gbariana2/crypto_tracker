// Tracked symbols (Binance uses uppercase pairs like BTCUSDT)
export const TRACKED_SYMBOLS = [
  { symbol: "BTCUSDT", name: "Bitcoin" },
  { symbol: "ETHUSDT", name: "Ethereum" },
  { symbol: "BNBUSDT", name: "BNB" },
  { symbol: "SOLUSDT", name: "Solana" },
  { symbol: "XRPUSDT", name: "XRP" },
  { symbol: "ADAUSDT", name: "Cardano" },
  { symbol: "DOGEUSDT", name: "Dogecoin" },
  { symbol: "AVAXUSDT", name: "Avalanche" },
  { symbol: "DOTUSDT", name: "Polkadot" },
  { symbol: "POLUSDT", name: "Polygon" },
];

// Volatility threshold: flag if price changes more than this % in 1 hour
export const VOLATILITY_THRESHOLD_PCT = 5.0;

// Rolling window for volatility check (in milliseconds)
export const VOLATILITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// How often to save price_history snapshots (in milliseconds)
export const HISTORY_INTERVAL_MS = 30 * 1000; // every 30 seconds

// Binance endpoints — try global first, fall back to Binance.us for US IPs
export const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws";
export const BINANCE_WS_URL_US = "wss://stream.binance.us:9443/ws";
export const BINANCE_API_URL = "https://api.binance.com/api/v3";
export const BINANCE_API_URL_US = "https://api.binance.us/api/v3";
