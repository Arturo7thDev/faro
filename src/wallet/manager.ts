import Decimal from "decimal.js";
import { FEES, RETAIL_TAKER_PERCENT } from "../arbitrage/fees.js";
import type { Opportunity } from "../arbitrage/types.js";
import type { ExchangeName, Pair, Ticker } from "../exchanges/types.js";
import { pairToAsset } from "../exchanges/types.js";
import type {
  Balance,
  ExecutedTrade,
  PortfolioStats,
  RoutePerformance,
  ScanCounters,
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
  private tradeIdCounter = 0;

  constructor() {
    for (const ex of EXCHANGES) {
      this.balances.set(ex, {
        usdt: INITIAL_USDT_PER_EXCHANGE,
        btc: INITIAL_BTC_PER_EXCHANGE,
        eth: INITIAL_ETH_PER_EXCHANGE,
      });
    }
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

    buyWallet.usdt -= usdtSpent.plus(buyFee).toNumber();
    this.addAsset(buyWallet, asset, volume.toNumber());
    this.addAsset(sellWallet, asset, -volume.toNumber());
    sellWallet.usdt += usdtReceived.minus(sellFee).toNumber();

    const grossProfit = sellPrice.minus(buyPrice).mul(volume);
    const totalFees = buyFee.plus(sellFee);
    const netProfit = grossProfit.minus(totalFees);

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
      buyFee: buyFee.toNumber(),
      sellFee: sellFee.toNumber(),
      totalFees: totalFees.toNumber(),
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
  ): PortfolioStats {
    const totalArbitrageProfit = this.trades.reduce(
      (sum, t) => sum + t.netProfit,
      0,
    );
    const totalFeesPaid = this.trades.reduce((sum, t) => sum + t.totalFees, 0);
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

    return {
      initialCapitalUSDT: INITIAL_CAPITAL_USDT,
      initialBTC: INITIAL_BTC,
      initialETH: INITIAL_ETH,
      totalArbitrageProfit,
      totalTrades: this.trades.length,
      totalFeesPaid,
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
    };
  }
}
