import { performance } from "node:perf_hooks";
import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import type { ExchangeName, Ticker } from "./exchanges/types.js";
import { detectOpportunities } from "./arbitrage/detector.js";
import type { Opportunity } from "./arbitrage/types.js";
import { WalletManager } from "./wallet/manager.js";
import type { ExchangeStats, ScanCounters } from "./wallet/types.js";
import { startServer, type ServerState } from "./server.js";

console.log("Faro starting...");

const MAX_OPP_HISTORY = 100;
const EXECUTION_COOLDOWN_MS = 5000;
const EXECUTION_STALE_THRESHOLD_MS = 10_000;

const wallet = new WalletManager();
const lastExecutionByPair = new Map<string, number>();

const counters: ScanCounters = {
  opportunitiesScanned: 0,
  profitableDetected: 0,
  skippedSuspicious: 0,
  skippedStaleData: 0,
  skippedCooldown: 0,
  skippedInsufficientCapital: 0,
  lostOpportunityUSD: 0,
};

// Per-exchange stats: tick rate + uptime
interface RawExchangeStats {
  ticksReceived: number;
  firstTickAt: number;
  lastTickAt: number;
}
const exchangeStats = new Map<ExchangeName, RawExchangeStats>();

// Latency tracking: avg eval time of onTicker
let totalEvalTimeMs = 0;
let totalEvalCount = 0;

const state: ServerState = {
  tickers: new Map<ExchangeName, Ticker>(),
  recentOpportunities: [],
  wallet,
  counters,
  getExchangeStats: () => buildExchangeStats(),
  getAvgEvalLatencyMs: () =>
    totalEvalCount > 0 ? totalEvalTimeMs / totalEvalCount : 0,
};

function pairKey(buy: ExchangeName, sell: ExchangeName): string {
  return `${buy}-${sell}`;
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
    });
  } else {
    s.ticksReceived++;
    s.lastTickAt = now;
  }
}

function onTicker(t: Ticker): void {
  const evalStart = performance.now();

  trackExchangeTick(t.exchange);
  state.tickers.set(t.exchange, t);

  if (state.tickers.size < 2) {
    totalEvalTimeMs += performance.now() - evalStart;
    totalEvalCount++;
    return;
  }

  const opps = detectOpportunities(state.tickers);

  counters.opportunitiesScanned += opps.length;
  counters.profitableDetected += opps.filter((o) => o.profitable).length;

  if (opps.length > 0) {
    state.recentOpportunities.unshift(opps[0]);
    if (state.recentOpportunities.length > MAX_OPP_HISTORY) {
      state.recentOpportunities.pop();
    }
  }

  const best: Opportunity | undefined = opps[0];
  if (best && best.profitable) {
    if (best.suspicious) {
      counters.skippedSuspicious++;
    } else {
      const now = Date.now();
      const buyTicker = state.tickers.get(best.buyExchange);
      const sellTicker = state.tickers.get(best.sellExchange);
      if (isTickerStale(buyTicker, now) || isTickerStale(sellTicker, now)) {
        counters.skippedStaleData++;
      } else {
        const key = pairKey(best.buyExchange, best.sellExchange);
        const lastExec = lastExecutionByPair.get(key) ?? 0;
        if (now - lastExec < EXECUTION_COOLDOWN_MS) {
          counters.skippedCooldown++;
          counters.lostOpportunityUSD += best.netProfit;
        } else {
          const executableVolume = wallet.maxExecutableVolume(best);
          if (executableVolume <= 0) {
            counters.skippedInsufficientCapital++;
          } else {
            const trade = wallet.executeTrade(best, executableVolume);
            lastExecutionByPair.set(key, now);
            console.log(
              `[EXECUTED] ${trade.buyExchange} → ${trade.sellExchange} | ` +
                `vol ${trade.executedVolumeBTC.toFixed(6)} BTC | ` +
                `NET +$${trade.netProfit.toFixed(2)}`,
            );
          }
        }
      }
    }
  }

  totalEvalTimeMs += performance.now() - evalStart;
  totalEvalCount++;
}

startBinance(onTicker);
startCoinbase(onTicker);
startKraken(onTicker);

const PORT = parseInt(process.env.PORT ?? "3001", 10);
startServer(state, PORT);
