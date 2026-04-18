"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  ColorType,
  CandlestickSeries,
} from "lightweight-charts";

const TIME_PERIODS = [
  { key: "24h", label: "24H" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "ALL" },
] as const;

type PeriodKey = (typeof TIME_PERIODS)[number]["key"];

interface CoinChartProps {
  symbol: string;
  name: string;
  currentPrice: number;
  change24h: number;
  onClose: () => void;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export default function CoinChart({
  symbol,
  name,
  currentPrice,
  change24h,
  onClose,
}: CoinChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("24h");
  const [loading, setLoading] = useState(true);
  const [chartChange, setChartChange] = useState<number>(change24h);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e11" },
        textColor: "#848e9c",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#1b1e23" },
        horzLines: { color: "#1b1e23" },
      },
      crosshair: {
        vertLine: { color: "#3a3f4a", width: 1, style: 3 },
        horzLine: { color: "#3a3f4a", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "#1b1e23",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#1b1e23",
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderUpColor: "#0ecb81",
      borderDownColor: "#f6465d",
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Fetch chart data when period changes
  useEffect(() => {
    let cancelled = false;

    async function fetchChart() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/chart?symbol=${symbol}&period=${period}`
        );
        if (!res.ok || cancelled) return;
        const data: CandleData[] = await res.json();

        if (seriesRef.current && data.length > 0) {
          seriesRef.current.setData(
            data.map((d) => ({
              time: d.time as import("lightweight-charts").UTCTimestamp,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
            }))
          );
          chartRef.current?.timeScale().fitContent();

          // Compute change for this period
          const firstOpen = data[0].open;
          const lastClose = data[data.length - 1].close;
          if (firstOpen > 0) {
            setChartChange(
              ((lastClose - firstOpen) / firstOpen) * 100
            );
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchChart();
    return () => {
      cancelled = true;
    };
  }, [symbol, period]);

  const isPositive = chartChange >= 0;
  const ticker = symbol.replace("USDT", "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-[#1e2329] bg-[#0b0e11] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e2329] px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              {name}{" "}
              <span className="text-sm font-normal text-[#848e9c]">
                {ticker}/USDT
              </span>
            </h2>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-2xl font-bold text-white">
                $
                {currentPrice >= 1
                  ? currentPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : currentPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 6,
                    })}
              </span>
              <span
                className={`text-sm font-semibold ${
                  isPositive ? "text-[#0ecb81]" : "text-[#f6465d]"
                }`}
              >
                {isPositive ? "+" : ""}
                {chartChange.toFixed(2)}%
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#848e9c] transition-colors hover:bg-[#1e2329] hover:text-white"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Time period toggle */}
        <div className="flex gap-1 border-b border-[#1e2329] px-6 py-3">
          {TIME_PERIODS.map((tp) => (
            <button
              key={tp.key}
              onClick={() => setPeriod(tp.key)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === tp.key
                  ? "bg-[#fcd535] text-[#0b0e11]"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="relative px-2 py-2">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0e11]/80">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#fcd535] border-t-transparent" />
            </div>
          )}
          <div ref={chartContainerRef} />
        </div>
      </div>
    </div>
  );
}
