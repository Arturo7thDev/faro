import Decimal from "decimal.js";
import { FEES, RETAIL_TAKER_PERCENT } from "../arbitrage/fees.js";
import type { Opportunity } from "../arbitrage/types.js";
import type { ExchangeName, Ticker } from "../exchanges/types.js";
import type { Balance, ExecutedTrade, PortfolioStats } from "./types.js";

const INITIAL_USDT_PER_EXCHANGE = 50_000;
const INITIAL_BTC_PER_EXCHANGE = 0.5;
const EXCHANGES: ExchangeName[] = ["binance", "coinbase", "kraken"];

const INITIAL_CAPITAL_USDT = INITIAL_USDT_PER_EXCHANGE * EXCHANGES.length;
const INITIAL_BTC = INITIAL_BTC_PER_EXCHANGE * EXCHANGES.length;

export class WalletManager {
  private balances: Map<ExchangeName, Balance> = new Map();
  private trades: ExecutedTrade[] = [];
  private tradeIdCounter = 0;

  constructor() {
    for (const ex of EXCHANGES) {
      this.balances.set(ex, {
        usdt: INITIAL_USDT_PER_EXCHANGE,
        btc: INITIAL_BTC_PER_EXCHANGE,
      });
    }
  }

  getBalance(exchange: ExchangeName): Balance {
    return this.balances.get(exchange) ?? { usdt: 0, btc: 0 };
  }

  getAllBalances(): Array<{ exchange: ExchangeName } & Balance> {
    return Array.from(this.balances.entries()).map(([exchange, b]) => ({
      exchange,
      usdt: b.usdt,
      btc: b.btc,
    }));
  }

  getTrades(limit = 50): ExecutedTrade[] {
    return this.trades.slice(0, limit);
  }

  maxExecutableVolume(opp: Opportunity): number {
    const buyWallet = this.getBalance(opp.buyExchange);
    const sellWallet = this.getBalance(opp.sellExchange);

    const buyFeeMul = 1 + FEES[opp.buyExchange].takerPercent;
    const maxBuyableBTC = buyWallet.usdt / (opp.buyPrice * buyFeeMul);
    const maxSellableBTC = sellWallet.btc;

    return Math.min(opp.maxVolumeBTC, maxBuyableBTC, maxSellableBTC);
  }

  executeTrade(opp: Opportunity, executedVolume: number): ExecutedTrade {
    const buyWallet = this.balances.get(opp.buyExchange)!;
    const sellWallet = this.balances.get(opp.sellExchange)!;

    const volume = new Decimal(executedVolume);
    const buyPrice = new Decimal(opp.buyPrice);
    const sellPrice = new Decimal(opp.sellPrice);

    const usdtSpent = buyPrice.mul(volume);
    const buyFee = usdtSpent.mul(FEES[opp.buyExchange].takerPercent);
    const usdtReceived = sellPrice.mul(volume);
    const sellFee = usdtReceived.mul(FEES[opp.sellExchange].takerPercent);

    buyWallet.usdt -= usdtSpent.plus(buyFee).toNumber();
    buyWallet.btc += volume.toNumber();
    sellWallet.btc -= volume.toNumber();
    sellWallet.usdt += usdtReceived.minus(sellFee).toNumber();

    const grossProfit = sellPrice.minus(buyPrice).mul(volume);
    const totalFees = buyFee.plus(sellFee);
    const netProfit = grossProfit.minus(totalFees);

    // Comparativa retail: mismo trade, fees 0.5% en ambos lados
    const retailBuyFee = usdtSpent.mul(RETAIL_TAKER_PERCENT);
    const retailSellFee = usdtReceived.mul(RETAIL_TAKER_PERCENT);
    const retailTotalFees = retailBuyFee.plus(retailSellFee);
    const retailNetProfit = grossProfit.minus(retailTotalFees);

    const trade: ExecutedTrade = {
      id: `trade-${++this.tradeIdCounter}`,
      timestamp: Date.now(),
      buyExchange: opp.buyExchange,
      sellExchange: opp.sellExchange,
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      requestedVolumeBTC: opp.maxVolumeBTC,
      executedVolumeBTC: executedVolume,
      partial: executedVolume < opp.maxVolumeBTC * 0.999,
      buyFee: buyFee.toNumber(),
      sellFee: sellFee.toNumber(),
      totalFees: totalFees.toNumber(),
      grossProfit: grossProfit.toNumber(),
      netProfit: netProfit.toNumber(),
      retailNetProfit: retailNetProfit.toNumber(),
    };

    this.trades.unshift(trade);
    // Mantenemos historial amplio para el chart de equity curve
    if (this.trades.length > 500) this.trades.pop();

    return trade;
  }

  getStats(tickers: Map<ExchangeName, Ticker>): PortfolioStats {
    const totalArbitrageProfit = this.trades.reduce(
      (sum, t) => sum + t.netProfit,
      0,
    );
    const totalFeesPaid = this.trades.reduce((sum, t) => sum + t.totalFees, 0);
    // Lo que un retail hubiera perdido haciendo los mismos trades
    const hypotheticalRetailLoss = this.trades.reduce(
      (sum, t) => sum + t.retailNetProfit,
      0,
    );

    const mids = Array.from(tickers.values()).map((t) => (t.bid + t.ask) / 2);
    const currentBTCPrice =
      mids.length > 0
        ? mids.sort((a, b) => a - b)[Math.floor(mids.length / 2)]
        : 0;

    const totalUSDT = Array.from(this.balances.values()).reduce(
      (s, b) => s + b.usdt,
      0,
    );
    const totalBTC = Array.from(this.balances.values()).reduce(
      (s, b) => s + b.btc,
      0,
    );
    const currentPortfolioValueUSDT = totalUSDT + totalBTC * currentBTCPrice;

    return {
      initialCapitalUSDT: INITIAL_CAPITAL_USDT,
      initialBTC: INITIAL_BTC,
      totalArbitrageProfit,
      totalTrades: this.trades.length,
      totalFeesPaid,
      currentBTCPrice,
      currentPortfolioValueUSDT,
      hypotheticalRetailLoss,
    };
  }
}
