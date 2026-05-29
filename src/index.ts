import { performance } from "node:perf_hooks";
import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import {
  PAIRS,
  type ExchangeName,
  type Pair,
  type Ticker,
} from "./exchanges/types.js";
import { detectOpportunities } from "./arbitrage/detector.js";
import type { Opportunity } from "./arbitrage/types.js";
import { WalletManager } from "./wallet/manager.js";
import type { ExchangeStats, ScanCounters } from "./wallet/types.js";
import { startServer, type ServerState } from "./server.js";

console.log("Faro starting...");

const MAX_OPP_HISTORY_PER_PAIR = 100;
const EXECUTION_COOLDOWN_MS = 5000;
// 60s: tolerante a pares menos activos. Coinbase/Kraken BTC/USDT en mercados quietos
// pueden tardar 30-60s entre updates (no hay trades nuevos, libros estables).
// El circuit breaker (>2% spread = suspicious) sigue protegiendo de movimientos reales.
const EXECUTION_STALE_THRESHOLD_MS = 60_000;

const wallet = new WalletManager();
const lastExecutionByKey = new Map<string, number>();

const counters: ScanCounters = {
  opportunitiesScanned: 0,
  profitableDetected: 0,
  skippedSuspicious: 0,
  skippedStaleData: 0,
  skippedCooldown: 0,
  skippedInsufficientCapital: 0,
  lostOpportunityUSD: 0,
};

// Tickers organizados por par
const tickersByPair = new Map<Pair, Map<ExchangeName, Ticker>>();
for (const p of PAIRS) tickersByPair.set(p, new Map());

// Opportunities recientes por par
const recentOpportunitiesByPair = new Map<Pair, Opportunity[]>();
for (const p of PAIRS) recentOpportunitiesByPair.set(p, []);

interface RawExchangeStats {
  ticksReceived: number;
  firstTickAt: number;
  lastTickAt: number;
}
const exchangeStats = new Map<ExchangeName, RawExchangeStats>();

let totalEvalTimeMs = 0;
let totalEvalCount = 0;

const state: ServerState = {
  tickersByPair,
  recentOpportunitiesByPair,
  wallet,
  counters,
  getExchangeStats: () => buildExchangeStats(),
  getAvgEvalLatencyMs: () =>
    totalEvalCount > 0 ? totalEvalTimeMs / totalEvalCount : 0,
};

function execKey(pair: Pair, buy: ExchangeName, sell: ExchangeName): string {
  return `${pair}:${buy}-${sell}`;
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
  const pairTickers = tickersByPair.get(t.pair)!;
  pairTickers.set(t.exchange, t);

  if (pairTickers.size < 2) {
    totalEvalTimeMs += performance.now() - evalStart;
    totalEvalCount++;
    return;
  }

  const opps = detectOpportunities(t.pair, pairTickers);

  counters.opportunitiesScanned += opps.length;
  counters.profitableDetected += opps.filter((o) => o.profitable).length;

  const recent = recentOpportunitiesByPair.get(t.pair)!;
  if (opps.length > 0) {
    recent.unshift(opps[0]);
    if (recent.length > MAX_OPP_HISTORY_PER_PAIR) recent.pop();
  }

  const best: Opportunity | undefined = opps[0];
  if (best && best.profitable) {
    if (best.suspicious) {
      counters.skippedSuspicious++;
    } else {
      const now = Date.now();
      const buyTicker = pairTickers.get(best.buyExchange);
      const sellTicker = pairTickers.get(best.sellExchange);
      if (isTickerStale(buyTicker, now) || isTickerStale(sellTicker, now)) {
        counters.skippedStaleData++;
      } else {
        const key = execKey(best.pair, best.buyExchange, best.sellExchange);
        const lastExec = lastExecutionByKey.get(key) ?? 0;
        if (now - lastExec < EXECUTION_COOLDOWN_MS) {
          counters.skippedCooldown++;
          counters.lostOpportunityUSD += best.netProfit;
        } else {
          const executableVolume = wallet.maxExecutableVolume(best);
          if (executableVolume <= 0) {
            counters.skippedInsufficientCapital++;
          } else {
            const trade = wallet.executeTrade(best, executableVolume);
            lastExecutionByKey.set(key, now);
            console.log(
              `[EXECUTED ${trade.pair}] ${trade.buyExchange} → ${trade.sellExchange} | ` +
                `vol ${trade.executedVolume.toFixed(6)} | ` +
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
