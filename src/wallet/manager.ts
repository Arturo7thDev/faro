import Decimal from "decimal.js";
import {
  ESTIMATED_SLIPPAGE_PCT,
  FEES,
  LATENCY_COST_PCT,
  N_TRADES_PER_REBALANCE,
  RETAIL_TAKER_PERCENT,
} from "../arbitrage/fees.js";
import type { Opportunity } from "../arbitrage/types.js";
import type { TriangularOpportunity } from "../arbitrage/triangular.js";
import type { Asset, ExchangeName, Pair, Ticker } from "../exchanges/types.js";
import { pairToAsset } from "../exchanges/types.js";
import { computeReturnMetrics, percentile } from "./fintech.js";
import { computeKellyFromTrades, type KellyResult } from "./kelly.js";
import type {
  Balance,
  ExchangeExposure,
  ExecutedTrade,
  ExecutedTriangularTrade,
  FintechMetrics,
  KellyMetrics,
  PortfolioStats,
  RiskMetrics,
  RoutePerformance,
  ScanCounters,
  TobiCalibration,
} from "./types.js";

const INITIAL_USDT_PER_EXCHANGE = 50_000;
const INITIAL_BTC_PER_EXCHANGE = 0.5;
const INITIAL_ETH_PER_EXCHANGE = 10;
const EXCHANGES: ExchangeName[] = ["binance", "coinbase", "kraken"];

const INITIAL_CAPITAL_USDT = INITIAL_USDT_PER_EXCHANGE * EXCHANGES.length;
const INITIAL_BTC = INITIAL_BTC_PER_EXCHANGE * EXCHANGES.length;
const INITIAL_ETH = INITIAL_ETH_PER_EXCHANGE * EXCHANGES.length;

export class WalletManager {
  private balances: Map<ExchangeName, Balance> = new Map();
  private trades: ExecutedTrade[] = [];
  private triangularTrades: ExecutedTriangularTrade[] = [];
  private tradeIdCounter = 0;
  private triangularIdCounter = 0;

  constructor() {
    for (const ex of EXCHANGES) {
      this.balances.set(ex, {
        usdt: INITIAL_USDT_PER_EXCHANGE,
        btc: INITIAL_BTC_PER_EXCHANGE,
        eth: INITIAL_ETH_PER_EXCHANGE,
      });
    }
  }

  getTriangularTrades(limit = 50): ExecutedTriangularTrade[] {
    return this.triangularTrades.slice(0, limit);
  }

  private adjustAsset(b: Balance, asset: Asset, delta: number): void {
    if (asset === "USDT") b.usdt += delta;
    else if (asset === "BTC") b.btc += delta;
    else b.eth += delta;
  }

  private assetAmount(b: Balance, asset: Asset): number {
    if (asset === "USDT") return b.usdt;
    if (asset === "BTC") return b.btc;
    return b.eth;
  }

  canExecuteTriangular(opp: TriangularOpportunity): boolean {
    const w = this.balances.get(opp.exchange);
    if (!w) return false;
    // Need enough of each input asset at each step (after prior legs applied)
    let usdt = w.usdt;
    let btc = w.btc;
    let eth = w.eth;
    for (const leg of opp.legs) {
      const have =
        leg.amountInAsset === "USDT"
          ? usdt
          : leg.amountInAsset === "BTC"
            ? btc
            : eth;
      if (have < leg.amountIn) return false;
      // Apply this leg's simulated movement so the next leg sees updated balances
      if (leg.amountInAsset === "USDT") usdt -= leg.amountIn;
      else if (leg.amountInAsset === "BTC") btc -= leg.amountIn;
      else eth -= leg.amountIn;
      if (leg.amountOutAsset === "USDT") usdt += leg.amountOut;
      else if (leg.amountOutAsset === "BTC") btc += leg.amountOut;
      else eth += leg.amountOut;
    }
    return true;
  }

  executeTriangular(opp: TriangularOpportunity): ExecutedTriangularTrade {
    const wallet = this.balances.get(opp.exchange)!;
    let totalFeesUSD = 0;
    for (const leg of opp.legs) {
      this.adjustAsset(wallet, leg.amountInAsset, -leg.amountIn);
      this.adjustAsset(wallet, leg.amountOutAsset, leg.amountOut);
      totalFeesUSD += leg.feeUSDValue;
    }
    const trade: ExecutedTriangularTrade = {
      id: `tri-${++this.triangularIdCounter}`,
      timestamp: Date.now(),
      exchange: opp.exchange,
      direction: opp.direction,
      startUSDT: opp.startUSDT,
      finalUSDT: opp.finalUSDT,
      netProfit: opp.netProfit,
      netPercent: opp.netPercent,
      totalFeesUSD,
    };
    this.triangularTrades.unshift(trade);
    if (this.triangularTrades.length > 200) this.triangularTrades.pop();
    return trade;
  }

  getBalance(exchange: ExchangeName): Balance {
    return this.balances.get(exchange) ?? { usdt: 0, btc: 0, eth: 0 };
  }

  getAllBalances(): Array<{ exchange: ExchangeName } & Balance> {
    return Array.from(this.balances.entries()).map(([exchange, b]) => ({
      exchange,
      usdt: b.usdt,
      btc: b.btc,
      eth: b.eth,
    }));
  }

  getTrades(limit = 50): ExecutedTrade[] {
    return this.trades.slice(0, limit);
  }

  private assetHeld(balance: Balance, asset: "BTC" | "ETH"): number {
    return asset === "BTC" ? balance.btc : balance.eth;
  }

  private addAsset(
    balance: Balance,
    asset: "BTC" | "ETH",
    delta: number,
  ): void {
    if (asset === "BTC") balance.btc += delta;
    else balance.eth += delta;
  }

  maxExecutableVolume(opp: Opportunity): number {
    const buyWallet = this.getBalance(opp.buyExchange);
    const sellWallet = this.getBalance(opp.sellExchange);
    const asset = pairToAsset(opp.pair) as "BTC" | "ETH";

    const buyFeeMul = 1 + FEES[opp.buyExchange].takerPercent;
    const maxBuyable = buyWallet.usdt / (opp.buyPrice * buyFeeMul);
    const maxSellable = this.assetHeld(sellWallet, asset);

    return Math.min(opp.maxVolume, maxBuyable, maxSellable);
  }

  /**
   * Volumen máximo permitido por Kelly Criterion dado el bankroll actual y
   * la edge histórica observada. El bot debe usar min(maxExecutable, kelly).
   */
  kellyMaxVolume(
    opp: Opportunity,
    currentBTCPrice: number,
    currentETHPrice: number,
  ): number {
    const kelly = computeKellyFromTrades(this.trades);
    const portfolioValueUSDT = this.getPortfolioValueUSDT(
      currentBTCPrice,
      currentETHPrice,
    );
    const kellyMaxUSDT = portfolioValueUSDT * kelly.fractionalKelly;
    if (opp.buyPrice <= 0) return 0;
    return kellyMaxUSDT / opp.buyPrice;
  }

  getKellyResult(): KellyResult {
    return computeKellyFromTrades(this.trades);
  }

  getPortfolioValueUSDT(btcPrice: number, ethPrice: number): number {
    let total = 0;
    for (const b of this.balances.values()) {
      total += b.usdt + b.btc * btcPrice + b.eth * ethPrice;
    }
    return total;
  }

  executeTrade(opp: Opportunity, executedVolume: number): ExecutedTrade {
    const buyWallet = this.balances.get(opp.buyExchange)!;
    const sellWallet = this.balances.get(opp.sellExchange)!;
    const asset = pairToAsset(opp.pair) as "BTC" | "ETH";

    const volume = new Decimal(executedVolume);
    const buyPrice = new Decimal(opp.buyPrice);
    const sellPrice = new Decimal(opp.sellPrice);

    const usdtSpent = buyPrice.mul(volume);
    const buyFee = usdtSpent.mul(FEES[opp.buyExchange].takerPercent);
    const usdtReceived = sellPrice.mul(volume);
    const sellFee = usdtReceived.mul(FEES[opp.sellExchange].takerPercent);
    const tradingFees = buyFee.plus(sellFee);

    // Withdrawal amortizado
    const withdrawalFeeAsset =
      asset === "BTC"
        ? FEES[opp.sellExchange].withdrawalBTC
        : FEES[opp.sellExchange].withdrawalETH;
    const withdrawalCostUSD = new Decimal(withdrawalFeeAsset).mul(buyPrice);
    const amortizedWithdrawal = withdrawalCostUSD.div(N_TRADES_PER_REBALANCE);

    // Slippage + latency
    const avgPrice = buyPrice.plus(sellPrice).div(2);
    const tradeValue = avgPrice.mul(volume).mul(2);
    const estimatedSlippage = tradeValue.mul(ESTIMATED_SLIPPAGE_PCT);
    const latencyCost = tradeValue.mul(LATENCY_COST_PCT);

    const totalCosts = tradingFees
      .plus(amortizedWithdrawal)
      .plus(estimatedSlippage)
      .plus(latencyCost);

    // Mutación real de wallets — solo se aplican trading fees a los balances
    // (los demás costos son modelo, no afectan al saldo simulado)
    buyWallet.usdt -= usdtSpent.plus(buyFee).toNumber();
    this.addAsset(buyWallet, asset, volume.toNumber());
    this.addAsset(sellWallet, asset, -volume.toNumber());
    sellWallet.usdt += usdtReceived.minus(sellFee).toNumber();

    const grossProfit = sellPrice.minus(buyPrice).mul(volume);
    const netProfit = grossProfit.minus(totalCosts);

    // Retail comparison: solo trading fees retail (el retail no ve los otros costos tampoco)
    const retailBuyFee = usdtSpent.mul(RETAIL_TAKER_PERCENT);
    const retailSellFee = usdtReceived.mul(RETAIL_TAKER_PERCENT);
    const retailTotalFees = retailBuyFee.plus(retailSellFee);
    const retailNetProfit = grossProfit.minus(retailTotalFees);

    const trade: ExecutedTrade = {
      id: `trade-${++this.tradeIdCounter}`,
      timestamp: Date.now(),
      pair: opp.pair,
      buyExchange: opp.buyExchange,
      sellExchange: opp.sellExchange,
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      requestedVolume: opp.maxVolume,
      executedVolume,
      partial: executedVolume < opp.maxVolume * 0.999,
      tradingFees: tradingFees.toNumber(),
      amortizedWithdrawal: amortizedWithdrawal.toNumber(),
      estimatedSlippage: estimatedSlippage.toNumber(),
      latencyCost: latencyCost.toNumber(),
      totalCosts: totalCosts.toNumber(),
      grossProfit: grossProfit.toNumber(),
      netProfit: netProfit.toNumber(),
      retailNetProfit: retailNetProfit.toNumber(),
    };

    this.trades.unshift(trade);
    if (this.trades.length > 500) this.trades.pop();

    return trade;
  }

  getStats(
    tickersByPair: Map<Pair, Map<ExchangeName, Ticker>>,
    counters: ScanCounters,
    avgEvalLatencyMs: number,
    evalLatencyBuffer: number[] = [],
    opportunityLifetimes: number[] = [],
    tobiCalibration: TobiCalibration = {
      detectedHigh: 0,
      detectedMedium: 0,
      detectedLow: 0,
      survivedHigh: 0,
      survivedMedium: 0,
      survivedLow: 0,
      hitRateHigh: 0,
      hitRateMedium: 0,
      hitRateLow: 0,
    },
  ): PortfolioStats {
    const totalArbitrageProfit = this.trades.reduce(
      (sum, t) => sum + t.netProfit,
      0,
    );
    const totalTradingFees = this.trades.reduce(
      (sum, t) => sum + t.tradingFees,
      0,
    );
    const totalAmortizedWithdrawal = this.trades.reduce(
      (sum, t) => sum + t.amortizedWithdrawal,
      0,
    );
    const totalEstimatedSlippage = this.trades.reduce(
      (sum, t) => sum + t.estimatedSlippage,
      0,
    );
    const totalLatencyCost = this.trades.reduce(
      (sum, t) => sum + t.latencyCost,
      0,
    );
    const totalCosts = this.trades.reduce((sum, t) => sum + t.totalCosts, 0);
    const hypotheticalRetailLoss = this.trades.reduce(
      (sum, t) => sum + t.retailNetProfit,
      0,
    );

    const median = (arr: number[]) =>
      arr.length === 0
        ? 0
        : arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];

    const btcTickers = tickersByPair.get("BTC/USDT");
    const ethTickers = tickersByPair.get("ETH/USDT");
    const currentBTCPrice = median(
      Array.from(btcTickers?.values() ?? []).map((t) => (t.bid + t.ask) / 2),
    );
    const currentETHPrice = median(
      Array.from(ethTickers?.values() ?? []).map((t) => (t.bid + t.ask) / 2),
    );

    const totalUSDT = Array.from(this.balances.values()).reduce(
      (s, b) => s + b.usdt,
      0,
    );
    const totalBTC = Array.from(this.balances.values()).reduce(
      (s, b) => s + b.btc,
      0,
    );
    const totalETH = Array.from(this.balances.values()).reduce(
      (s, b) => s + b.eth,
      0,
    );
    const currentPortfolioValueUSDT =
      totalUSDT + totalBTC * currentBTCPrice + totalETH * currentETHPrice;

    const successRate =
      counters.opportunitiesScanned > 0
        ? counters.profitableDetected / counters.opportunitiesScanned
        : 0;
    const avgNetPerTrade =
      this.trades.length > 0 ? totalArbitrageProfit / this.trades.length : 0;

    const routeMap = new Map<string, { count: number; totalProfit: number }>();
    const pairMap: Record<Pair, number> = {
      "BTC/USDT": 0,
      "ETH/USDT": 0,
    };
    const pairCount: Record<Pair, number> = {
      "BTC/USDT": 0,
      "ETH/USDT": 0,
    };
    for (const trade of this.trades) {
      const route = `${trade.buyExchange}→${trade.sellExchange}`;
      const r = routeMap.get(route) ?? { count: 0, totalProfit: 0 };
      r.count++;
      r.totalProfit += trade.netProfit;
      routeMap.set(route, r);
      pairMap[trade.pair] += trade.netProfit;
      pairCount[trade.pair]++;
    }
    const routesArr: RoutePerformance[] = Array.from(routeMap.entries()).map(
      ([route, r]) => ({
        route,
        count: r.count,
        totalProfit: r.totalProfit,
        avgProfit: r.totalProfit / r.count,
      }),
    );
    const bestRoute =
      routesArr.length > 0
        ? routesArr.sort((a, b) => b.totalProfit - a.totalProfit)[0]
        : null;
    const worstRoute =
      routesArr.length > 0
        ? routesArr.sort((a, b) => a.totalProfit - b.totalProfit)[0]
        : null;

    const risk = this.computeRisk(currentBTCPrice, currentETHPrice);

    // Métricas fintech profesionales
    const returnMetrics = computeReturnMetrics(this.trades);
    const sortedLatency = evalLatencyBuffer.slice().sort((a, b) => a - b);
    const sortedLifetimes = opportunityLifetimes.slice().sort((a, b) => a - b);
    const avgLifetime =
      opportunityLifetimes.length > 0
        ? opportunityLifetimes.reduce((s, n) => s + n, 0) /
          opportunityLifetimes.length
        : 0;

    const fintech: FintechMetrics = {
      sharpeRatio: returnMetrics.sharpeRatio,
      sortinoRatio: returnMetrics.sortinoRatio,
      profitFactor: returnMetrics.profitFactor,
      winRate: returnMetrics.winRate,
      evalLatencyP50: percentile(sortedLatency, 50),
      evalLatencyP95: percentile(sortedLatency, 95),
      evalLatencyP99: percentile(sortedLatency, 99),
      avgOpportunityLifetimeMs: avgLifetime,
      p95OpportunityLifetimeMs: percentile(sortedLifetimes, 95),
      totalOpportunityDeaths: opportunityLifetimes.length,
    };

    // Kelly position sizing — la fracción óptima del bankroll para arriesgar
    // dada la edge observada. Solo activa después de >= 10 trades válidos.
    const kellyRes = computeKellyFromTrades(this.trades);
    const kelly: KellyMetrics = {
      fullKelly: kellyRes.fullKelly,
      fractionalKelly: kellyRes.fractionalKelly,
      winProb: kellyRes.winProb,
      edgeRatio: kellyRes.edgeRatio,
      samples: kellyRes.samples,
      isReliable: kellyRes.isReliable,
      currentPositionSizeUSDT:
        currentPortfolioValueUSDT * kellyRes.fractionalKelly,
    };

    return {
      initialCapitalUSDT: INITIAL_CAPITAL_USDT,
      initialBTC: INITIAL_BTC,
      initialETH: INITIAL_ETH,
      totalArbitrageProfit,
      totalTrades: this.trades.length,
      totalTradingFees,
      totalAmortizedWithdrawal,
      totalEstimatedSlippage,
      totalLatencyCost,
      totalCosts,
      currentBTCPrice,
      currentETHPrice,
      currentPortfolioValueUSDT,
      hypotheticalRetailLoss,
      successRate,
      avgNetPerTrade,
      bestRoute,
      worstRoute,
      avgEvalLatencyMs,
      profitByPair: pairMap,
      tradesByPair: pairCount,
      risk,
      fintech,
      tobi: tobiCalibration,
      kelly,
    };
  }

  private computeRisk(btcPrice: number, ethPrice: number): RiskMetrics {
    // Max drawdown sobre el equity curve cronológico
    const chrono = this.trades.slice().reverse(); // oldest first
    let cum = 0;
    let peak = 0;
    let maxDDAbs = 0;
    let peakAtMaxDD = 0;
    for (const t of chrono) {
      cum += t.netProfit;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDDAbs) {
        maxDDAbs = dd;
        peakAtMaxDD = peak;
      }
    }
    const maxDrawdownPercent = peakAtMaxDD > 0 ? maxDDAbs / peakAtMaxDD : 0;

    // Exposure por exchange
    const expArr: ExchangeExposure[] = Array.from(this.balances.entries()).map(
      ([exchange, b]) => {
        const usdValue = b.usdt + b.btc * btcPrice + b.eth * ethPrice;
        return {
          exchange,
          usdValue,
          pctOfPortfolio: 0, // se setea después
          usdtPct: usdValue > 0 ? b.usdt / usdValue : 0,
        };
      },
    );
    const totalValue = expArr.reduce((s, e) => s + e.usdValue, 0);
    for (const e of expArr) {
      e.pctOfPortfolio = totalValue > 0 ? e.usdValue / totalValue : 0;
    }

    // Imbalance: std dev del valor USD / mean (CV — coefficient of variation)
    const mean = expArr.length > 0 ? totalValue / expArr.length : 0;
    const variance =
      expArr.length > 0
        ? expArr.reduce((s, e) => s + Math.pow(e.usdValue - mean, 2), 0) /
          expArr.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const walletImbalance = mean > 0 ? stdDev / mean : 0;

    // Capital deployed: volumen trade USD acumulado relativo al capital inicial
    const tradedVolumeUSD = this.trades.reduce(
      (s, t) => s + t.executedVolume * t.buyPrice,
      0,
    );
    const capitalDeployedPercent =
      INITIAL_CAPITAL_USDT > 0
        ? Math.min(1, tradedVolumeUSD / INITIAL_CAPITAL_USDT)
        : 0;

    return {
      maxDrawdownUSD: maxDDAbs,
      maxDrawdownPercent,
      walletImbalance,
      capitalDeployedPercent,
      exposureByExchange: expArr,
    };
  }
}
