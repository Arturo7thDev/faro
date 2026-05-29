export type ExchangeName = "binance" | "coinbase" | "kraken";

export interface Ticker {
  exchange: ExchangeName;
  symbol: string;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  timestamp: number;
}

export type TickerHandler = (ticker: Ticker) => void;
