"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { useFavorites } from "@/lib/hooks/useFavorites";
import type { Price } from "@/lib/types";

const POLL_INTERVAL = 5; // seconds

const TIME_PERIODS = [
  { key: "24h", label: "24H" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "ALL" },
] as const;

type PeriodKey = (typeof TIME_PERIODS)[number]["key"];

function formatPrice(price: number): string {
  if (price >= 1)
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function formatVolume(volume: number | null): string {
  if (!volume) return "-";
  if (volume >= 1_000_000_000)
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toFixed(2);
}

export default function PriceTable() {
  const { user } = useAuth();
  const { favorites, toggleFavorite } = useFavorites(user?.id);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashSymbols, setFlashSymbols] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("24h");
  const [periodChanges, setPeriodChanges] = useState<Record<string, number>>(
    {}
  );
  const [periodLoading, setPeriodLoading] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const countdownRef = useRef(POLL_INTERVAL);

  // Fetch prices from Supabase
  const fetchPrices = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("prices")
      .select("*")
      .order("volume_24h", { ascending: false, nullsFirst: false });

    if (!error && data) {
      setPrices(data as Price[]);
    }
    setLoading(false);
    // Reset countdown
    countdownRef.current = POLL_INTERVAL;
    setCountdown(POLL_INTERVAL);
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchPrices();
    const pollInterval = setInterval(fetchPrices, POLL_INTERVAL * 1000);
    return () => clearInterval(pollInterval);
  }, [fetchPrices]);

  // Countdown timer (ticks every second)
  useEffect(() => {
    const timer = setInterval(() => {
      countdownRef.current = Math.max(0, countdownRef.current - 1);
      setCountdown(countdownRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const sb = getSupabase();
    const channel = sb
      .channel("prices-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prices" },
        (payload) => {
          const updated = payload.new as Price;
          setPrices((prev) =>
            prev.map((p) => (p.symbol === updated.symbol ? updated : p))
          );
          setFlashSymbols((prev) => new Set(prev).add(updated.symbol));
          setTimeout(() => {
            setFlashSymbols((prev) => {
              const next = new Set(prev);
              next.delete(updated.symbol);
              return next;
            });
          }, 500);
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  // Fetch period-specific change data from klines API
  useEffect(() => {
    if (period === "24h") {
      // Use the 24h change from Supabase directly
      setPeriodChanges({});
      return;
    }

    let cancelled = false;
    async function fetchPeriodData() {
      setPeriodLoading(true);
      try {
        const symbols = prices.map((p) => p.symbol).join(",");
        if (!symbols) return;
        const res = await fetch(
          `/api/klines?symbols=${symbols}&period=${period}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setPeriodChanges(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    }

    if (prices.length > 0) {
      fetchPeriodData();
    }

    return () => {
      cancelled = true;
    };
  }, [period, prices.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  function getChange(coin: Price): number {
    if (period === "24h") return coin.change_24h;
    return periodChanges[coin.symbol] ?? 0;
  }

  const displayedPrices = showFavoritesOnly
    ? prices.filter((p) => favorites.has(p.symbol))
    : prices;

  const sortedPrices = [...displayedPrices].sort((a, b) => {
    if (!showFavoritesOnly) {
      const aFav = favorites.has(a.symbol) ? 1 : 0;
      const bFav = favorites.has(b.symbol) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
    }
    return 0;
  });

  const periodLabel =
    TIME_PERIODS.find((p) => p.key === period)?.label ?? "24H";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (prices.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No price data yet. Make sure the worker is running and connected to
        Supabase.
      </div>
    );
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Favorites filter */}
          <button
            onClick={() => setShowFavoritesOnly(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !showFavoritesOnly
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            All Coins
          </button>
          <button
            onClick={() => setShowFavoritesOnly(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              showFavoritesOnly
                ? "bg-yellow-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            Favorites ({favorites.size})
          </button>

          {/* Divider */}
          <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Time period toggle */}
          <div className="flex rounded-md bg-gray-100 p-0.5 dark:bg-gray-800">
            {TIME_PERIODS.map((tp) => (
              <button
                key={tp.key}
                onClick={() => setPeriod(tp.key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === tp.key
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {tp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Countdown timer */}
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <div className="relative h-4 w-4">
            <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                opacity="0.2"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(countdown / POLL_INTERVAL) * 37.7} 37.7`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
          </div>
          <span className="tabular-nums">{countdown}s</span>
        </div>
      </div>

      {showFavoritesOnly && sortedPrices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          No favorites yet. Click the star icon next to a coin to add it.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <th className="w-10 px-3 py-3"></th>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">
                  {periodLabel} Change
                  {periodLoading && (
                    <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
                  )}
                </th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">
                  24h High
                </th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">
                  24h Low
                </th>
                <th className="hidden px-4 py-3 text-right md:table-cell">
                  Volume
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedPrices.map((coin, i) => {
                const change = getChange(coin);
                const isPositive = change >= 0;
                const isFlashing = flashSymbols.has(coin.symbol);
                const isFavorite = favorites.has(coin.symbol);
                return (
                  <tr
                    key={coin.symbol}
                    className={`transition-colors ${
                      isFlashing
                        ? "bg-blue-50 dark:bg-blue-950"
                        : "bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleFavorite(coin.symbol)}
                        className="text-lg leading-none transition-colors hover:scale-110"
                        title={
                          isFavorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                      >
                        {isFavorite ? (
                          <span className="text-yellow-500">&#9733;</span>
                        ) : (
                          <span className="text-gray-300 hover:text-yellow-400 dark:text-gray-600">
                            &#9734;
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {coin.name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">
                          {coin.symbol.replace("USDT", "")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900 dark:text-white">
                      ${formatPrice(coin.price)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-medium ${
                        isPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {change.toFixed(2)}%
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-300 sm:table-cell">
                      {coin.high_24h ? `$${formatPrice(coin.high_24h)}` : "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-300 sm:table-cell">
                      {coin.low_24h ? `$${formatPrice(coin.low_24h)}` : "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-300 md:table-cell">
                      {formatVolume(coin.volume_24h)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
