"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function useFavorites(userId: string | undefined) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    supabase
      .from("user_favorites")
      .select("symbol")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) {
          setFavorites(new Set(data.map((f) => f.symbol)));
        }
        setLoading(false);
      });
  }, [userId]);

  const toggleFavorite = useCallback(
    async (symbol: string) => {
      if (!userId) return;

      const supabase = getSupabase();
      const isFav = favorites.has(symbol);

      if (isFav) {
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(symbol);
          return next;
        });
        await supabase
          .from("user_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("symbol", symbol);
      } else {
        setFavorites((prev) => new Set(prev).add(symbol));
        await supabase
          .from("user_favorites")
          .insert({ user_id: userId, symbol });
      }
    },
    [userId, favorites]
  );

  return { favorites, toggleFavorite, loading };
}
