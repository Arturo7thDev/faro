import { describe, expect, it } from "vitest";
import {
  bucketizeSurvival,
  calculateSurvivalProb,
  calculateTOBI,
  DEFAULT_THRESHOLDS,
} from "./orderbook.js";

describe("calculateTOBI", () => {
  it("returns 0 for a balanced book", () => {
    expect(calculateTOBI(100, 100)).toBe(0);
  });

  it("returns +1 when all liquidity is on the bid", () => {
    expect(calculateTOBI(100, 0)).toBe(1);
  });

  it("returns -1 when all liquidity is on the ask", () => {
    expect(calculateTOBI(0, 100)).toBe(-1);
  });

  it("returns 0 for an empty book (avoids div/0)", () => {
    expect(calculateTOBI(0, 0)).toBe(0);
  });

  it("returns positive for bid-heavy books", () => {
    expect(calculateTOBI(300, 100)).toBeCloseTo(0.5, 5);
  });

  it("returns negative for ask-heavy books", () => {
    expect(calculateTOBI(100, 300)).toBeCloseTo(-0.5, 5);
  });

  it("stays within [-1, 1] for any positive input", () => {
    const tobi = calculateTOBI(1234567.89, 9876543.21);
    expect(tobi).toBeGreaterThanOrEqual(-1);
    expect(tobi).toBeLessThanOrEqual(1);
  });
});

describe("calculateSurvivalProb", () => {
  it("returns 0.5 for a neutral signal on both exchanges", () => {
    expect(calculateSurvivalProb(0, 0)).toBe(0.5);
  });

  it("returns 1.0 in the best case: bearish buy-side + bullish sell-side", () => {
    // TOBI_buy = -1 (ask pressure → buy_price drops)
    // TOBI_sell = +1 (bid pressure → sell_price rises)
    // → spread widens → opportunity lives longer
    expect(calculateSurvivalProb(-1, 1)).toBe(1);
  });

  it("returns 0.0 in the worst case: bullish buy-side + bearish sell-side", () => {
    // Spread closes fast → opportunity dies
    expect(calculateSurvivalProb(1, -1)).toBe(0);
  });

  it("clamps to [0, 1] for inputs beyond [-1, 1]", () => {
    expect(calculateSurvivalProb(-1.5, 1.5)).toBeLessThanOrEqual(1);
    expect(calculateSurvivalProb(1.5, -1.5)).toBeGreaterThanOrEqual(0);
  });

  it("is symmetric: swapping the inputs inverts around 0.5", () => {
    const a = calculateSurvivalProb(0.4, -0.2);
    const b = calculateSurvivalProb(-0.2, 0.4);
    expect(a + b).toBeCloseTo(1, 5);
  });

  it("gives mid-high prob (~0.75) for mild favorable imbalance", () => {
    expect(calculateSurvivalProb(-0.5, 0.5)).toBeCloseTo(0.75, 5);
  });
});

describe("bucketizeSurvival", () => {
  it("classifies high for prob >= threshold.high (0.6)", () => {
    expect(bucketizeSurvival(0.6)).toBe("high");
    expect(bucketizeSurvival(0.8)).toBe("high");
    expect(bucketizeSurvival(1.0)).toBe("high");
  });

  it("classifies low for prob <= threshold.low (0.4)", () => {
    expect(bucketizeSurvival(0.4)).toBe("low");
    expect(bucketizeSurvival(0.2)).toBe("low");
    expect(bucketizeSurvival(0)).toBe("low");
  });

  it("classifies medium for prob in (low, high)", () => {
    expect(bucketizeSurvival(0.45)).toBe("medium");
    expect(bucketizeSurvival(0.5)).toBe("medium");
    expect(bucketizeSurvival(0.55)).toBe("medium");
  });

  it("respects custom thresholds", () => {
    const custom = { high: 0.8, low: 0.2 };
    expect(bucketizeSurvival(0.5, custom)).toBe("medium");
    expect(bucketizeSurvival(0.85, custom)).toBe("high");
    expect(bucketizeSurvival(0.15, custom)).toBe("low");
  });

  it("uses DEFAULT_THRESHOLDS when none provided", () => {
    expect(bucketizeSurvival(0.6, DEFAULT_THRESHOLDS)).toBe("high");
    expect(bucketizeSurvival(0.6)).toBe("high");
  });
});
