/**
 * Métricas estándar de la industria fintech para evaluar performance del bot.
 * Implementaciones puras (sin estado), llamadas desde WalletManager.getStats().
 */

import type { ExecutedTrade } from "./types.js";

/**
 * Calcula percentiles sobre un array. Asume array ya ordenado ascendentemente.
 * Linear interpolation entre puntos discretos para mejor precisión.
 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedAsc[lower];
  const weight = rank - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

/**
 * Sharpe ratio: mean(returns) / stddev(returns).
 *
 * Aplicado a trades discretos, sin annualizar (no asumimos periodos fijos).
 * Risk-free rate = 0 porque arbitraje intra-segundo no compite con bonos.
 *
 * > 1: bueno, > 2: muy bueno, > 3: excelente.
 */
export function sharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const stddev = Math.sqrt(variance);
  return stddev > 0 ? mean / stddev : 0;
}

/**
 * Sortino ratio: como Sharpe pero penaliza SOLO la desviación de retornos
 * negativos (downside deviation). Más relevante para arbitraje porque no
 * castiga la volatilidad de las ganancias.
 */
export function sortinoRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const negatives = returns.filter((r) => r < 0);
  if (negatives.length === 0) return Number.isFinite(mean) && mean > 0 ? Infinity : 0;
  const downsideVariance =
    negatives.reduce((s, r) => s + r ** 2, 0) / negatives.length;
  const downsideDev = Math.sqrt(downsideVariance);
  return downsideDev > 0 ? mean / downsideDev : 0;
}

/**
 * Profit factor: |suma de ganancias| / |suma de pérdidas|.
 *
 * > 1: ganador, > 2: muy bueno, > 3: excelente, < 1: perdedor.
 * Una de las métricas más usadas en trading systems profesionales.
 */
export function profitFactor(returns: number[]): number {
  const grossProfit = returns
    .filter((r) => r > 0)
    .reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(
    returns.filter((r) => r < 0).reduce((s, r) => s + r, 0),
  );
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

/**
 * Win rate: % de trades con net > 0.
 */
export function winRate(returns: number[]): number {
  if (returns.length === 0) return 0;
  const wins = returns.filter((r) => r > 0).length;
  return wins / returns.length;
}

/**
 * Wrapper para calcular las 4 métricas de retornos sobre trades.
 */
export function computeReturnMetrics(trades: ExecutedTrade[]): {
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  winRate: number;
} {
  const returns = trades.map((t) => t.netProfit);
  return {
    sharpeRatio: sharpeRatio(returns),
    sortinoRatio: sortinoRatio(returns),
    profitFactor: profitFactor(returns),
    winRate: winRate(returns),
  };
}
