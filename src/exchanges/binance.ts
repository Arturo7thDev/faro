import WebSocket from "ws";
import type { Pair, TickerHandler } from "./types.js";

// Combined stream con ambos pares en una conexión
const URL =
  "wss://stream.binance.us:9443/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker";
const MAX_RECONNECT_DELAY_MS = 30_000;

const SYMBOL_TO_PAIR: Record<string, Pair> = {
  BTCUSDT: "BTC/USDT",
  ETHUSDT: "ETH/USDT",
};

export function startBinance(onTicker: TickerHandler): void {
  let reconnectAttempts = 0;

  function connect() {
    const ws = new WebSocket(URL);

    ws.on("open", () => {
      reconnectAttempts = 0;
      console.log("[binance ] connected (BTC + ETH)");
    });

    ws.on("message", (data) => {
      const wrapped = JSON.parse(data.toString());
      const msg = wrapped.data ?? wrapped; // combined stream envuelve en {stream, data}
      const pair = SYMBOL_TO_PAIR[msg.s];
      if (!pair) return;
      onTicker({
        exchange: "binance",
        pair,
        bid: parseFloat(msg.b),
        ask: parseFloat(msg.a),
        bidQty: parseFloat(msg.B),
        askQty: parseFloat(msg.A),
        timestamp: Date.now(),
      });
    });

    ws.on("error", (err) =>
      console.error("[binance ] error:", err.message),
    );

    ws.on("close", () => {
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        1000 * Math.pow(2, reconnectAttempts),
      );
      reconnectAttempts++;
      console.log(
        `[binance ] disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
      );
      setTimeout(connect, delay);
    });
  }

  connect();
}
