import type { TickerHandler } from "./types.js";

/**
 * REST polling fallback para pares ilíquidos donde el WS pushea esporádicamente.
 *
 * Coinbase y Kraken tienen volumen MUY bajo en ETH/BTC porque sus pares dominantes
 * son los pareados contra USD. El channel `ticker_batch` de Coinbase solo pushea
 * cuando hay trades; en pares quietos puede tardar minutos. Para mantener el
 * dashboard vivo y permitir arbitraje triangular en esos exchanges, polleamos
 * el endpoint REST cada 5s y empujamos un Ticker normalizado.
 *
 * El detector no distingue origen: WS o REST, ambos pasan por el mismo onTicker.
 */

const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;

async function pollCoinbaseETHBTC(onTicker: TickerHandler): Promise<void> {
  try {
    const res = await fetch(
      "https://api.exchange.coinbase.com/products/ETH-BTC/ticker",
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      bid?: string;
      ask?: string;
      size?: string;
    };
    if (!data.bid || !data.ask) return;
    onTicker({
      exchange: "coinbase",
      pair: "ETH/BTC",
      bid: parseFloat(data.bid),
      ask: parseFloat(data.ask),
      bidQty: parseFloat(data.size ?? "0"),
      askQty: parseFloat(data.size ?? "0"),
      timestamp: Date.now(),
    });
  } catch {
    // Errores transitorios (timeout, red) — el próximo poll lo reintenta
  }
}

async function pollKrakenETHBTC(onTicker: TickerHandler): Promise<void> {
  try {
    const res = await fetch(
      "https://api.kraken.com/0/public/Ticker?pair=ETHXBT",
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      error?: string[];
      result?: Record<string, { a: string[]; b: string[] }>;
    };
    if (data.error && data.error.length > 0) return;
    if (!data.result) return;
    const firstKey = Object.keys(data.result)[0];
    if (!firstKey) return;
    const t = data.result[firstKey];
    if (!t || !t.a || !t.b) return;
    onTicker({
      exchange: "kraken",
      pair: "ETH/BTC",
      bid: parseFloat(t.b[0]),
      ask: parseFloat(t.a[0]),
      bidQty: parseFloat(t.b[1] ?? "0"),
      askQty: parseFloat(t.a[1] ?? "0"),
      timestamp: Date.now(),
    });
  } catch {
    // Errores transitorios
  }
}

/**
 * Arranca los polls de fallback. No bloquea — los intervals corren en background.
 */
export function startRestFallback(onTicker: TickerHandler): void {
  // Poll inmediato para no esperar el primer interval
  pollCoinbaseETHBTC(onTicker);
  pollKrakenETHBTC(onTicker);
  console.log("[rest    ] ETH/BTC fallback poll started (Coinbase + Kraken, 5s)");

  setInterval(() => pollCoinbaseETHBTC(onTicker), POLL_INTERVAL_MS);
  setInterval(() => pollKrakenETHBTC(onTicker), POLL_INTERVAL_MS);
}
