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
  // Comparativa: este mismo trade a fees retail (0.5%) hubiera dado este net
  retailNetProfit: number;
}

export interface PortfolioStats {
  initialCapitalUSDT: number;
  initialBTC: number;
  totalArbitrageProfit: number;
  totalTrades: number;
  totalFeesPaid: number;
  currentBTCPrice: number;
  currentPortfolioValueUSDT: number;
  // Lo que un retail hubiera perdido ejecutando los MISMOS trades
  hypotheticalRetailLoss: number;
}
