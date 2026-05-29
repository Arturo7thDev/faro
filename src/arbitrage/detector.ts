import Decimal from "decimal.js";
import type { ExchangeName, Pair, Ticker } from "../exchanges/types.js";
import { pairToAsset } from "../exchanges/types.js";
import {
  ESTIMATED_SLIPPAGE_PCT,
  FEES,
  LATENCY_COST_PCT,
  N_TRADES_PER_REBALANCE,
  RETAIL_TAKER_PERCENT,
} from "./fees.js";
import type { Opportunity } from "./types.js";

const SUSPICIOUS_SPREAD_RATIO = 0.02;

export function detectOpportunities(
  pair: Pair,
  tickers: Map<ExchangeName, Ticker>,
): Opportunity[] {
  const entries = Array.from(tickers.entries());
  const opportunities: Opportunity[] = [];

  for (const [buyEx, buyT] of entries) {
    for (const [sellEx, sellT] of entries) {
      if (buyEx === sellEx) continue;
      if (buyT.ask >= sellT.bid) continue;
      opportunities.push(buildOpportunity(pair, buyT, sellT));
    }
  }

  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

function buildOpportunity(
  pair: Pair,
  buyT: Ticker,
  sellT: Ticker,
): Opportunity {
  const buyPrice = new Decimal(buyT.ask);
  const sellPrice = new Decimal(sellT.bid);
  const volume = Decimal.min(
    new Decimal(buyT.askQty),
    new Decimal(sellT.bidQty),
  );

  const grossSpread = sellPrice.minus(buyPrice);
  const grossProfit = grossSpread.mul(volume);

  // 1. Trading fees (taker en ambos lados)
  const buyFee = buyPrice.mul(volume).mul(FEES[buyT.exchange].takerPercent);
  const sellFee = sellPrice.mul(volume).mul(FEES[sellT.exchange].takerPercent);
  const tradingFees = buyFee.plus(sellFee);

  // 2. Withdrawal amortizado
  // Después del trade tenemos BTC extra en sellExchange (lo vendimos) y necesitamos
  // moverlo de vuelta a buyExchange. Costo: withdrawal fee × precio current, amortizado
  // sobre N trades antes de necesitar rebalance.
  const asset = pairToAsset(pair);
  const withdrawalFeeAsset =
    asset === "BTC"
      ? FEES[sellT.exchange].withdrawalBTC
      : FEES[sellT.exchange].withdrawalETH;
  // Convertimos el withdrawal del asset a USD usando el precio del trade
  const withdrawalCostUSD = new Decimal(withdrawalFeeAsset).mul(buyPrice);
  const amortizedWithdrawal = withdrawalCostUSD.div(N_TRADES_PER_REBALANCE);

  // 3. Slippage estimado (price impact más allá del top of book)
  const avgPrice = buyPrice.plus(sellPrice).div(2);
  const tradeValue = avgPrice.mul(volume).mul(2); // suma de ambas patas
  const estimatedSlippage = tradeValue.mul(ESTIMATED_SLIPPAGE_PCT);

  // 4. Latency cost (price moves adversely durante RTT)
  const latencyCost = tradeValue.mul(LATENCY_COST_PCT);

  const totalCosts = tradingFees
    .plus(amortizedWithdrawal)
    .plus(estimatedSlippage)
    .plus(latencyCost);

  const netProfit = grossProfit.minus(totalCosts);
  const netSpread = volume.eq(0)
    ? new Decimal(0)
    : netProfit.div(volume);

  // Comparativa retail (solo trading fees, sin los demás costos — los retail bots los ignoran)
  const retailBuyFee = buyPrice.mul(volume).mul(RETAIL_TAKER_PERCENT);
  const retailSellFee = sellPrice.mul(volume).mul(RETAIL_TAKER_PERCENT);
  const retailTradingFees = retailBuyFee.plus(retailSellFee);
  const retailNetProfit = grossProfit.minus(retailTradingFees);

  const spreadRatio = grossSpread.div(buyPrice).toNumber();
  const suspicious = spreadRatio > SUSPICIOUS_SPREAD_RATIO;

  return {
    timestamp: Date.now(),
    pair,
    buyExchange: buyT.exchange,
    sellExchange: sellT.exchange,
    buyPrice: buyPrice.toNumber(),
    sellPrice: sellPrice.toNumber(),
    maxVolume: volume.toNumber(),
    grossSpread: grossSpread.toNumber(),
    grossProfit: grossProfit.toNumber(),
    buyFee: buyFee.toNumber(),
    sellFee: sellFee.toNumber(),
    tradingFees: tradingFees.toNumber(),
    amortizedWithdrawal: amortizedWithdrawal.toNumber(),
    estimatedSlippage: estimatedSlippage.toNumber(),
    latencyCost: latencyCost.toNumber(),
    totalCosts: totalCosts.toNumber(),
    netProfit: netProfit.toNumber(),
    netSpread: netSpread.toNumber(),
    profitable: netProfit.gt(0),
    suspicious,
    retailTradingFees: retailTradingFees.toNumber(),
    retailNetProfit: retailNetProfit.toNumber(),
  };
}
