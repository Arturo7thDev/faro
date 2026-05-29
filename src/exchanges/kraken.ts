import WebSocket from "ws";
import type { Pair, TickerHandler } from "./types.js";

const URL = "wss://ws.kraken.com/v2";
const MAX_RECONNECT_DELAY_MS = 30_000;

const SYMBOL_TO_PAIR: Record<string, Pair> = {
  "BTC/USDT": "BTC/USDT",
  "ETH/USDT": "ETH/USDT",
};

export function startKraken(onTicker: TickerHandler): void {
  let reconnectAttempts = 0;

  function connect() {
    const ws = new WebSocket(URL);

    ws.on("open", () => {
      reconnectAttempts = 0;
      console.log("[kraken  ] connected (BTC + ETH)");
      ws.send(
        JSON.stringify({
          method: "subscribe",
          params: {
            channel: "ticker",
            symbol: ["BTC/USDT", "ETH/USDT"],
          },
        }),
      );
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.channel !== "ticker" || !Array.isArray(msg.data)) return;

      for (const t of msg.data) {
        const pair = SYMBOL_TO_PAIR[t.symbol];
        if (!pair) continue;
        onTicker({
          exchange: "kraken",
          pair,
          bid: t.bid,
          ask: t.ask,
          bidQty: t.bid_qty,
          askQty: t.ask_qty,
          timestamp: Date.now(),
        });
      }
    });

    ws.on("error", (err) =>
      console.error("[kraken  ] error:", err.message),
    );

    ws.on("close", () => {
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        1000 * Math.pow(2, reconnectAttempts),
      );
      reconnectAttempts++;
      console.log(
        `[kraken  ] disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
      );
      setTimeout(connect, delay);
    });
  }

  connect();
}
