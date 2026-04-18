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
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
        No volatility alerts yet. Alerts trigger when a coin moves 5%+ in 1 hour.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {alerts.map((alert) => {
        const isUp = alert.change_pct > 0;
        return (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5"
          >
            <div className="flex items-center gap-3">
              <span className={`text-sm ${isUp ? "text-up" : "text-down"}`}>
                {isUp ? "\u25B2" : "\u25BC"}
              </span>
              <div>
                <span className="font-medium text-foreground">
                  {alert.symbol.replace("USDT", "")}
                </span>
                <span className="ml-2 text-xs text-muted">
                  ${alert.price_start.toFixed(2)} &rarr; ${alert.price_end.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                  isUp ? "bg-up/10 text-up" : "bg-down/10 text-down"
                }`}
              >
                {isUp ? "+" : ""}{alert.change_pct.toFixed(2)}%
              </span>
              <span className="text-xs text-muted">{timeAgo(alert.triggered_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
