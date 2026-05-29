import WebSocket from "ws";
import type { TickerHandler } from "./types.js";

const URL = "wss://stream.binance.com:9443/ws/btcusdt@bookTicker";

export function startBinance(onTicker: TickerHandler): void {
  const ws = new WebSocket(URL);

  ws.on("open", () => {
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

  ws.on("error", (err) => console.error("[binance ] error:", err.message));
  ws.on("close", () => console.log("[binance ] closed"));
}
