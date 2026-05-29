export type ExchangeName = "binance" | "coinbase" | "kraken";

export type Pair = "BTC/USDT" | "ETH/USDT";
export type Asset = "USDT" | "BTC" | "ETH";

export const PAIRS: Pair[] = ["BTC/USDT", "ETH/USDT"];

export function pairToAsset(pair: Pair): Asset {
  return pair.split("/")[0] as Asset;
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
