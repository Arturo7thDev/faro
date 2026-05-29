import type { ExchangeName } from "../exchanges/types.js";

export interface Opportunity {
  timestamp: number;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  buyPrice: number;
  sellPrice: number;
  maxVolumeBTC: number;
  grossSpread: number;
  grossProfit: number;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  netProfit: number;
  netSpread: number;
  profitable: boolean;
}
