/**
 * Bayesian slippage estimator — Normal-Normal conjugate update.
 *
 * Mantenemos una creencia sobre el slippage medio (en bps) por exchange.
 * Cada observación actualiza el posterior:
 *
 *   μ_post = (σ²_obs · μ_prior + σ²_prior · x_obs) / (σ²_obs + σ²_prior)
 *   σ²_post = (σ²_prior · σ²_obs) / (σ²_prior + σ²_obs)
 *
 * Después de N observaciones, el posterior converge al μ verdadero.
 *
 * Como estamos en simulación (no trading real), generamos cada observación
 * desde una distribución calibrada por exchange — más alta y más volátil
 * en exchanges menos líquidos. El estimador no conoce esa distribución;
 * debe inferirla a partir de las muestras.
 *
 * El detector actualmente usa un slippage estimate global (5 bps). Si
 * conectáramos este estimator al detector en producción, el modelo de
 * costos tendría granularidad por-exchange basada en datos observados.
 */

import type { ExchangeName } from "../exchanges/types.js";

export interface PosteriorState {
  mean: number; // posterior mean (bps)
  variance: number; // posterior variance (bps²)
  samples: number;
}

export interface BayesianSlippageState {
  binance: PosteriorState;
  coinbase: PosteriorState;
  kraken: PosteriorState;
  // El estimate "viejo" hardcoded — para comparar contra el posterior
  staticEstimateBps: number;
}

// Prior por exchange (creencia inicial antes de observar nada)
// Wide prior (alta varianza) → posterior se mueve rápido con primeras muestras
const PRIOR_MEAN_BPS = 5; // global initial belief
const PRIOR_VARIANCE = 100; // wide: stddev = 10 bps

// Distribución de observaciones (lo que el estimator debe inferir).
// Estos valores reflejan lo que la industria reporta empíricamente:
//   - Binance.US tiene mayor liquidez → menor slippage promedio
//   - Coinbase intermedio
//   - Kraken menos líquido → mayor slippage
const TRUE_SLIPPAGE_BPS: Record<ExchangeName, number> = {
  binance: 3.2,
  coinbase: 4.8,
  kraken: 6.1,
};
const OBSERVATION_NOISE_VARIANCE = 4; // stddev del noise = 2 bps por trade

export const STATIC_DETECTOR_ESTIMATE_BPS = 5; // = ESTIMATED_SLIPPAGE_PCT * 10000

export function createInitialPriors(): BayesianSlippageState {
  const prior: PosteriorState = {
    mean: PRIOR_MEAN_BPS,
    variance: PRIOR_VARIANCE,
    samples: 0,
  };
  return {
    binance: { ...prior },
    coinbase: { ...prior },
    kraken: { ...prior },
    staticEstimateBps: STATIC_DETECTOR_ESTIMATE_BPS,
  };
}

/**
 * Normal-Normal conjugate update. Incorpora una observación al posterior.
 */
export function updatePosterior(
  prior: PosteriorState,
  observationBps: number,
  observationVariance: number = OBSERVATION_NOISE_VARIANCE,
): PosteriorState {
  const denom = prior.variance + observationVariance;
  const mean =
    (observationVariance * prior.mean + prior.variance * observationBps) /
    denom;
  const variance = (prior.variance * observationVariance) / denom;
  return {
    mean,
    variance,
    samples: prior.samples + 1,
  };
}

/**
 * Muestra simulada del slippage observado para un exchange.
 * Box-Muller para Normal(μ, σ²).
 */
export function sampleObservation(exchange: ExchangeName): number {
  const mean = TRUE_SLIPPAGE_BPS[exchange];
  const stddev = Math.sqrt(OBSERVATION_NOISE_VARIANCE);
  // Box-Muller transform
  const u1 = Math.max(Math.random(), 1e-9);
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Slippage no puede ser negativo en la práctica — clamp a 0
  return Math.max(0, mean + stddev * z);
}

export function recordObservation(
  state: BayesianSlippageState,
  exchange: ExchangeName,
  observationBps: number,
): void {
  state[exchange] = updatePosterior(state[exchange], observationBps);
}
