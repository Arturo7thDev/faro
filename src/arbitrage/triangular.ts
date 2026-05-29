import Decimal from "decimal.js";
import type { ExchangeName, Pair, Ticker } from "../exchanges/types.js";
import { FEES } from "./fees.js";

// Monto notional estandarizado para comparar oportunidades fairly entre paths
export const TRIANGULAR_NOTIONAL_USDT = 1000;

export interface TriangularLeg {
  pair: Pair;
  side: "buy" | "sell";
  price: number;
  amountIn: number;
  amountInAsset: "USDT" | "BTC" | "ETH";
  amountOut: number;
  amountOutAsset: "USDT" | "BTC" | "ETH";
  feeUSDValue: number;
}

export interface TriangularOpportunity {
  timestamp: number;
  exchange: ExchangeName;
  direction: string;
  startUSDT: number;
  finalUSDT: number;
  netProfit: number;
  netPercent: number;
  legs: [TriangularLeg, TriangularLeg, TriangularLeg];
  profitable: boolean;
}

interface ExchangeTickers {
  btcUsdt: Ticker;
  ethUsdt: Ticker;
  ethBtc: Ticker;
}

/**
 * Detecta oportunidades de arbitraje triangular DENTRO de un mismo exchange.
 *
 * Path 1: USDT → ETH → BTC → USDT
 *   leg1: buy ETH with USDT (paga ask del ETH/USDT)
 *   leg2: sell ETH for BTC (recibe bid del ETH/BTC)
 *   leg3: sell BTC for USDT (recibe bid del BTC/USDT)
 *
 * Path 2: USDT → BTC → ETH → USDT
 *   leg1: buy BTC with USDT (paga ask del BTC/USDT)
 *   leg2: buy ETH with BTC (paga ask del ETH/BTC)
 *   leg3: sell ETH for USDT (recibe bid del ETH/USDT)
 *
 * Cada leg descuenta taker fee del exchange.
 */
export function detectTriangular(
  exchange: ExchangeName,
  t: ExchangeTickers,
): TriangularOpportunity[] {
  const feePct = new Decimal(FEES[exchange].takerPercent);
  const oneMinusFee = new Decimal(1).minus(feePct);
  const notional = new Decimal(TRIANGULAR_NOTIONAL_USDT);
  const btcUsdValue = new Decimal(t.btcUsdt.bid);
  const ethUsdValue = new Decimal(t.ethUsdt.bid);

  const opps: TriangularOpportunity[] = [];

  // Path 1: USDT → ETH → BTC → USDT
  {
    const leg1Price = new Decimal(t.ethUsdt.ask);
    const leg1OutGross = notional.div(leg1Price);
    const leg1Out = leg1OutGross.mul(oneMinusFee);
    const leg1FeeUSD = leg1OutGross.minus(leg1Out).mul(leg1Price);

    const leg2Price = new Decimal(t.ethBtc.bid);
    const leg2In = leg1Out;
    const leg2OutGross = leg2In.mul(leg2Price);
    const leg2Out = leg2OutGross.mul(oneMinusFee);
    const leg2FeeUSD = leg2OutGross.minus(leg2Out).mul(btcUsdValue);

    const leg3Price = new Decimal(t.btcUsdt.bid);
    const leg3In = leg2Out;
    const leg3OutGross = leg3In.mul(leg3Price);
    const leg3Out = leg3OutGross.mul(oneMinusFee);
    const leg3FeeUSD = leg3OutGross.minus(leg3Out);

    const netProfit = leg3Out.minus(notional);

    opps.push({
      timestamp: Date.now(),
      exchange,
      direction: "USDT → ETH → BTC → USDT",
      startUSDT: notional.toNumber(),
      finalUSDT: leg3Out.toNumber(),
      netProfit: netProfit.toNumber(),
      netPercent: netProfit.div(notional).toNumber(),
      legs: [
        {
          pair: "ETH/USDT",
          side: "buy",
          price: leg1Price.toNumber(),
          amountIn: notional.toNumber(),
          amountInAsset: "USDT",
          amountOut: leg1Out.toNumber(),
          amountOutAsset: "ETH",
          feeUSDValue: leg1FeeUSD.toNumber(),
        },
        {
          pair: "ETH/BTC",
          side: "sell",
          price: leg2Price.toNumber(),
          amountIn: leg2In.toNumber(),
          amountInAsset: "ETH",
          amountOut: leg2Out.toNumber(),
          amountOutAsset: "BTC",
          feeUSDValue: leg2FeeUSD.toNumber(),
        },
        {
          pair: "BTC/USDT",
          side: "sell",
          price: leg3Price.toNumber(),
          amountIn: leg3In.toNumber(),
          amountInAsset: "BTC",
          amountOut: leg3Out.toNumber(),
          amountOutAsset: "USDT",
          feeUSDValue: leg3FeeUSD.toNumber(),
        },
      ],
      profitable: netProfit.gt(0),
    });
  }

  // Path 2: USDT → BTC → ETH → USDT
  {
    const leg1Price = new Decimal(t.btcUsdt.ask);
    const leg1OutGross = notional.div(leg1Price);
    const leg1Out = leg1OutGross.mul(oneMinusFee);
    const leg1FeeUSD = leg1OutGross.minus(leg1Out).mul(leg1Price);

    const leg2Price = new Decimal(t.ethBtc.ask);
    const leg2In = leg1Out;
    // Buying ETH with BTC: ETH = BTC / (BTC per ETH)
    const leg2OutGross = leg2In.div(leg2Price);
    const leg2Out = leg2OutGross.mul(oneMinusFee);
    const leg2FeeUSD = leg2OutGross.minus(leg2Out).mul(ethUsdValue);

    const leg3Price = new Decimal(t.ethUsdt.bid);
    const leg3In = leg2Out;
    const leg3OutGross = leg3In.mul(leg3Price);
    const leg3Out = leg3OutGross.mul(oneMinusFee);
    const leg3FeeUSD = leg3OutGross.minus(leg3Out);

    const netProfit = leg3Out.minus(notional);

    opps.push({
      timestamp: Date.now(),
      exchange,
      direction: "USDT → BTC → ETH → USDT",
      startUSDT: notional.toNumber(),
      finalUSDT: leg3Out.toNumber(),
      netProfit: netProfit.toNumber(),
      netPercent: netProfit.div(notional).toNumber(),
      legs: [
        {
          pair: "BTC/USDT",
          side: "buy",
          price: leg1Price.toNumber(),
          amountIn: notional.toNumber(),
          amountInAsset: "USDT",
          amountOut: leg1Out.toNumber(),
          amountOutAsset: "BTC",
          feeUSDValue: leg1FeeUSD.toNumber(),
        },
        {
          pair: "ETH/BTC",
          side: "buy",
          price: leg2Price.toNumber(),
          amountIn: leg2In.toNumber(),
          amountInAsset: "BTC",
          amountOut: leg2Out.toNumber(),
          amountOutAsset: "ETH",
          feeUSDValue: leg2FeeUSD.toNumber(),
        },
        {
          pair: "ETH/USDT",
          side: "sell",
          price: leg3Price.toNumber(),
          amountIn: leg3In.toNumber(),
          amountInAsset: "ETH",
          amountOut: leg3Out.toNumber(),
          amountOutAsset: "USDT",
          feeUSDValue: leg3FeeUSD.toNumber(),
        },
      ],
      profitable: netProfit.gt(0),
    });
  }

  return opps;
}

/**
 * Detecta triangular para todos los exchanges que tienen los 3 pares actualizados.
 */
export function detectAllTriangular(
  tickersByPair: Map<Pair, Map<ExchangeName, Ticker>>,
): TriangularOpportunity[] {
  const exchanges: ExchangeName[] = ["binance", "coinbase", "kraken"];
  const btcMap = tickersByPair.get("BTC/USDT");
  const ethMap = tickersByPair.get("ETH/USDT");
  const ethBtcMap = tickersByPair.get("ETH/BTC");
  if (!btcMap || !ethMap || !ethBtcMap) return [];

  const out: TriangularOpportunity[] = [];
  for (const ex of exchanges) {
    const btc = btcMap.get(ex);
    const eth = ethMap.get(ex);
    const ethBtc = ethBtcMap.get(ex);
    if (!btc || !eth || !ethBtc) continue;
    out.push(
      ...detectTriangular(ex, { btcUsdt: btc, ethUsdt: eth, ethBtc }),
    );
  }
  return out.sort((a, b) => b.netProfit - a.netProfit);
}
