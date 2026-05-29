import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import type { ExchangeName, Ticker } from "./exchanges/types.js";
import { detectOpportunities } from "./arbitrage/detector.js";

console.log("Faro starting...");

const tickers = new Map<ExchangeName, Ticker>();

function onTicker(t: Ticker): void {
  tickers.set(t.exchange, t);

  // Necesitamos al menos 2 exchanges para detectar arbitraje
  if (tickers.size < 2) return;

  const opps = detectOpportunities(tickers);

  for (const opp of opps) {
    const verdict = opp.profitable ? "RENTABLE  " : "DESCARTADA";
    console.log(
      `[${verdict}] ${opp.buyExchange.padEnd(8)} $${opp.buyPrice.toFixed(2).padStart(10)} → ` +
        `${opp.sellExchange.padEnd(8)} $${opp.sellPrice.toFixed(2).padStart(10)} | ` +
        `vol ${opp.maxVolumeBTC.toFixed(5)} BTC | ` +
        `gross $${opp.grossProfit.toFixed(2).padStart(8)} | ` +
        `fees $${opp.totalFees.toFixed(2).padStart(8)} | ` +
        `NET $${opp.netProfit.toFixed(2).padStart(9)}`,
    );
  }
}

startBinance(onTicker);
startCoinbase(onTicker);
startKraken(onTicker);
