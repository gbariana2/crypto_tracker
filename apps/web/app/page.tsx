"use client";

import PriceTable from "./components/PriceTable";
import VolatilityAlerts from "./components/VolatilityAlerts";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Markets
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Real-time prices powered by Binance
        </p>
      </header>

      <section className="mb-8">
        <PriceTable />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Volatility Alerts
          <span className="ml-2 font-normal">
            2%+ swing in 5 min
          </span>
        </h2>
        <VolatilityAlerts />
      </section>
    </main>
  );
}
