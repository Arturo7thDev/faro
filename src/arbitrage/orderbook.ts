/**
 * TOBI — Top of Book Imbalance (L1 signal).
 *
 * Es una aproximación L1 honesta de Order Book Imbalance. En producción
 * usaríamos top-N levels del libro (L5+), pero acá derivamos la señal del
 * mejor bid/ask que ya consumimos via WebSocket. Para hackathon-scale, la
 * señal direccional capturada en L1 ya es predictiva en horizontes de
 * 200-500ms, que es el rango relevante para arbitraje cross-exchange.
 */

export type SurvivalBucket = "high" | "medium" | "low";

export interface SurvivalThresholds {
  high: number;
  low: number;
}

export const DEFAULT_THRESHOLDS: SurvivalThresholds = {
  high: 0.6,
  low: 0.4,
};

/**
 * Umbral de ejecución: el bot NO ejecuta trades con survivalProb por debajo
 * de este valor. La oportunidad probablemente muere antes de capturarse.
 */
export const SURVIVAL_PROB_EXEC_THRESHOLD = 0.5;

/**
 * TOBI para un único nivel L1.
 *   +1 = todo el volumen está en el bid (presión compradora máxima → precio sube)
 *   -1 = todo el volumen está en el ask (presión vendedora máxima → precio baja)
 *    0 = balanceado o libro vacío
 */
export function calculateTOBI(bidQty: number, askQty: number): number {
  const total = bidQty + askQty;
  if (total === 0) return 0;
  return (bidQty - askQty) / total;
}

/**
 * Probabilidad de supervivencia de una oportunidad cross-exchange.
 * El bot compra en A y vende en B. La oportunidad sobrevive más tiempo si:
 *   - TOBI_A < 0 (presión vendedora en A) → buy_price baja → spread crece
 *   - TOBI_B > 0 (presión compradora en B) → sell_price sube → spread crece
 *
 * score = TOBI_B - TOBI_A, rango [-2, +2]
 * survivalProb = (score + 2) / 4, normalizado a [0, 1]
 */
export function calculateSurvivalProb(
  tobiBuyExchange: number,
  tobiSellExchange: number,
): number {
  const score = tobiSellExchange - tobiBuyExchange;
  const normalized = (score + 2) / 4;
  return Math.max(0, Math.min(1, normalized));
}

export function bucketizeSurvival(
  prob: number,
  thresholds: SurvivalThresholds = DEFAULT_THRESHOLDS,
): SurvivalBucket {
  if (prob >= thresholds.high) return "high";
  if (prob <= thresholds.low) return "low";
  return "medium";
}
