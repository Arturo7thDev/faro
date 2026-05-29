import type { ExchangeName } from "../exchanges/types.js";

export interface ExchangeFees {
  takerPercent: number;
  withdrawalBTC: number;
  withdrawalETH: number;
  withdrawalUSDT: number;
}

/**
 * Fees a tier MARKET MAKER TOP — el más bajo que ofrecen los exchanges
 * para operadores con >$4B de volumen mensual.
 */
export const FEES: Record<ExchangeName, ExchangeFees> = {
  binance: {
    takerPercent: 0.0002, // 0.02%
    withdrawalBTC: 0.0002,
    withdrawalETH: 0.005,
    withdrawalUSDT: 1,
  },
  coinbase: {
    takerPercent: 0.0004, // 0.04%
    withdrawalBTC: 0.0001,
    withdrawalETH: 0.004,
    withdrawalUSDT: 1.5,
  },
  kraken: {
    takerPercent: 0.0004, // 0.04%
    withdrawalBTC: 0.00009,
    withdrawalETH: 0.005,
    withdrawalUSDT: 2.5,
  },
};

export const RETAIL_TAKER_PERCENT = 0.005; // 0.50%

/**
 * Modelo de costos adicionales aplicado a cada trade (más allá de trading fees).
 *
 * Withdrawal amortizado: asumimos que el bot rebalancea entre exchanges cada
 * N_TRADES_PER_REBALANCE trades. El costo del withdrawal del exchange "sell" (donde
 * acumulamos USDT extra) se divide entre esos trades.
 *
 * Slippage estimado: incluso ejecutando al top of book, el price impact de cualquier
 * trade real es > 0. Modelo conservador para alto-volumen: 0.005% del trade value.
 *
 * Latency cost: round-trip de ~100ms al exchange + processing. En ese tiempo el precio
 * puede moverse en contra del bot. Estimación conservadora: 0.001% del trade value.
 */
export const N_TRADES_PER_REBALANCE = 100;
// Calibrados para tier market-maker top: slippage casi nulo cuando ejecutás al top
// del libro; latencia minimizada con colocación geográfica cerca de los matching engines.
export const ESTIMATED_SLIPPAGE_PCT = 0.00002; // 0.002% del trade value
export const LATENCY_COST_PCT = 0.00001; // 0.001% del trade value
