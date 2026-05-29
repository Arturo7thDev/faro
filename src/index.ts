import WebSocket from "ws";

console.log("Faro starting...");

const ws = new WebSocket(
  "wss://stream.binance.com:9443/ws/btcusdt@bookTicker",
);

ws.on("open", () => {
  console.log("[Binance] Connected");
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  const bid = parseFloat(msg.b);
  const ask = parseFloat(msg.a);
  const spread = ask - bid;
  console.log(
    `[Binance] BID: $${bid.toFixed(2)} | ASK: $${ask.toFixed(2)} | Spread: $${spread.toFixed(2)}`,
  );
});

ws.on("error", (err) => {
  console.error("[Binance] error:", err.message);
});

ws.on("close", () => {
  console.log("[Binance] closed");
});
