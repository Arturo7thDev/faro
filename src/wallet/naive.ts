import Decimal from "decimal.js";
import { RETAIL_TAKER_PERCENT } from "../arbitrage/fees.js";
import type { Opportunity } from "../arbitrage/types.js";
import type { ExchangeName, Pair } from "../exchanges/types.js";
import { pairToAsset } from "../exchanges/types.js";
import type { Balance } from "./types.js";

/**
 * NaiveBot: segunda instancia que corre EN PARALELO al bot Faro.
 *
 * Diferencia clave:
 *  - Faro filtra por NET (profit bruto - 4 componentes de costo) y solo ejecuta
 *    si NET > 0.
 *  - Naive filtra por GROSS y ejecuta cualquier oportunidad con spread bruto
 *    positivo, pagando fees retail (0.5%).
 *
 * Resultado esperado: Naive ejecuta MUCHOS más trades que Faro, pero
 * cada uno destruye valor porque los fees retail comen el spread.
 * La equity curve diverge dramáticamente en favor de Faro.
 *
 * Es la prueba visceral de por qué los bots de retail que se venden en YouTube
 * son una mentira matemática.
 */

const INITIAL_USDT_PER_EXCHANGE = 50_000;
const INITIAL_BTC_PER_EXCHANGE = 0.5;
const INITIAL_ETH_PER_EXCHANGE = 10;
const EXCHANGES: ExchangeName[] = ["binance", "coinbase", "kraken"];

const INITIAL_CAPITAL_USDT = INITIAL_USDT_PER_EXCHANGE * EXCHANGES.length;
const INITIAL_BTC = INITIAL_BTC_PER_EXCHANGE * EXCHANGES.length;
const INITIAL_ETH = INITIAL_ETH_PER_EXCHANGE * EXCHANGES.length;

// Mismo cooldown que Faro — fair fight, la diferencia está en el FILTRO de
// rentabilidad, no en la frecuencia de ejecución
const NAIVE_COOLDOWN_MS = 3000;

export interface NaiveTrade {
  id: string;
  timestamp: number;
  pair: Pair;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  buyPrice: number;
  sellPrice: number;
  volume: number;
  grossProfit: number; // lo que el naive ve antes de fees
  retailFees: number; // 0.5% × 2 lados × trade value
  netResult: number; // gross - fees, generalmente NEGATIVO
}

export interface NaiveStats {
  initialCapitalUSDT: number;
  initialBTC: number;
  initialETH: number;
  totalTrades: number;
  cumulativeNet: number; // suma de netResult de cada trade
  currentPortfolioValueUSDT: number;
  delta: number; // current - initial
  deltaPercent: number;
}

export class NaiveBot {
  private balances: Map<ExchangeName, Balance> = new Map();
  private trades: NaiveTrade[] = [];
  private lastExecutionByKey = new Map<string, number>();
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

  getTrades(limit = 30): NaiveTrade[] {
    return this.trades.slice(0, limit);
  }

  /**
   * Evaluar una lista de oportunidades. Naive ejecuta la primera con gross > 0
   * que pase cooldown y tenga capital. Sin consideraciones de NET, slippage,
   * latencia, ni nada.
   */
  evaluate(opps: Opportunity[], now: number): NaiveTrade | null {
    for (const opp of opps) {
      if (opp.grossProfit <= 0) continue;
      const key = `${opp.pair}:${opp.buyExchange}-${opp.sellExchange}`;
      const lastExec = this.lastExecutionByKey.get(key) ?? 0;
      if (now - lastExec < NAIVE_COOLDOWN_MS) continue;

      const asset = pairToAsset(opp.pair) as "BTC" | "ETH";
      const buyWallet = this.balances.get(opp.buyExchange);
      const sellWallet = this.balances.get(opp.sellExchange);
      if (!buyWallet || !sellWallet) continue;

      // Capital check
      const retailFeeMul = 1 + RETAIL_TAKER_PERCENT;
      const maxBuyable = buyWallet.usdt / (opp.buyPrice * retailFeeMul);
      const maxSellable = asset === "BTC" ? sellWallet.btc : sellWallet.eth;
      const executableVolume = Math.min(
        opp.maxVolume,
        maxBuyable,
        maxSellable,
      );
      if (executableVolume <= 0) continue;

      // EJECUTAR (sin filtro de net — esa es la trampa)
      const volume = new Decimal(executableVolume);
      const buyPrice = new Decimal(opp.buyPrice);
      const sellPrice = new Decimal(opp.sellPrice);

      const usdtSpent = buyPrice.mul(volume);
      const buyFee = usdtSpent.mul(RETAIL_TAKER_PERCENT);
      const usdtReceived = sellPrice.mul(volume);
      const sellFee = usdtReceived.mul(RETAIL_TAKER_PERCENT);
      const totalFees = buyFee.plus(sellFee);

      // Mutar balances
      buyWallet.usdt -= usdtSpent.plus(buyFee).toNumber();
      sellWallet.usdt += usdtReceived.minus(sellFee).toNumber();
      if (asset === "BTC") {
        buyWallet.btc += volume.toNumber();
        sellWallet.btc -= volume.toNumber();
      } else {
        buyWallet.eth += volume.toNumber();
        sellWallet.eth -= volume.toNumber();
      }

      const gross = sellPrice.minus(buyPrice).mul(volume);
      const netResult = gross.minus(totalFees);

      const trade: NaiveTrade = {
        id: `naive-${++this.tradeIdCounter}`,
        timestamp: now,
        pair: opp.pair,
        buyExchange: opp.buyExchange,
        sellExchange: opp.sellExchange,
        buyPrice: opp.buyPrice,
        sellPrice: opp.sellPrice,
        volume: executableVolume,
        grossProfit: gross.toNumber(),
        retailFees: totalFees.toNumber(),
        netResult: netResult.toNumber(),
      };

      this.trades.unshift(trade);
      if (this.trades.length > 500) this.trades.pop();
      this.lastExecutionByKey.set(key, now);

      return trade;
    }
    return null;
  }

  getStats(btcPrice: number, ethPrice: number): NaiveStats {
    const cumulativeNet = this.trades.reduce((s, t) => s + t.netResult, 0);
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
    const currentValue =
      totalUSDT + totalBTC * btcPrice + totalETH * ethPrice;
    const initialValue =
      INITIAL_CAPITAL_USDT +
      INITIAL_BTC * btcPrice +
      INITIAL_ETH * ethPrice;
    const delta = currentValue - initialValue;
    const deltaPercent = initialValue > 0 ? delta / initialValue : 0;

    return {
      initialCapitalUSDT: INITIAL_CAPITAL_USDT,
      initialBTC: INITIAL_BTC,
      initialETH: INITIAL_ETH,
      totalTrades: this.trades.length,
      cumulativeNet,
      currentPortfolioValueUSDT: currentValue,
      delta,
      deltaPercent,
    };
  }
}
