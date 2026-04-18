"use client";

import PriceTable from "./components/PriceTable";
import VolatilityAlerts from "./components/VolatilityAlerts";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Crypto Tracker
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Live prices from Binance with real-time volatility alerts
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Live Prices
        </h2>
        <PriceTable />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Volatility Alerts
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            (2%+ swing in 5 minutes)
          </span>
        </h2>
        <VolatilityAlerts />
      </section>
    </main>
  );
}
