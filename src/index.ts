import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import type { ExchangeName, Ticker } from "./exchanges/types.js";
import { detectOpportunities } from "./arbitrage/detector.js";
import type { Opportunity } from "./arbitrage/types.js";
import { startServer } from "./server.js";

console.log("Faro starting...");

const MAX_OPP_HISTORY = 100;

const state: {
  tickers: Map<ExchangeName, Ticker>;
  recentOpportunities: Opportunity[];
} = {
  tickers: new Map(),
  recentOpportunities: [],
};

function onTicker(t: Ticker): void {
  state.tickers.set(t.exchange, t);
  if (state.tickers.size < 2) return;

  const opps = detectOpportunities(state.tickers);

  // Solo guardamos la MEJOR oportunidad del momento para evitar spam
  if (opps.length > 0) {
    state.recentOpportunities.unshift(opps[0]);
    if (state.recentOpportunities.length > MAX_OPP_HISTORY) {
      state.recentOpportunities.pop();
    }
  }
}

startBinance(onTicker);
startCoinbase(onTicker);
startKraken(onTicker);

const PORT = parseInt(process.env.PORT ?? "3001", 10);
startServer(state, PORT);
