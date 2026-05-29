import Decimal from "decimal.js";
import type { ExchangeName, Ticker } from "../exchanges/types.js";
import { FEES } from "./fees.js";
import type { Opportunity } from "./types.js";

/**
 * Evalúa TODOS los pares de exchanges y devuelve las oportunidades
 * (rentables o no), ordenadas por netProfit descendente.
 *
 * Una "oportunidad" existe cuando el ask de un exchange es menor al bid
 * de otro. La rentabilidad NETA descuenta los taker fees de ambos lados.
 */
export function detectOpportunities(
  tickers: Map<ExchangeName, Ticker>,
): Opportunity[] {
  const entries = Array.from(tickers.entries());
  const opportunities: Opportunity[] = [];

  for (const [buyEx, buyT] of entries) {
    for (const [sellEx, sellT] of entries) {
      if (buyEx === sellEx) continue;
      // Skip si no hay spread bruto positivo
      if (buyT.ask >= sellT.bid) continue;

      opportunities.push(buildOpportunity(buyT, sellT));
    }
  }

  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

function buildOpportunity(buyT: Ticker, sellT: Ticker): Opportunity {
  const buyPrice = new Decimal(buyT.ask);
  const sellPrice = new Decimal(sellT.bid);

  // Volume cap = mínimo entre liquidez disponible en ambos topes de libro
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
  };
}
