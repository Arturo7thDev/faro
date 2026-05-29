import type { ExchangeName, Pair } from "../exchanges/types.js";

export interface Balance {
  usdt: number;
  btc: number;
  eth: number;
}

export interface ExecutedTrade {
  id: string;
  timestamp: number;
  pair: Pair;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  buyPrice: number;
  sellPrice: number;
  requestedVolume: number;
  executedVolume: number;
  partial: boolean;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  grossProfit: number;
  netProfit: number;
  retailNetProfit: number;
}

export interface ScanCounters {
  opportunitiesScanned: number;
  profitableDetected: number;
  skippedSuspicious: number;
  skippedStaleData: number;
  skippedCooldown: number;
  skippedInsufficientCapital: number;
  lostOpportunityUSD: number;
}

export interface RoutePerformance {
  route: string;
  count: number;
  totalProfit: number;
  avgProfit: number;
}

export interface ExchangeStats {
  exchange: ExchangeName;
  ticksReceived: number;
  ticksPerSecond: number;
  avgIntervalMs: number;
  uptimeSeconds: number;
}

export interface PortfolioStats {
  initialCapitalUSDT: number;
  initialBTC: number;
  initialETH: number;
  totalArbitrageProfit: number;
  totalTrades: number;
  totalFeesPaid: number;
  currentBTCPrice: number;
  currentETHPrice: number;
  currentPortfolioValueUSDT: number;
  hypotheticalRetailLoss: number;
  successRate: number;
  avgNetPerTrade: number;
  bestRoute: RoutePerformance | null;
  worstRoute: RoutePerformance | null;
  avgEvalLatencyMs: number;
  // Breakdown por par
  profitByPair: Record<Pair, number>;
  tradesByPair: Record<Pair, number>;
}
