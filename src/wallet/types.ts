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

export interface ExchangeExposure {
  exchange: ExchangeName;
  usdValue: number;
  pctOfPortfolio: number;
  usdtPct: number; // qué % de su valor en USDT
}

export interface RiskMetrics {
  maxDrawdownUSD: number;
  maxDrawdownPercent: number; // de su peak
  walletImbalance: number; // 0-1, std dev / mean del valor por exchange
  capitalDeployedPercent: number; // % del capital inicial USDT que ya se movió por trades
  exposureByExchange: ExchangeExposure[];
}

export interface FintechMetrics {
  // Risk-adjusted return metrics — estándar de la industria
  sharpeRatio: number; // mean(returns) / stddev(returns), per-trade scale
  sortinoRatio: number; // mean(returns) / stddev(negativos), penaliza solo downside
  profitFactor: number; // gross profit / |gross loss|
  winRate: number; // % de trades con net > 0

  // Latency percentiles — métricas de HFT
  evalLatencyP50: number; // ms
  evalLatencyP95: number;
  evalLatencyP99: number;

  // Alpha decay — cuánto duran las oportunidades antes de cerrarse
  avgOpportunityLifetimeMs: number;
  p95OpportunityLifetimeMs: number;
  totalOpportunityDeaths: number; // sample count
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
  risk: RiskMetrics;
  fintech: FintechMetrics;
}

export interface Decision {
  timestamp: number;
  pair: Pair;
  route: string;
  outcome:
    | "executed"
    | "stale"
    | "cooldown"
    | "suspicious"
    | "insufficient_capital";
  netProfit: number; // net que tendría/tuvo
  reason: string; // mensaje human-friendly
}
