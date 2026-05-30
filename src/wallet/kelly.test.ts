import { describe, expect, it } from "vitest";
import {
  KELLY_DEFAULT_FRACTION,
  KELLY_FRACTION,
  KELLY_MAX,
  calculateKelly,
  computeKellyFromTrades,
} from "./kelly.js";

describe("calculateKelly", () => {
  it("returns default fraction when no samples yet", () => {
    const r = calculateKelly({
      winCount: 0,
      lossCount: 0,
      avgWin: 0,
      avgLoss: 0,
    });
    expect(r.fractionalKelly).toBe(KELLY_DEFAULT_FRACTION);
    expect(r.isReliable).toBe(false);
    expect(r.samples).toBe(0);
  });

  it("returns default fraction with samples < MIN_SAMPLES_FOR_KELLY", () => {
    const r = calculateKelly({
      winCount: 3,
      lossCount: 2,
      avgWin: 10,
      avgLoss: 5,
    });
    expect(r.fractionalKelly).toBe(KELLY_DEFAULT_FRACTION);
    expect(r.isReliable).toBe(false);
    // raw kelly should still compute correctly
    expect(r.winProb).toBe(0.6);
    expect(r.edgeRatio).toBe(2);
  });

  it("reports observables honestly when no losses yet, sizing uses default fraction", () => {
    // Sin pérdidas, Kelly completo es indeterminable (división por cero).
    // Pero winProb y samples sí son observables válidas y deben reportarse,
    // sino aparecen inconsistencias con winRate de las métricas fintech.
    const r = calculateKelly({
      winCount: 100,
      lossCount: 0,
      avgWin: 10,
      avgLoss: 0,
    });
    expect(r.winProb).toBe(1);
    expect(r.samples).toBe(100);
    expect(r.edgeRatio).toBe(Infinity);
    expect(r.fullKelly).toBe(0); // placeholder — indeterminable
    expect(r.fractionalKelly).toBe(KELLY_DEFAULT_FRACTION);
    expect(r.isReliable).toBe(false); // no reliable hasta tener una pérdida
  });

  it("computes raw Kelly correctly for known inputs", () => {
    // p=0.6, b=2 → f* = (0.6*2 - 0.4) / 2 = 0.8/2 = 0.4
    const r = calculateKelly({
      winCount: 60,
      lossCount: 40,
      avgWin: 20,
      avgLoss: 10,
    });
    expect(r.winProb).toBe(0.6);
    expect(r.edgeRatio).toBe(2);
    expect(r.fullKelly).toBeCloseTo(0.4, 5);
  });

  it("applies fractional kelly (25%) when reliable", () => {
    const r = calculateKelly({
      winCount: 60,
      lossCount: 40,
      avgWin: 20,
      avgLoss: 10,
    });
    // f* = 0.4, fractional = 0.4 * 0.25 = 0.1
    expect(r.fractionalKelly).toBeCloseTo(0.4 * KELLY_FRACTION, 5);
    expect(r.isReliable).toBe(true);
  });

  it("caps fractional kelly at KELLY_MAX even with insane edge", () => {
    // Extreme edge: 90% win rate, 100:1 reward:risk
    const r = calculateKelly({
      winCount: 90,
      lossCount: 10,
      avgWin: 100,
      avgLoss: 1,
    });
    expect(r.fullKelly).toBeGreaterThan(0.8); // raw is huge
    expect(r.fractionalKelly).toBeLessThanOrEqual(KELLY_MAX);
  });

  it("returns 0 fractional kelly when edge is negative", () => {
    // p=0.3, b=1 → f* = (0.3*1 - 0.7)/1 = -0.4 → no apostar
    const r = calculateKelly({
      winCount: 30,
      lossCount: 70,
      avgWin: 10,
      avgLoss: 10,
    });
    expect(r.fullKelly).toBeLessThan(0);
    expect(r.fractionalKelly).toBe(0);
  });

  it("marks isReliable=true at exactly 10 samples", () => {
    const r = calculateKelly({
      winCount: 5,
      lossCount: 5,
      avgWin: 10,
      avgLoss: 10,
    });
    expect(r.samples).toBe(10);
    expect(r.isReliable).toBe(true);
  });
});

describe("computeKellyFromTrades", () => {
  it("returns default when no trades", () => {
    const r = computeKellyFromTrades([]);
    expect(r.samples).toBe(0);
    expect(r.fractionalKelly).toBe(KELLY_DEFAULT_FRACTION);
  });

  it("aggregates wins and losses correctly", () => {
    const trades = [
      { netProfit: 10 },
      { netProfit: 20 },
      { netProfit: -5 },
      { netProfit: -15 },
    ];
    const r = computeKellyFromTrades(trades);
    expect(r.winProb).toBe(0.5);
    // avgWin = 15, avgLoss = 10 → b = 1.5
    expect(r.edgeRatio).toBeCloseTo(1.5, 5);
  });

  it("excludes zero-profit trades from the count", () => {
    const trades = [{ netProfit: 10 }, { netProfit: 0 }, { netProfit: -10 }];
    const r = computeKellyFromTrades(trades);
    expect(r.samples).toBe(2);
  });
});
