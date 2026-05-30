import type { ExchangeName, Pair } from "../exchanges/types.js";
import type { SurvivalBucket } from "./orderbook.js";

export interface Opportunity {
  timestamp: number;
  pair: Pair;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  buyPrice: number;
  sellPrice: number;
  maxVolume: number;
  grossSpread: number;
  grossProfit: number;
  // Cost breakdown (todo se resta del gross)
  buyFee: number;
  sellFee: number;
  tradingFees: number; // = buyFee + sellFee
  amortizedWithdrawal: number; // costo de rebalance amortizado por trade
  estimatedSlippage: number; // price impact estimado
  latencyCost: number; // adverse movement estimado durante RTT
  totalCosts: number; // = tradingFees + amortizedWithdrawal + slippage + latency
  netProfit: number; // = grossProfit - totalCosts
  netSpread: number;
  profitable: boolean;
  suspicious: boolean;
  retailTradingFees: number;
  retailNetProfit: number;
  // TOBI signal — Top of Book Imbalance (L1)
  tobiBuy: number; // [-1, +1] imbalance del exchange donde compramos
  tobiSell: number; // [-1, +1] imbalance del exchange donde vendemos
  survivalProb: number; // [0, 1] prob de que la opp sobreviva los próximos ~200-500ms
  survivalBucket: SurvivalBucket;
}
