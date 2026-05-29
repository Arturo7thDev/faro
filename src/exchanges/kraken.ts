import WebSocket from "ws";
import type { TickerHandler } from "./types.js";

const URL = "wss://ws.kraken.com/v2";

export function startKraken(onTicker: TickerHandler): void {
  const ws = new WebSocket(URL);

  ws.on("open", () => {
    console.log("[kraken  ] connected");
    ws.send(
      JSON.stringify({
        method: "subscribe",
        params: {
          channel: "ticker",
          symbol: ["BTC/USDT"],
        },
      }),
    );
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.channel !== "ticker" || !Array.isArray(msg.data)) return;

    for (const t of msg.data) {
      onTicker({
        exchange: "kraken",
        symbol: "BTC/USDT",
        bid: t.bid,
        ask: t.ask,
        bidQty: t.bid_qty,
        askQty: t.ask_qty,
        timestamp: Date.now(),
      });
    }
  });

  ws.on("error", (err) => console.error("[kraken  ] error:", err.message));
  ws.on("close", () => console.log("[kraken  ] closed"));
}
