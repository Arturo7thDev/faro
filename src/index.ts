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

const wallet = new WalletManager();
const lastExecutionByPair = new Map<string, number>();

const counters: ScanCounters = {
  opportunitiesScanned: 0,
  profitableDetected: 0,
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

function onTicker(t: Ticker): void {
  state.tickers.set(t.exchange, t);
  if (state.tickers.size < 2) return;

  const opps = detectOpportunities(state.tickers);

  // Contadores acumulativos
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

  const key = pairKey(best.buyExchange, best.sellExchange);
  const lastExec = lastExecutionByPair.get(key) ?? 0;
  if (Date.now() - lastExec < EXECUTION_COOLDOWN_MS) return;

  const executableVolume = wallet.maxExecutableVolume(best);
  if (executableVolume <= 0) return;

  const trade = wallet.executeTrade(best, executableVolume);
  lastExecutionByPair.set(key, Date.now());

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
