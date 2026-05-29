import WebSocket from "ws";
import type { TickerHandler } from "./types.js";

const URL = "wss://stream.binance.us:9443/ws/btcusdt@bookTicker";
const MAX_RECONNECT_DELAY_MS = 30_000;

export function startBinance(onTicker: TickerHandler): void {
  let reconnectAttempts = 0;

  function connect() {
    const ws = new WebSocket(URL);

    ws.on("open", () => {
      reconnectAttempts = 0;
      console.log("[binance ] connected");
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      onTicker({
        exchange: "binance",
        symbol: "BTC/USDT",
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
