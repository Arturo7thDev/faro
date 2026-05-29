export type ExchangeName = "binance" | "coinbase" | "kraken";

export type Pair = "BTC/USDT" | "ETH/USDT" | "ETH/BTC";
export type Asset = "USDT" | "BTC" | "ETH";

export const PAIRS: Pair[] = ["BTC/USDT", "ETH/USDT", "ETH/BTC"];

// Triangular: necesitamos los 3 pairs en el mismo exchange para detectar arb
export const TRIANGULAR_PAIRS: Pair[] = ["BTC/USDT", "ETH/USDT", "ETH/BTC"];

export function pairToAsset(pair: Pair): Asset {
  // El "base" asset del par. Para ETH/USDT es ETH, para BTC/USDT es BTC, para ETH/BTC es ETH.
  return pair.split("/")[0] as Asset;
}

export function pairQuoteAsset(pair: Pair): Asset {
  // El "quote" asset. Para ETH/USDT es USDT, para ETH/BTC es BTC.
  return pair.split("/")[1] as Asset;
}

export interface Ticker {
  exchange: ExchangeName;
  pair: Pair;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  timestamp: number;
}

export type TickerHandler = (ticker: Ticker) => void;
