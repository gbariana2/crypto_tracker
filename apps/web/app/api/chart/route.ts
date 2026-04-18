import { NextRequest, NextResponse } from "next/server";

const PERIOD_CONFIG: Record<
  string,
  { interval: string; limit: number }
> = {
  "24h": { interval: "15m", limit: 96 }, // 15-min candles for 24h
  "1w": { interval: "1h", limit: 168 }, // 1h candles for 7 days
  "1m": { interval: "4h", limit: 180 }, // 4h candles for 30 days
  ytd: { interval: "1d", limit: 365 },
  all: { interval: "1w", limit: 500 },
};

const BINANCE_APIS = [
  "https://api.binance.com/api/v3",
  "https://api.binance.us/api/v3",
];

type BinanceKline = [
  number, string, string, string, string,
  string, number, string, number, string, string, string,
];

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number
): Promise<BinanceKline[] | null> {
  for (const base of BINANCE_APIS) {
    try {
      const res = await fetch(
        `${base}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      if (res.ok) return await res.json();
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const period = request.nextUrl.searchParams.get("period") ?? "24h";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const config = PERIOD_CONFIG[period];
  if (!config) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  const klines = await fetchKlines(symbol, config.interval, config.limit);
  if (!klines) {
    return NextResponse.json({ error: "failed to fetch" }, { status: 502 });
  }

  // Return as {time, open, high, low, close} for lightweight-charts
  const data = klines.map((k) => ({
    time: Math.floor(k[0] / 1000), // Unix seconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
