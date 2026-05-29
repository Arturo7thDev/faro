import type { ExchangeName } from "../exchanges/types.js";

export interface ExchangeFees {
  takerPercent: number;
  withdrawalBTC: number;
  withdrawalUSDT: number;
}

// Fees aproximadas tier 0 (standard taker) - actualizar contra docs oficiales
export const FEES: Record<ExchangeName, ExchangeFees> = {
  binance: { takerPercent: 0.001, withdrawalBTC: 0.0002, withdrawalUSDT: 1 },
  coinbase: { takerPercent: 0.004, withdrawalBTC: 0.0001, withdrawalUSDT: 1.5 },
  kraken: { takerPercent: 0.0026, withdrawalBTC: 0.00009, withdrawalUSDT: 2.5 },
};
