import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import type { ExchangeName, Ticker } from "./exchanges/types.js";
import { detectOpportunities } from "./arbitrage/detector.js";
import type { Opportunity } from "./arbitrage/types.js";
import { WalletManager } from "./wallet/manager.js";
import type { ScanCounters } from "./wallet/types.js";
import { startServer, type ServerState } from "./server.js";

console.log("Faro starting...");

const MAX_OPP_HISTORY = 100;
const EXECUTION_COOLDOWN_MS = 5000;
// Threshold: si un ticker no se actualizó en este tiempo, NO ejecutar sobre él
const EXECUTION_STALE_THRESHOLD_MS = 10_000;

const wallet = new WalletManager();
const lastExecutionByPair = new Map<string, number>();

const counters: ScanCounters = {
  opportunitiesScanned: 0,
  profitableDetected: 0,
  skippedStaleData: 0,
};

const state: ServerState = {
  tickers: new Map<ExchangeName, Ticker>(),
  recentOpportunities: [],
  wallet,
  counters,
};

function pairKey(buy: ExchangeName, sell: ExchangeName): string {
  return `${buy}-${sell}`;
}

function isTickerStale(ticker: Ticker | undefined, now: number): boolean {
  if (!ticker) return true;
  return now - ticker.timestamp > EXECUTION_STALE_THRESHOLD_MS;
}

function onTicker(t: Ticker): void {
  state.tickers.set(t.exchange, t);
  if (state.tickers.size < 2) return;

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
  if (!best || !best.profitable) return;
  if (best.suspicious) return;

  // NUEVO: no ejecutar sobre data stale (cualquiera de los dos lados)
  const now = Date.now();
  const buyTicker = state.tickers.get(best.buyExchange);
  const sellTicker = state.tickers.get(best.sellExchange);
  if (isTickerStale(buyTicker, now) || isTickerStale(sellTicker, now)) {
    counters.skippedStaleData++;
    return;
  }

  const key = pairKey(best.buyExchange, best.sellExchange);
  const lastExec = lastExecutionByPair.get(key) ?? 0;
  if (now - lastExec < EXECUTION_COOLDOWN_MS) return;

  const executableVolume = wallet.maxExecutableVolume(best);
  if (executableVolume <= 0) return;

  const trade = wallet.executeTrade(best, executableVolume);
  lastExecutionByPair.set(key, now);

  console.log(
    `[EXECUTED] ${trade.buyExchange} → ${trade.sellExchange} | ` +
      `vol ${trade.executedVolumeBTC.toFixed(6)} BTC | ` +
      `NET +$${trade.netProfit.toFixed(2)}`,
  );
}

startBinance(onTicker);
startCoinbase(onTicker);
startKraken(onTicker);

const PORT = parseInt(process.env.PORT ?? "3001", 10);
startServer(state, PORT);
