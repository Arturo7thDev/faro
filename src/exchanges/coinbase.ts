import WebSocket from "ws";
import type { TickerHandler } from "./types.js";

const URL = "wss://ws-feed.exchange.coinbase.com";

export function startCoinbase(onTicker: TickerHandler): void {
  const ws = new WebSocket(URL);

  ws.on("open", () => {
    console.log("[coinbase] connected");
    ws.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: ["BTC-USDT"],
        channels: ["ticker"],
      }),
    );
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== "ticker") return;

    onTicker({
      exchange: "coinbase",
      symbol: "BTC/USDT",
      bid: parseFloat(msg.best_bid),
      ask: parseFloat(msg.best_ask),
      bidQty: parseFloat(msg.best_bid_size ?? "0"),
      askQty: parseFloat(msg.best_ask_size ?? "0"),
      timestamp: Date.now(),
    });
  });

  ws.on("error", (err) => console.error("[coinbase] error:", err.message));
  ws.on("close", () => console.log("[coinbase] closed"));
}
