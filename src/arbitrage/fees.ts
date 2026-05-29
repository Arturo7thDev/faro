import type { ExchangeName } from "../exchanges/types.js";

export interface ExchangeFees {
  takerPercent: number;
  withdrawalBTC: number;
  withdrawalUSDT: number;
}

/**
 * Fees a tier INSTITUCIONAL (operadores con volumen mensual >$1M).
 * Es el tier en el que arbitraje BTC es matemáticamente viable.
 * A tier retail (0.4-0.6%), prácticamente CERO oportunidades serían rentables.
 */
export const FEES: Record<ExchangeName, ExchangeFees> = {
  binance: { takerPercent: 0.0005, withdrawalBTC: 0.0002, withdrawalUSDT: 1 }, // 0.05%
  coinbase: { takerPercent: 0.0015, withdrawalBTC: 0.0001, withdrawalUSDT: 1.5 }, // 0.15%
  kraken: { takerPercent: 0.001, withdrawalBTC: 0.00009, withdrawalUSDT: 2.5 }, // 0.10%
};

/**
 * Fee retail típico cross-exchange. Usado SOLO para comparativa narrativa:
 * "¿qué hubiera pasado en este mismo trade si fueras retail?"
 * Spoiler: pérdida garantizada en casi todos los casos.
 */
export const RETAIL_TAKER_PERCENT = 0.005; // 0.50%
