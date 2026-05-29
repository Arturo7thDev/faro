import type { ExchangeName } from "../exchanges/types.js";

export interface ExchangeFees {
  takerPercent: number;
  withdrawalBTC: number;
  withdrawalUSDT: number;
}

/**
 * Fees a tier MARKET MAKER TOP — el más bajo que ofrecen los exchanges
 * para operadores con >$4B de volumen mensual (Binance VIP 9, Coinbase tier máx).
 * Es el tier donde el arbitraje BTC simple es rentable de forma sistemática.
 */
export const FEES: Record<ExchangeName, ExchangeFees> = {
  binance: { takerPercent: 0.0002, withdrawalBTC: 0.0002, withdrawalUSDT: 1 }, // 0.02%
  coinbase: { takerPercent: 0.0004, withdrawalBTC: 0.0001, withdrawalUSDT: 1.5 }, // 0.04%
  kraken: { takerPercent: 0.0004, withdrawalBTC: 0.00009, withdrawalUSDT: 2.5 }, // 0.04%
};

/**
 * Fee retail típico cross-exchange. Usado SOLO para comparativa narrativa:
 * "¿qué hubiera pasado en este mismo trade si fueras retail?"
 * Spoiler: pérdida garantizada en casi todos los casos.
 */
export const RETAIL_TAKER_PERCENT = 0.005; // 0.50%
