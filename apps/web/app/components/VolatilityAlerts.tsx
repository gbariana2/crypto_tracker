"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { VolatilityAlert } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function VolatilityAlerts() {
  const [alerts, setAlerts] = useState<VolatilityAlert[]>([]);

  // Initial fetch — last 20 alerts
  useEffect(() => {
    async function fetchAlerts() {
      const { data, error } = await getSupabase()
        .from("volatility_alerts")
        .select("*")
        .order("triggered_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setAlerts(data as VolatilityAlert[]);
      }
    }
    fetchAlerts();
  }, []);

  // Realtime subscription for new alerts
  useEffect(() => {
    const sb = getSupabase();
    const channel = sb
      .channel("volatility-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "volatility_alerts" },
        (payload) => {
          const newAlert = payload.new as VolatilityAlert;
          setAlerts((prev) => [newAlert, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No volatility alerts yet. Alerts trigger when a coin moves 2%+ in 5 minutes.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isUp = alert.change_pct > 0;
        return (
          <div
            key={alert.id}
            className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
              isUp
                ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{isUp ? "\u25B2" : "\u25BC"}</span>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {alert.symbol.replace("USDT", "")}
                </span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  ${alert.price_start.toFixed(2)} → ${alert.price_end.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`font-mono font-bold ${
                  isUp ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                }`}
              >
                {isUp ? "+" : ""}{alert.change_pct.toFixed(2)}%
              </span>
              <span className="text-xs text-gray-400">{timeAgo(alert.triggered_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
