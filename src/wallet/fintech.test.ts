import { describe, expect, it } from "vitest";
import {
  percentile,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  winRate,
} from "./fintech.js";

describe("percentile", () => {
  it("returns the only element for single-element arrays", () => {
    expect(percentile([5], 50)).toBe(5);
    expect(percentile([5], 99)).toBe(5);
  });

  it("computes p50 (median) correctly for odd-length arrays", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("interpolates for even-length arrays", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it("computes p95 within a reasonable range", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBeGreaterThanOrEqual(95);
    expect(percentile(arr, 95)).toBeLessThanOrEqual(96);
  });

  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe("sharpeRatio", () => {
  it("returns 0 for insufficient data", () => {
    expect(sharpeRatio([])).toBe(0);
    expect(sharpeRatio([1])).toBe(0);
  });

  it("is positive when returns are mostly positive", () => {
    expect(sharpeRatio([1, 2, 1.5, 1.8, 0.9])).toBeGreaterThan(0);
  });

  it("is high when variance is low and mean is positive", () => {
    expect(sharpeRatio([1, 1, 1, 1.1, 1])).toBeGreaterThan(5);
  });
});

describe("sortinoRatio", () => {
  it("only penalizes downside variance", () => {
    const allPositive = [1, 2, 3, 4, 5];
    const mixed = [1, -1, 3, -3, 5];
    expect(sortinoRatio(allPositive)).toBe(Infinity);
    expect(sortinoRatio(mixed)).toBeGreaterThan(0);
    expect(sortinoRatio(mixed)).not.toBe(Infinity);
  });
});

describe("profitFactor", () => {
  it("returns Infinity for all-wins", () => {
    expect(profitFactor([1, 2, 3])).toBe(Infinity);
  });

  it("returns 2 for balanced wins/losses 2:1", () => {
    expect(profitFactor([2, -1])).toBe(2);
  });

  it("returns 0.5 for losing strategy", () => {
    expect(profitFactor([1, -2])).toBe(0.5);
  });

  it("returns 0 for empty", () => {
    expect(profitFactor([])).toBe(0);
  });
});

describe("winRate", () => {
  it("returns 1 for all-wins", () => {
    expect(winRate([1, 2, 3])).toBe(1);
  });

  it("returns 0.5 for balanced", () => {
    expect(winRate([1, -1, 2, -2])).toBe(0.5);
  });

  it("zeros do not count as wins", () => {
    expect(winRate([0, 0, 1, -1])).toBe(0.25);
  });
});
