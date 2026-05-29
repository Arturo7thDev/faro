import type { ExchangeName } from "../exchanges/types.js";

export interface Balance {
  usdt: number;
  btc: number;
}

export interface ExecutedTrade {
  id: string;
  timestamp: number;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  buyPrice: number;
  sellPrice: number;
  requestedVolumeBTC: number;
  executedVolumeBTC: number;
  partial: boolean;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  grossProfit: number;
  netProfit: number;
}

export interface PortfolioStats {
  initialCapitalUSDT: number;
  initialBTC: number;
  totalArbitrageProfit: number;
  totalTrades: number;
  totalFeesPaid: number;
  currentBTCPrice: number;
  currentPortfolioValueUSDT: number;
}
