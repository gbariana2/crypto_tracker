"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { useFavorites } from "@/lib/hooks/useFavorites";
import type { Price } from "@/lib/types";

function formatPrice(price: number): string {
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatVolume(volume: number | null): string {
  if (!volume) return "-";
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
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

  // Initial fetch
  useEffect(() => {
    async function fetchPrices() {
      const { data, error } = await getSupabase()
        .from("prices")
        .select("*")
        .order("volume_24h", { ascending: false, nullsFirst: false });

      if (!error && data) {
        setPrices(data as Price[]);
      }
      setLoading(false);
    }
    fetchPrices();
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

  const displayedPrices = showFavoritesOnly
    ? prices.filter((p) => favorites.has(p.symbol))
    : prices;

  // Sort: favorites first, then by volume
  const sortedPrices = [...displayedPrices].sort((a, b) => {
    if (!showFavoritesOnly) {
      const aFav = favorites.has(a.symbol) ? 1 : 0;
      const bFav = favorites.has(b.symbol) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
    }
    return 0; // maintain existing order (by volume from query)
  });

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
        No price data yet. Make sure the worker is running and connected to Supabase.
      </div>
    );
  }

  return (
    <div>
      {/* Filter toggle */}
      <div className="mb-3 flex items-center gap-3">
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
                <th className="px-4 py-3 text-right">24h Change</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">24h High</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">24h Low</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedPrices.map((coin, i) => {
                const isPositive = coin.change_24h >= 0;
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
                        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        {isFavorite ? (
                          <span className="text-yellow-500">&#9733;</span>
                        ) : (
                          <span className="text-gray-300 hover:text-yellow-400 dark:text-gray-600">&#9734;</span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">{coin.name}</span>
                        <span className="ml-2 text-xs text-gray-400">{coin.symbol.replace("USDT", "")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900 dark:text-white">
                      ${formatPrice(coin.price)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${
                      isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}>
                      {isPositive ? "+" : ""}{coin.change_24h.toFixed(2)}%
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
