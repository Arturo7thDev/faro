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
  retailNetProfit: number;
}

export interface ScanCounters {
  opportunitiesScanned: number;
  profitableDetected: number;
  // Skip reasons (todas suman a 'profitable but not executed')
  skippedSuspicious: number;
  skippedStaleData: number;
  skippedCooldown: number;
  skippedInsufficientCapital: number;
  // Sum de net profit de opps rentables bloqueadas por cooldown (lo que dejamos en la mesa)
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
  totalArbitrageProfit: number;
  totalTrades: number;
  totalFeesPaid: number;
  currentBTCPrice: number;
  currentPortfolioValueUSDT: number;
  hypotheticalRetailLoss: number;
  // Sprint F: strategy intelligence
  successRate: number; // profitable / scanned
  avgNetPerTrade: number;
  bestRoute: RoutePerformance | null;
  worstRoute: RoutePerformance | null;
  avgEvalLatencyMs: number; // avg ms de procesamiento de cada ticker
}
