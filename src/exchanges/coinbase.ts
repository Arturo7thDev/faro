import WebSocket from "ws";
import type { Pair, TickerHandler } from "./types.js";

const URL = "wss://ws-feed.exchange.coinbase.com";
const MAX_RECONNECT_DELAY_MS = 30_000;

const PRODUCT_TO_PAIR: Record<string, Pair> = {
  "BTC-USDT": "BTC/USDT",
  "ETH-USDT": "ETH/USDT",
};

export function startCoinbase(onTicker: TickerHandler): void {
  let reconnectAttempts = 0;

  function connect() {
    const ws = new WebSocket(URL);

    ws.on("open", () => {
      reconnectAttempts = 0;
      console.log("[coinbase] connected (BTC + ETH)");
      // ticker_batch: push cada 5s garantizado (vs ticker que solo pushea en cambios).
      // Crítico para mantener data fresca en pares menos activos.
      ws.send(
        JSON.stringify({
          type: "subscribe",
          product_ids: ["BTC-USDT", "ETH-USDT"],
          channels: ["ticker_batch"],
        }),
      );
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "ticker") return;
      const pair = PRODUCT_TO_PAIR[msg.product_id];
      if (!pair) return;

      onTicker({
        exchange: "coinbase",
        pair,
        bid: parseFloat(msg.best_bid),
        ask: parseFloat(msg.best_ask),
        bidQty: parseFloat(msg.best_bid_size ?? "0"),
        askQty: parseFloat(msg.best_ask_size ?? "0"),
        timestamp: Date.now(),
      });
    });

    ws.on("error", (err) =>
      console.error("[coinbase] error:", err.message),
    );

    ws.on("close", () => {
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        1000 * Math.pow(2, reconnectAttempts),
      );
      reconnectAttempts++;
      console.log(
        `[coinbase] disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
      );
      setTimeout(connect, delay);
    });
  }

  connect();
}
