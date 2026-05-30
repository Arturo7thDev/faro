import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import type { Opportunity } from "./arbitrage/types.js";
import type { TriangularOpportunity } from "./arbitrage/triangular.js";
import type { ExchangeName, Pair, Ticker } from "./exchanges/types.js";
import { PAIRS } from "./exchanges/types.js";
import type { WalletManager } from "./wallet/manager.js";
import type { NaiveBot } from "./wallet/naive.js";
import type {
  BayesianSlippageMetrics,
  Decision,
  ExchangeStats,
  ScanCounters,
  TobiCalibration,
} from "./wallet/types.js";

const STALE_THRESHOLD_MS = 60_000;

// Lock CORS al dominio público del frontend + localhost para dev.
// Cualquier otro origin queda fuera del API público.
const ALLOWED_ORIGINS = [
  "https://faro-bot-ivory.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

// Rate limiting in-memory simple por IP. Protege /state contra abuso de
// scraping. /stream queda exento porque es conexión long-lived (la sostiene
// el browser EventSource, no es spammable).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120; // 2 req/seg sostenido permitido
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX_REQUESTS;
}

export interface ServerState {
  tickersByPair: Map<Pair, Map<ExchangeName, Ticker>>;
  recentOpportunitiesByPair: Map<Pair, Opportunity[]>;
  recentTriangular: TriangularOpportunity[];
  wallet: WalletManager;
  naive: NaiveBot;
  counters: ScanCounters;
  decisions: Decision[];
  getExchangeStats: () => ExchangeStats[];
  getAvgEvalLatencyMs: () => number;
  getEvalLatencyBuffer: () => number[];
  getOpportunityLifetimes: () => number[];
  getTobiCalibration: () => TobiCalibration;
  getBayesianSlippage: () => BayesianSlippageMetrics;
}

function snapshot(state: ServerState) {
  const now = Date.now();

  const tickersByPairObj: Record<string, ReturnType<typeof enrichTicker>[]> = {};
  for (const pair of PAIRS) {
    const m = state.tickersByPair.get(pair);
    tickersByPairObj[pair] = Array.from(m?.values() ?? []).map((t) =>
      enrichTicker(t, now),
    );
  }

  const opportunitiesByPairObj: Record<string, Opportunity[]> = {};
  for (const pair of PAIRS) {
    opportunitiesByPairObj[pair] = (
      state.recentOpportunitiesByPair.get(pair) ?? []
    ).slice(0, 20);
  }

  // Calcular stats UNA sola vez por snapshot, reusar precios para naive.
  // Antes esto se llamaba 3 veces por snapshot — fix del code review.
  const stats = state.wallet.getStats(
    state.tickersByPair,
    state.counters,
    state.getAvgEvalLatencyMs(),
    state.getEvalLatencyBuffer(),
    state.getOpportunityLifetimes(),
    state.getTobiCalibration(),
    state.getBayesianSlippage(),
  );

  return {
    tickersByPair: tickersByPairObj,
    opportunitiesByPair: opportunitiesByPairObj,
    wallets: state.wallet.getAllBalances(),
    executedTrades: state.wallet.getTrades(200),
    stats,
    counters: state.counters,
    exchangeStats: state.getExchangeStats(),
    decisions: state.decisions.slice(0, 15),
    triangularOpportunities: state.recentTriangular.slice(0, 12),
    triangularTrades: state.wallet.getTriangularTrades(20),
    naive: {
      stats: state.naive.getStats(stats.currentBTCPrice, stats.currentETHPrice),
      // Igualar la ventana con Faro (200) para que la equity curve dual
      // compare ventanas equivalentes, no Faro 200 vs Naive 20 como antes.
      recentTrades: state.naive.getTrades(200),
    },
    timestamp: now,
  };
}

function enrichTicker(t: Ticker, now: number) {
  return {
    ...t,
    stale: now - t.timestamp > STALE_THRESHOLD_MS,
    ageMs: now - t.timestamp,
  };
}

export function startServer(state: ServerState, port: number): void {
  const app = new Hono();

  // CORS restringido a los dominios autorizados (fix del code review).
  app.use(
    "/*",
    cors({
      origin: (origin) =>
        origin && ALLOWED_ORIGINS.includes(origin) ? origin : "",
      allowMethods: ["GET", "OPTIONS"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Rate limit aplicado solo a /state (request short-lived, scrapeable).
  app.get("/state", (c) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
      c.req.header("x-real-ip") ??
      "anonymous";
    if (!checkRateLimit(ip)) {
      return c.text("rate limit exceeded", 429);
    }
    return c.json(snapshot(state));
  });

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
