import { describe, expect, it } from "vitest";
import {
  createInitialPriors,
  recordObservation,
  sampleObservation,
  updatePosterior,
} from "./bayesian.js";

describe("updatePosterior", () => {
  it("moves the posterior mean toward the observation", () => {
    const prior = { mean: 5, variance: 100, samples: 0 };
    const post = updatePosterior(prior, 10, 4);
    expect(post.mean).toBeGreaterThan(prior.mean);
    expect(post.mean).toBeLessThan(10);
  });

  it("decreases variance with each observation", () => {
    const prior = { mean: 5, variance: 100, samples: 0 };
    const post = updatePosterior(prior, 5, 4);
    expect(post.variance).toBeLessThan(prior.variance);
  });

  it("increments samples", () => {
    const prior = { mean: 5, variance: 100, samples: 3 };
    const post = updatePosterior(prior, 5, 4);
    expect(post.samples).toBe(4);
  });

  it("converges to true mean after many observations of same value", () => {
    let post = { mean: 5, variance: 100, samples: 0 };
    for (let i = 0; i < 500; i++) {
      post = updatePosterior(post, 7, 4);
    }
    expect(post.mean).toBeCloseTo(7, 1);
  });

  it("respects information balance: high observation noise → posterior moves slowly", () => {
    const prior = { mean: 5, variance: 100, samples: 0 };
    const lowNoise = updatePosterior(prior, 10, 1);
    const highNoise = updatePosterior(prior, 10, 100);
    // lowNoise believes the observation more → mean closer to 10
    expect(lowNoise.mean - 5).toBeGreaterThan(highNoise.mean - 5);
  });
});

describe("sampleObservation", () => {
  it("returns a non-negative value", () => {
    for (let i = 0; i < 100; i++) {
      const x = sampleObservation("binance");
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("averages near the true mean for binance over many samples", () => {
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += sampleObservation("binance");
    const avg = sum / n;
    expect(avg).toBeCloseTo(3.2, 0);
  });

  it("kraken samples average higher than binance samples", () => {
    let sumBinance = 0;
    let sumKraken = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      sumBinance += sampleObservation("binance");
      sumKraken += sampleObservation("kraken");
    }
    expect(sumKraken / n).toBeGreaterThan(sumBinance / n);
  });
});

describe("recordObservation + createInitialPriors", () => {
  it("converges all three exchange posteriors to their true means", () => {
    const state = createInitialPriors();
    const n = 1000;
    for (let i = 0; i < n; i++) {
      recordObservation(state, "binance", sampleObservation("binance"));
      recordObservation(state, "coinbase", sampleObservation("coinbase"));
      recordObservation(state, "kraken", sampleObservation("kraken"));
    }
    expect(state.binance.mean).toBeCloseTo(3.2, 0);
    expect(state.coinbase.mean).toBeCloseTo(4.8, 0);
    expect(state.kraken.mean).toBeCloseTo(6.1, 0);
    expect(state.binance.samples).toBe(n);
  });

  it("initial state has equal priors for all exchanges", () => {
    const state = createInitialPriors();
    expect(state.binance.mean).toBe(state.coinbase.mean);
    expect(state.coinbase.mean).toBe(state.kraken.mean);
    expect(state.binance.samples).toBe(0);
  });
});
