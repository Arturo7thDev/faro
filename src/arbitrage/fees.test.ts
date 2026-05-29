import { describe, expect, it } from "vitest";
import {
  ESTIMATED_SLIPPAGE_PCT,
  FEES,
  LATENCY_COST_PCT,
  N_TRADES_PER_REBALANCE,
  RETAIL_TAKER_PERCENT,
} from "./fees.js";

describe("FEES constants", () => {
  it("defines fees for all 3 exchanges", () => {
    expect(FEES.binance).toBeDefined();
    expect(FEES.coinbase).toBeDefined();
    expect(FEES.kraken).toBeDefined();
  });

  it("uses institutional/market-maker tier rates (≤ 0.05% taker)", () => {
    for (const ex of ["binance", "coinbase", "kraken"] as const) {
      expect(FEES[ex].takerPercent).toBeGreaterThan(0);
      expect(FEES[ex].takerPercent).toBeLessThanOrEqual(0.0005);
    }
  });

  it("has withdrawal fees for BTC, ETH, and USDT in every exchange", () => {
    for (const ex of ["binance", "coinbase", "kraken"] as const) {
      expect(FEES[ex].withdrawalBTC).toBeGreaterThan(0);
      expect(FEES[ex].withdrawalETH).toBeGreaterThan(0);
      expect(FEES[ex].withdrawalUSDT).toBeGreaterThan(0);
    }
  });
});

describe("Cost model constants", () => {
  it("retail tier is significantly higher than market-maker", () => {
    // Retail fees should be at least 10x institutional fees
    const maxInst = Math.max(
      FEES.binance.takerPercent,
      FEES.coinbase.takerPercent,
      FEES.kraken.takerPercent,
    );
    expect(RETAIL_TAKER_PERCENT).toBeGreaterThan(maxInst * 10);
  });

  it("rebalance amortization spreads withdrawal cost", () => {
    expect(N_TRADES_PER_REBALANCE).toBeGreaterThan(1);
  });

  it("slippage and latency are non-zero estimates", () => {
    expect(ESTIMATED_SLIPPAGE_PCT).toBeGreaterThan(0);
    expect(LATENCY_COST_PCT).toBeGreaterThan(0);
  });
});
