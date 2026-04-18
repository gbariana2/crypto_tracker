import { NextRequest, NextResponse } from "next/server";

// Time period -> Binance kline interval + how far back to look
const PERIOD_CONFIG: Record<string, { interval: string; limit: number }> = {
  "24h": { interval: "1d", limit: 1 },
  "1w": { interval: "1w", limit: 1 },
  "1m": { interval: "1M", limit: 1 },
  ytd: { interval: "1d", limit: 365 },
  all: { interval: "1M", limit: 100 },
};

const BINANCE_APIS = [
  "https://api.binance.com/api/v3",
  "https://api.binance.us/api/v3",
];

// Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
// All values come as mixed string/number from the API
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number
): Promise<BinanceKline[] | null> {
  for (const base of BINANCE_APIS) {
    try {
      const url = `${base}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      continue;
    }
  }
  return null;
}

function computeChange(openPrice: number, currentPrice: number): number {
  if (openPrice === 0) return 0;
  return ((currentPrice - openPrice) / openPrice) * 100;
}

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get("symbols");
  const period = request.nextUrl.searchParams.get("period") ?? "24h";

  if (!symbols) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const config = PERIOD_CONFIG[period];
  if (!config) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  const symbolList = symbols.split(",");
  const results: Record<string, number> = {};

  await Promise.all(
    symbolList.map(async (symbol) => {
      const klines = await fetchKlines(symbol, config.interval, config.limit);
      if (!klines || klines.length === 0) {
        results[symbol] = 0;
        return;
      }

      const lastKline = klines[klines.length - 1];
      const currentPrice = parseFloat(lastKline[4]); // close price

      if (period === "ytd") {
        const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
        let openPrice = parseFloat(klines[0][1]);
        for (const k of klines) {
          if (k[0] >= yearStart) {
            openPrice = parseFloat(k[1]);
            break;
          }
        }
        results[symbol] = computeChange(openPrice, currentPrice);
      } else {
        // 24h, 1w, 1m, all — use the open of the first candle
        const openPrice = parseFloat(klines[0][1]);
        results[symbol] = computeChange(openPrice, currentPrice);
      }
    })
  );

  return NextResponse.json(results, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
