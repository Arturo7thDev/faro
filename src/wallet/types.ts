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
  // Cost breakdown completo
  tradingFees: number;
  amortizedWithdrawal: number;
  estimatedSlippage: number;
  latencyCost: number;
  totalCosts: number;
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
  // Real network latency measured via REST ping cada 30s
  networkLatencyMs: number;
  networkLatencyAt: number; // timestamp último ping
}

export interface PortfolioStats {
  initialCapitalUSDT: number;
  initialBTC: number;
  initialETH: number;
  totalArbitrageProfit: number;
  totalTrades: number;
  totalTradingFees: number;
  totalAmortizedWithdrawal: number;
  totalEstimatedSlippage: number;
  totalLatencyCost: number;
  totalCosts: number;
  currentBTCPrice: number;
  currentETHPrice: number;
  currentPortfolioValueUSDT: number;
  hypotheticalRetailLoss: number;
  successRate: number;
  avgNetPerTrade: number;
  bestRoute: RoutePerformance | null;
  worstRoute: RoutePerformance | null;
  avgEvalLatencyMs: number;
  profitByPair: Record<Pair, number>;
  tradesByPair: Record<Pair, number>;
}
