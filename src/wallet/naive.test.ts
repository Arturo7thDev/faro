import { beforeEach, describe, expect, it } from "vitest";
import type { Opportunity } from "../arbitrage/types.js";
import { NaiveBot } from "./naive.js";

function mkOpp(
  overrides: Partial<Opportunity> = {},
): Opportunity {
  return {
    timestamp: Date.now(),
    pair: "BTC/USDT",
    buyExchange: "binance",
    sellExchange: "coinbase",
    buyPrice: 70_000,
    sellPrice: 70_050,
    maxVolume: 0.05,
    grossSpread: 50,
    grossProfit: 2.5,
    buyFee: 0.014,
    sellFee: 0.014,
    tradingFees: 0.028,
    amortizedWithdrawal: 0.07,
    estimatedSlippage: 0.14,
    latencyCost: 0.07,
    totalCosts: 0.308,
    netProfit: 2.192,
    netSpread: 43.84,
    profitable: true,
    suspicious: false,
    retailTradingFees: 35,
    retailNetProfit: -32.5,
    ...overrides,
  };
}

describe("NaiveBot", () => {
  let bot: NaiveBot;
  beforeEach(() => {
    bot = new NaiveBot();
  });

  it("executes a trade when gross > 0 (without considering net)", () => {
    const trade = bot.evaluate([mkOpp()], Date.now());
    expect(trade).not.toBeNull();
    expect(trade!.grossProfit).toBeGreaterThan(0);
  });

  it("the executed trade has NEGATIVE net result (retail fees eat the spread)", () => {
    const trade = bot.evaluate([mkOpp({ grossProfit: 2.5 })], Date.now());
    expect(trade).not.toBeNull();
    // 0.5% × 2 sides × 70000 × 0.05 = $35 in fees vs $2.5 gross → net negative
    expect(trade!.netResult).toBeLessThan(0);
  });

  it("respects cooldown per route", () => {
    const opp = mkOpp();
    const now = Date.now();
    bot.evaluate([opp], now);
    const second = bot.evaluate([opp], now + 1000); // dentro del cooldown
    expect(second).toBeNull();
  });

  it("executes again after cooldown elapses", () => {
    const opp = mkOpp();
    const now = Date.now();
    bot.evaluate([opp], now);
    const later = bot.evaluate([opp], now + 4000); // pasado el cooldown 3s
    expect(later).not.toBeNull();
  });

  it("accumulates losses over many trades", () => {
    const opp = mkOpp({ grossProfit: 1 });
    let t = Date.now();
    for (let i = 0; i < 5; i++) {
      bot.evaluate([opp], t);
      t += 4000;
    }
    const stats = bot.getStats(70_000, 2_000);
    expect(stats.totalTrades).toBe(5);
    expect(stats.cumulativeNet).toBeLessThan(0);
  });

  it("skips opportunities with non-positive gross", () => {
    const trade = bot.evaluate([mkOpp({ grossProfit: 0 })], Date.now());
    expect(trade).toBeNull();
  });

  it("getStats returns sensible initial values", () => {
    const stats = bot.getStats(70_000, 2_000);
    expect(stats.totalTrades).toBe(0);
    expect(stats.cumulativeNet).toBe(0);
    expect(stats.initialCapitalUSDT).toBe(150_000);
    expect(stats.initialBTC).toBe(1.5);
    expect(stats.initialETH).toBe(30);
  });
});
