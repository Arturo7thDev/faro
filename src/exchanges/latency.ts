import { performance } from "node:perf_hooks";
import type { ExchangeName } from "./types.js";

/**
 * Endpoints de ping ligero para medir RTT real a cada exchange.
 * Llamados periódicamente desde index.ts.
 */
const PING_ENDPOINTS: Record<ExchangeName, string> = {
  binance: "https://api.binance.us/api/v3/ping",
  coinbase: "https://api.exchange.coinbase.com/time",
  kraken: "https://api.kraken.com/0/public/Time",
};

export async function measureLatency(
  exchange: ExchangeName,
): Promise<number | null> {
  try {
    const start = performance.now();
    const res = await fetch(PING_ENDPOINTS[exchange], {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    // Drenar el body para que el RTT incluya el response completo
    await res.text();
    return performance.now() - start;
  } catch {
    return null;
  }
}
