import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import type { Opportunity } from "./arbitrage/types.js";
import type { ExchangeName, Ticker } from "./exchanges/types.js";

export interface ServerState {
  tickers: Map<ExchangeName, Ticker>;
  recentOpportunities: Opportunity[];
}

function snapshot(state: ServerState) {
  return {
    tickers: Array.from(state.tickers.values()),
    opportunities: state.recentOpportunities.slice(0, 20),
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
      // Push inmediato al conectar
      await stream.writeSSE({ data: JSON.stringify(snapshot(state)) });

      // Push periódico cada 200ms
      while (!stream.aborted) {
        await stream.sleep(200);
        await stream.writeSSE({ data: JSON.stringify(snapshot(state)) });
      }
    }),
  );

  serve({ fetch: app.fetch, port });
  console.log(`[server] listening on http://localhost:${port}`);
}
