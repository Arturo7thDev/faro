import Decimal from "decimal.js";
import type { ExchangeName, Ticker } from "../exchanges/types.js";
import { FEES, RETAIL_TAKER_PERCENT } from "./fees.js";
import type { Opportunity } from "./types.js";

// Circuit breaker: spread > 2% del precio = sospechoso (stale, fat finger).
// El executor NUNCA ejecuta una opportunity marcada suspicious.
const SUSPICIOUS_SPREAD_RATIO = 0.02;

export function detectOpportunities(
  tickers: Map<ExchangeName, Ticker>,
): Opportunity[] {
  const entries = Array.from(tickers.entries());
  const opportunities: Opportunity[] = [];

  for (const [buyEx, buyT] of entries) {
    for (const [sellEx, sellT] of entries) {
      if (buyEx === sellEx) continue;
      if (buyT.ask >= sellT.bid) continue;
      opportunities.push(buildOpportunity(buyT, sellT));
    }
  }

  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

function buildOpportunity(buyT: Ticker, sellT: Ticker): Opportunity {
  const buyPrice = new Decimal(buyT.ask);
  const sellPrice = new Decimal(sellT.bid);
  const volume = Decimal.min(
    new Decimal(buyT.askQty),
    new Decimal(sellT.bidQty),
  );

  const grossSpread = sellPrice.minus(buyPrice);
  const grossProfit = grossSpread.mul(volume);

  const buyFee = buyPrice.mul(volume).mul(FEES[buyT.exchange].takerPercent);
  const sellFee = sellPrice.mul(volume).mul(FEES[sellT.exchange].takerPercent);
  const totalFees = buyFee.plus(sellFee);

  const netProfit = grossProfit.minus(totalFees);
  const netSpread = volume.eq(0)
    ? new Decimal(0)
    : netProfit.div(volume);

  const retailBuyFee = buyPrice.mul(volume).mul(RETAIL_TAKER_PERCENT);
  const retailSellFee = sellPrice.mul(volume).mul(RETAIL_TAKER_PERCENT);
  const retailFees = retailBuyFee.plus(retailSellFee);
  const retailNetProfit = grossProfit.minus(retailFees);

  // Circuit breaker: spread vs precio
  const spreadRatio = grossSpread.div(buyPrice).toNumber();
  const suspicious = spreadRatio > SUSPICIOUS_SPREAD_RATIO;

  return {
    timestamp: Date.now(),
    buyExchange: buyT.exchange,
    sellExchange: sellT.exchange,
    buyPrice: buyPrice.toNumber(),
    sellPrice: sellPrice.toNumber(),
    maxVolumeBTC: volume.toNumber(),
    grossSpread: grossSpread.toNumber(),
    grossProfit: grossProfit.toNumber(),
    buyFee: buyFee.toNumber(),
    sellFee: sellFee.toNumber(),
    totalFees: totalFees.toNumber(),
    netProfit: netProfit.toNumber(),
    netSpread: netSpread.toNumber(),
    profitable: netProfit.gt(0),
    suspicious,
    retailFees: retailFees.toNumber(),
    retailNetProfit: retailNetProfit.toNumber(),
  };
}
