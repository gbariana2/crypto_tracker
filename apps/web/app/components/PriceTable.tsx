"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { useFavorites } from "@/lib/hooks/useFavorites";
import CoinChart from "./CoinChart";
import type { Price } from "@/lib/types";

const POLL_INTERVAL = 10; // seconds — matches worker REST poll frequency

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
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("24h");
  const [periodChanges, setPeriodChanges] = useState<Record<string, number>>({});
  const [periodLoading, setPeriodLoading] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const countdownRef = useRef(POLL_INTERVAL);
  const [priceDirection, setPriceDirection] = useState<Record<string, "up" | "down">>({});
  const prevPricesRef = useRef<Record<string, number>>({});
  const [selectedCoin, setSelectedCoin] = useState<Price | null>(null);
  const [noChange, setNoChange] = useState(false);

  const updateDirections = useCallback((newPrices: Price[]): boolean => {
    const directions: Record<string, "up" | "down"> = {};
    for (const p of newPrices) {
      const prev = prevPricesRef.current[p.symbol];
      if (prev !== undefined && p.price !== prev) {
        directions[p.symbol] = p.price > prev ? "up" : "down";
      }
    }
    const hadChanges = Object.keys(directions).length > 0;
    if (hadChanges) {
      setPriceDirection((prev) => ({ ...prev, ...directions }));
      setTimeout(() => {
        setPriceDirection((prev) => {
          const next = { ...prev };
          for (const sym of Object.keys(directions)) delete next[sym];
          return next;
        });
      }, 800);
    }
    const priceMap: Record<string, number> = {};
    for (const p of newPrices) priceMap[p.symbol] = p.price;
    prevPricesRef.current = priceMap;
    return hadChanges;
  }, []);

  const fetchPrices = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("prices")
      .select("*")
      .order("volume_24h", { ascending: false, nullsFirst: false });

    if (!error && data) {
      const newPrices = data as Price[];
      const hadChanges = updateDirections(newPrices);
      setPrices(newPrices);

      // Show "no change" briefly if nothing moved
      if (!hadChanges && Object.keys(prevPricesRef.current).length > 0) {
        setNoChange(true);
        setTimeout(() => setNoChange(false), 1500);
      }
    }
    setLoading(false);
    countdownRef.current = POLL_INTERVAL;
    setCountdown(POLL_INTERVAL);
  }, [updateDirections]);

  useEffect(() => {
    fetchPrices();
    const pollInterval = setInterval(fetchPrices, POLL_INTERVAL * 1000);
    return () => clearInterval(pollInterval);
  }, [fetchPrices]);

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
          const prev = prevPricesRef.current[updated.symbol];
          if (prev !== undefined && updated.price !== prev) {
            const dir = updated.price > prev ? "up" : "down";
            setPriceDirection((p) => ({ ...p, [updated.symbol]: dir }));
            setTimeout(() => {
              setPriceDirection((p) => {
                const next = { ...p };
                delete next[updated.symbol];
                return next;
              });
            }, 800);
          }
          prevPricesRef.current[updated.symbol] = updated.price;
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  // Fetch period-specific changes
  useEffect(() => {
    if (period === "24h") {
      setPeriodChanges({});
      return;
    }

    let cancelled = false;
    async function fetchPeriodData() {
      setPeriodLoading(true);
      try {
        const symbols = prices.map((p) => p.symbol).join(",");
        if (!symbols) return;
        const res = await fetch(`/api/klines?symbols=${symbols}&period=${period}`);
        if (res.ok && !cancelled) {
          setPeriodChanges(await res.json());
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    }
    if (prices.length > 0) fetchPeriodData();
    return () => { cancelled = true; };
  }, [period, prices.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  function getChange(coin: Price): number {
    if (period === "24h") return coin.change_24h;
    return periodChanges[coin.symbol] ?? 0;
  }

  const filteredByTab = showFavoritesOnly
    ? prices.filter((p) => favorites.has(p.symbol))
    : prices;

  const displayedPrices = searchQuery
    ? filteredByTab.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredByTab;

  const sortedPrices = [...displayedPrices].sort((a, b) => {
    if (!showFavoritesOnly) {
      const aFav = favorites.has(a.symbol) ? 1 : 0;
      const bFav = favorites.has(b.symbol) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
    }
    return 0;
  });

  const periodLabel = TIME_PERIODS.find((p) => p.key === period)?.label ?? "24H";

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="w-10 px-3 py-3"></th>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">High</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">Low</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">Vol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="bg-background">
                <td className="px-3 py-3"><div className="h-4 w-4 animate-pulse rounded bg-surface-hover" /></td>
                <td className="px-4 py-3"><div className="h-4 w-4 animate-pulse rounded bg-surface-hover" /></td>
                <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-surface-hover" /></td>
                <td className="px-4 py-3 text-right"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-surface-hover" /></td>
                <td className="px-4 py-3 text-right"><div className="ml-auto h-4 w-14 animate-pulse rounded bg-surface-hover" /></td>
                <td className="hidden px-4 py-3 text-right sm:table-cell"><div className="ml-auto h-4 w-16 animate-pulse rounded bg-surface-hover" /></td>
                <td className="hidden px-4 py-3 text-right sm:table-cell"><div className="ml-auto h-4 w-16 animate-pulse rounded bg-surface-hover" /></td>
                <td className="hidden px-4 py-3 text-right md:table-cell"><div className="ml-auto h-4 w-14 animate-pulse rounded bg-surface-hover" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (prices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
        No price data yet. Make sure the worker is running.
      </div>
    );
  }

  return (
    <>
      {/* Chart modal */}
      {selectedCoin && (
        <CoinChart
          symbol={selectedCoin.symbol}
          name={selectedCoin.name}
          currentPrice={selectedCoin.price}
          change24h={selectedCoin.change_24h}
          onClose={() => setSelectedCoin(null)}
        />
      )}

      <div>
        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coins..."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:max-w-xs"
          />
        </div>

        {/* Controls */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFavoritesOnly(false)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                !showFavoritesOnly
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setShowFavoritesOnly(true)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                showFavoritesOnly
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Favorites ({favorites.size})
            </button>

            <div className="mx-2 h-4 w-px bg-border" />

            <div className="flex rounded bg-surface p-0.5">
              {TIME_PERIODS.map((tp) => (
                <button
                  key={tp.key}
                  onClick={() => setPeriod(tp.key)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    period === tp.key
                      ? "bg-surface-hover text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {tp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Countdown / No change indicator */}
          <div className="flex items-center gap-2 text-xs text-muted">
            {noChange ? (
              <span className="animate-pulse text-muted">No change</span>
            ) : (
              <>
                <div className="relative h-4 w-4">
                  <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
                    <circle
                      cx="8" cy="8" r="6"
                      fill="none" stroke="currentColor" strokeWidth="2" opacity="0.15"
                    />
                    <circle
                      cx="8" cy="8" r="6"
                      fill="none" stroke="var(--accent)" strokeWidth="2"
                      strokeDasharray={`${(countdown / POLL_INTERVAL) * 37.7} 37.7`}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                </div>
                <span className="tabular-nums">{countdown}s</span>
              </>
            )}
          </div>
        </div>

        {showFavoritesOnly && sortedPrices.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
            No favorites yet. Star a coin to add it.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">
                    {periodLabel} Chg
                    {periodLoading && (
                      <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border border-muted border-t-accent" />
                    )}
                  </th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">High</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">Low</th>
                  <th className="hidden px-4 py-3 text-right md:table-cell">Vol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedPrices.map((coin, i) => {
                  const change = getChange(coin);
                  const isPositive = change >= 0;
                  const isFavorite = favorites.has(coin.symbol);
                  const dir = priceDirection[coin.symbol];
                  return (
                    <tr
                      key={coin.symbol}
                      onClick={() => setSelectedCoin(coin)}
                      className="cursor-pointer bg-background transition-colors hover:bg-surface"
                    >
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(coin.symbol);
                          }}
                          className="text-base leading-none transition-colors hover:scale-110"
                        >
                          {isFavorite ? (
                            <span className="text-accent">&#9733;</span>
                          ) : (
                            <span className="text-muted/40 hover:text-accent">&#9734;</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {coin.name}
                        </span>
                        <span className="ml-2 text-xs text-muted">
                          {coin.symbol.replace("USDT", "")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        <span
                          className={`transition-colors duration-700 ${
                            dir === "up"
                              ? "text-up"
                              : dir === "down"
                                ? "text-down"
                                : "text-foreground"
                          }`}
                        >
                          ${formatPrice(coin.price)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            isPositive
                              ? "bg-up/10 text-up"
                              : "bg-down/10 text-down"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {change.toFixed(2)}%
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-muted sm:table-cell">
                        {coin.high_24h ? `$${formatPrice(coin.high_24h)}` : "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-muted sm:table-cell">
                        {coin.low_24h ? `$${formatPrice(coin.low_24h)}` : "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-muted md:table-cell">
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
    </>
  );
}
