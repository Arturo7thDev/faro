import { describe, expect, it } from "vitest";
import type { ExchangeName, Pair, Ticker } from "../exchanges/types.js";
import { detectOpportunities } from "./detector.js";

function mkTicker(
  exchange: ExchangeName,
  bid: number,
  ask: number,
  qty = 1,
): Ticker {
  return {
    exchange,
    pair: "BTC/USDT",
    bid,
    ask,
    bidQty: qty,
    askQty: qty,
    timestamp: Date.now(),
  };
}

function mkMap(...tickers: Ticker[]): Map<ExchangeName, Ticker> {
  const m = new Map<ExchangeName, Ticker>();
  for (const t of tickers) m.set(t.exchange, t);
  return m;
}

const PAIR: Pair = "BTC/USDT";

describe("detectOpportunities", () => {
  it("returns empty when only one exchange", () => {
    const result = detectOpportunities(
      PAIR,
      mkMap(mkTicker("binance", 100, 101)),
    );
    expect(result).toHaveLength(0);
  });

  it("returns empty when no spread (all asks >= all bids)", () => {
    const result = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 100, 101),
        mkTicker("coinbase", 100, 101),
      ),
    );
    expect(result).toHaveLength(0);
  });

  it("detects arbitrage: buy cheap on A, sell high on B", () => {
    // Binance ask 100 < Coinbase bid 102 → opportunity
    const result = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 99, 100),
        mkTicker("coinbase", 102, 103),
      ),
    );
    const opp = result.find(
      (o) => o.buyExchange === "binance" && o.sellExchange === "coinbase",
    );
    expect(opp).toBeDefined();
    expect(opp!.grossSpread).toBe(2);
  });

  it("sorts opportunities by netProfit descending", () => {
    const result = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 100_000, 100_001),
        mkTicker("coinbase", 100_050, 100_051),
        mkTicker("kraken", 100_100, 100_101),
      ),
    );
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].netProfit).toBeGreaterThanOrEqual(
        result[i].netProfit,
      );
    }
  });

  it("subtracts all 4 cost components (trading + withdrawal + slippage + latency)", () => {
    const opps = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 70_000, 70_001),
        mkTicker("coinbase", 70_100, 70_101),
      ),
    );
    const opp = opps[0];
    expect(opp.tradingFees).toBeGreaterThan(0);
    expect(opp.amortizedWithdrawal).toBeGreaterThan(0);
    expect(opp.estimatedSlippage).toBeGreaterThan(0);
    expect(opp.latencyCost).toBeGreaterThan(0);
    // totalCosts should equal the sum (modulo tiny float error)
    const sum =
      opp.tradingFees +
      opp.amortizedWithdrawal +
      opp.estimatedSlippage +
      opp.latencyCost;
    expect(Math.abs(opp.totalCosts - sum)).toBeLessThan(0.0001);
    // netProfit should equal gross - totalCosts
    expect(Math.abs(opp.netProfit - (opp.grossProfit - opp.totalCosts))).toBeLessThan(0.0001);
  });

  it("flags suspicious opportunities with spread > 2% of price", () => {
    // 3% spread = clearly suspicious
    const opps = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 70_000, 70_000),
        mkTicker("coinbase", 72_100, 72_100),
      ),
    );
    expect(opps[0].suspicious).toBe(true);
  });

  it("does not flag normal spreads as suspicious", () => {
    // 0.1% spread = normal
    const opps = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 70_000, 70_001),
        mkTicker("coinbase", 70_070, 70_071),
      ),
    );
    expect(opps[0].suspicious).toBe(false);
  });

  it("retail net is much worse than institutional net (same trade)", () => {
    const opps = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 70_000, 70_001),
        mkTicker("coinbase", 70_100, 70_101),
      ),
    );
    const opp = opps[0];
    expect(opp.retailNetProfit).toBeLessThan(opp.netProfit);
  });

  it("caps volume by min(buyAskQty, sellBidQty)", () => {
    const opps = detectOpportunities(
      PAIR,
      mkMap(
        mkTicker("binance", 99, 100, 0.5),
        mkTicker("coinbase", 102, 103, 0.1),
      ),
    );
    const opp = opps.find(
      (o) => o.buyExchange === "binance" && o.sellExchange === "coinbase",
    );
    expect(opp!.maxVolume).toBe(0.1);
  });
});
