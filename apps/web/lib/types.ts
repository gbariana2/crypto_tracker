export interface Price {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  high_24h: number | null;
  low_24h: number | null;
  volume_24h: number | null;
  updated_at: string;
}

export interface VolatilityAlert {
  id: number;
  symbol: string;
  price_start: number;
  price_end: number;
  change_pct: number;
  window_seconds: number;
  triggered_at: string;
}
