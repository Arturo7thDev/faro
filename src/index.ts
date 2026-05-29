import { startBinance } from "./exchanges/binance.js";
import { startCoinbase } from "./exchanges/coinbase.js";
import { startKraken } from "./exchanges/kraken.js";
import type { Ticker } from "./exchanges/types.js";

console.log("Faro starting...");

function logTicker(t: Ticker): void {
  const spread = (t.ask - t.bid).toFixed(2);
  console.log(
    `[${t.exchange.padEnd(8)}] BID: $${t.bid.toFixed(2).padStart(10)} | ASK: $${t.ask.toFixed(2).padStart(10)} | Spread: $${spread.padStart(6)}`,
  );
}

startBinance(logTicker);
startCoinbase(logTicker);
startKraken(logTicker);
