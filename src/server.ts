import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import type { Opportunity } from "./arbitrage/types.js";
import type { ExchangeName, Ticker } from "./exchanges/types.js";
import type { WalletManager } from "./wallet/manager.js";
import type { ScanCounters } from "./wallet/types.js";

export interface ServerState {
  tickers: Map<ExchangeName, Ticker>;
  recentOpportunities: Opportunity[];
  wallet: WalletManager;
  counters: ScanCounters;
}

function snapshot(state: ServerState) {
  return {
    tickers: Array.from(state.tickers.values()),
    opportunities: state.recentOpportunities.slice(0, 20),
    wallets: state.wallet.getAllBalances(),
    executedTrades: state.wallet.getTrades(30),
    stats: state.wallet.getStats(state.tickers),
    counters: state.counters,
    timestamp: Date.now(),
  };
}

export function startServer(state: ServerState, port: number): void {
  const app = new Hono();

  app.use("/*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/state", (c) => c.json(snapshot(state)));

  app.get("/stream", (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify(snapshot(state)) });
      while (!stream.aborted) {
        await stream.sleep(200);
        await stream.writeSSE({ data: JSON.stringify(snapshot(state)) });
      }
    }),
  );

  serve({ fetch: app.fetch, port });
  console.log(`[server] listening on http://localhost:${port}`);
}
