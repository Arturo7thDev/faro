import type { ExchangeName, Pair } from "../exchanges/types.js";

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
  buyFee: number;
  sellFee: number;
  totalFees: number;
  netProfit: number;
  netSpread: number;
  profitable: boolean;
  suspicious: boolean;
  retailFees: number;
  retailNetProfit: number;
}
