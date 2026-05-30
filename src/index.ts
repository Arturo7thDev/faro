import { performance } from "node:perf_hooks";
import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import { measureLatency } from "./exchanges/latency.js";
import { startRestFallback } from "./exchanges/restPoller.js";
import {
  PAIRS,
  type ExchangeName,
  type Pair,
  type Ticker,
} from "./exchanges/types.js";
import { detectOpportunities } from "./arbitrage/detector.js";
import type { Opportunity } from "./arbitrage/types.js";
import {
  detectAllTriangular,
  type TriangularOpportunity,
} from "./arbitrage/triangular.js";
import { WalletManager } from "./wallet/manager.js";
import { NaiveBot } from "./wallet/naive.js";
import type {
  Decision,
  ExchangeStats,
  ScanCounters,
} from "./wallet/types.js";
import { startServer, type ServerState } from "./server.js";

console.log("Faro starting...");

const MAX_OPP_HISTORY_PER_PAIR = 100;
const MAX_DECISIONS = 50;
const MAX_TRIANGULAR_HISTORY = 50;
const EXECUTION_COOLDOWN_MS = 3000;
const TRIANGULAR_COOLDOWN_MS = 5000;
const EXECUTION_STALE_THRESHOLD_MS = 60_000;
const LATENCY_PING_INTERVAL_MS = 30_000;

const wallet = new WalletManager();
const naive = new NaiveBot();
const lastExecutionByKey = new Map<string, number>();
const lastTriangularByExchange = new Map<ExchangeName, number>();

const counters: ScanCounters = {
  opportunitiesScanned: 0,
  profitableDetected: 0,
  skippedSuspicious: 0,
  skippedStaleData: 0,
  skippedCooldown: 0,
  skippedInsufficientCapital: 0,
  lostOpportunityUSD: 0,
};

const tickersByPair = new Map<Pair, Map<ExchangeName, Ticker>>();
for (const p of PAIRS) tickersByPair.set(p, new Map());

const recentOpportunitiesByPair = new Map<Pair, Opportunity[]>();
for (const p of PAIRS) recentOpportunitiesByPair.set(p, []);

const recentTriangular: TriangularOpportunity[] = [];

const decisions: Decision[] = [];

interface RawExchangeStats {
  ticksReceived: number;
  firstTickAt: number;
  lastTickAt: number;
  networkLatencyMs: number;
  networkLatencyAt: number;
}
const exchangeStats = new Map<ExchangeName, RawExchangeStats>();

let totalEvalTimeMs = 0;
let totalEvalCount = 0;

const state: ServerState = {
  tickersByPair,
  recentOpportunitiesByPair,
  recentTriangular,
  wallet,
  naive,
  counters,
  decisions,
  getExchangeStats: () => buildExchangeStats(),
  getAvgEvalLatencyMs: () =>
    totalEvalCount > 0 ? totalEvalTimeMs / totalEvalCount : 0,
};

function execKey(pair: Pair, buy: ExchangeName, sell: ExchangeName): string {
  return `${pair}:${buy}-${sell}`;
}

function recordDecision(
  opp: Opportunity,
  outcome: Decision["outcome"],
  reason: string,
): void {
  decisions.unshift({
    timestamp: Date.now(),
    pair: opp.pair,
    route: `${opp.buyExchange}→${opp.sellExchange}`,
    outcome,
    netProfit: opp.netProfit,
    reason,
  });
  if (decisions.length > MAX_DECISIONS) decisions.pop();
}

function isTickerStale(ticker: Ticker | undefined, now: number): boolean {
  if (!ticker) return true;
  return now - ticker.timestamp > EXECUTION_STALE_THRESHOLD_MS;
}

function buildExchangeStats(): ExchangeStats[] {
  const now = Date.now();
  return Array.from(exchangeStats.entries()).map(([exchange, s]) => {
    const elapsedSec = (now - s.firstTickAt) / 1000;
    return {
      exchange,
      ticksReceived: s.ticksReceived,
      ticksPerSecond: elapsedSec > 0 ? s.ticksReceived / elapsedSec : 0,
      avgIntervalMs:
        s.ticksReceived > 1 ? (now - s.firstTickAt) / s.ticksReceived : 0,
      uptimeSeconds: elapsedSec,
      networkLatencyMs: s.networkLatencyMs,
      networkLatencyAt: s.networkLatencyAt,
    };
  });
}

function trackExchangeTick(exchange: ExchangeName): void {
  const now = Date.now();
  const s = exchangeStats.get(exchange);
  if (!s) {
    exchangeStats.set(exchange, {
      ticksReceived: 1,
      firstTickAt: now,
      lastTickAt: now,
      networkLatencyMs: 0,
      networkLatencyAt: 0,
    });
  } else {
    s.ticksReceived++;
    s.lastTickAt = now;
  }
}

async function pingAllExchanges(): Promise<void> {
  const exchanges: ExchangeName[] = ["binance", "coinbase", "kraken"];
  const results = await Promise.all(
    exchanges.map(async (ex) => ({ ex, ms: await measureLatency(ex) })),
  );
  const now = Date.now();
  for (const { ex, ms } of results) {
    if (ms === null) continue;
    let s = exchangeStats.get(ex);
    if (!s) {
      s = {
        ticksReceived: 0,
        firstTickAt: now,
        lastTickAt: now,
        networkLatencyMs: ms,
        networkLatencyAt: now,
      };
      exchangeStats.set(ex, s);
    } else {
      s.networkLatencyMs = ms;
      s.networkLatencyAt = now;
    }
  }
}

function evaluateTriangular(now: number): void {
  const triOpps = detectAllTriangular(tickersByPair);
  if (triOpps.length === 0) return;

  // Mantener buffer de mejores oportunidades recientes (rentables o no, para mostrar)
  const top = triOpps[0];
  recentTriangular.unshift(top);
  if (recentTriangular.length > MAX_TRIANGULAR_HISTORY) recentTriangular.pop();

  // Ejecutar la mejor opportunity rentable si:
  // - no es stale (todos los tickers fresh)
  // - pasa cooldown del exchange
  // - hay capital
  for (const opp of triOpps) {
    if (!opp.profitable) break; // ordenado descendiente
    const btcMap = tickersByPair.get("BTC/USDT")?.get(opp.exchange);
    const ethMap = tickersByPair.get("ETH/USDT")?.get(opp.exchange);
    const ethBtcMap = tickersByPair.get("ETH/BTC")?.get(opp.exchange);
    if (
      isTickerStale(btcMap, now) ||
      isTickerStale(ethMap, now) ||
      isTickerStale(ethBtcMap, now)
    ) {
      continue;
    }
    const lastTri = lastTriangularByExchange.get(opp.exchange) ?? 0;
    if (now - lastTri < TRIANGULAR_COOLDOWN_MS) continue;
    if (!wallet.canExecuteTriangular(opp)) continue;

    const trade = wallet.executeTriangular(opp);
    lastTriangularByExchange.set(opp.exchange, now);
    console.log(
      `[TRIANGULAR ${trade.exchange}] ${trade.direction} | ` +
        `${trade.startUSDT.toFixed(0)} → ${trade.finalUSDT.toFixed(2)} | ` +
        `NET +$${trade.netProfit.toFixed(4)}`,
    );
    return; // solo una ejecución triangular por tick
  }
}

function onTicker(t: Ticker): void {
  // Guard: descartar tickers malformados antes de que el NaN/0/Infinity
  // se cuele al detector y termine corrompiendo balances del wallet.
  // Fix del code review (issue crítico).
  if (
    !Number.isFinite(t.bid) ||
    !Number.isFinite(t.ask) ||
    !Number.isFinite(t.bidQty) ||
    !Number.isFinite(t.askQty) ||
    t.bid <= 0 ||
    t.ask <= 0 ||
    t.ask < t.bid
  ) {
    return;
  }

  const evalStart = performance.now();

  trackExchangeTick(t.exchange);
  const pairTickers = tickersByPair.get(t.pair)!;
  pairTickers.set(t.exchange, t);

  // Linear arbitrage solo aplica a BTC/USDT y ETH/USDT (los pares fiat-anchor)
  if (t.pair === "BTC/USDT" || t.pair === "ETH/USDT") {
    if (pairTickers.size >= 2) {
      const opps = detectOpportunities(t.pair, pairTickers);
      counters.opportunitiesScanned += opps.length;
      counters.profitableDetected += opps.filter((o) => o.profitable).length;

      const recent = recentOpportunitiesByPair.get(t.pair)!;
      if (opps.length > 0) {
        recent.unshift(opps[0]);
        if (recent.length > MAX_OPP_HISTORY_PER_PAIR) recent.pop();
      }

      // NAIVE BOT: ejecuta sobre la misma data pero con filtro "gross > 0"
      // y fees retail. Sirve para la comparativa en vivo.
      naive.evaluate(opps, Date.now());

      const best: Opportunity | undefined = opps[0];
      if (best && best.profitable) {
        if (best.suspicious) {
          counters.skippedSuspicious++;
          recordDecision(
            best,
            "suspicious",
            "spread > 2% — probable data vieja o fat finger",
          );
        } else {
          const now = Date.now();
          const buyTicker = pairTickers.get(best.buyExchange);
          const sellTicker = pairTickers.get(best.sellExchange);
          if (isTickerStale(buyTicker, now) || isTickerStale(sellTicker, now)) {
            counters.skippedStaleData++;
            recordDecision(best, "stale", "ticker con más de 60s de antigüedad");
          } else {
            const key = execKey(best.pair, best.buyExchange, best.sellExchange);
            const lastExec = lastExecutionByKey.get(key) ?? 0;
            if (now - lastExec < EXECUTION_COOLDOWN_MS) {
              counters.skippedCooldown++;
              counters.lostOpportunityUSD += best.netProfit;
              recordDecision(best, "cooldown", "misma ruta ejecutada hace menos de 3s");
            } else {
              const executableVolume = wallet.maxExecutableVolume(best);
              if (executableVolume <= 0) {
                counters.skippedInsufficientCapital++;
                recordDecision(
                  best,
                  "insufficient_capital",
                  "wallet sin capital disponible",
                );
              } else {
                const trade = wallet.executeTrade(best, executableVolume);
                lastExecutionByKey.set(key, now);
                recordDecision(
                  best,
                  "executed",
                  `vol ${trade.executedVolume.toFixed(6)} · neto +$${trade.netProfit.toFixed(2)}`,
                );
                console.log(
                  `[LINEAR ${trade.pair}] ${trade.buyExchange} → ${trade.sellExchange} | ` +
                    `vol ${trade.executedVolume.toFixed(6)} | ` +
                    `NET +$${trade.netProfit.toFixed(2)}`,
                );
              }
            }
          }
        }
      }
    }
  }

  // Triangular: cualquier ticker puede haber cambiado el cycle. Evaluar.
  evaluateTriangular(Date.now());

  totalEvalTimeMs += performance.now() - evalStart;
  totalEvalCount++;
}

startBinance(onTicker);
startCoinbase(onTicker);
startKraken(onTicker);

// REST polling fallback: ETH/BTC en Coinbase y Kraken (pares ilíquidos
// donde el WS pushea esporádicamente). Cada 5s mantiene el ticker fresco.
startRestFallback(onTicker);

pingAllExchanges();
setInterval(pingAllExchanges, LATENCY_PING_INTERVAL_MS);

const PORT = parseInt(process.env.PORT ?? "3001", 10);
startServer(state, PORT);
