# Faro · Architecture (Deep Technical)

> Companion to `README.md`. Where the README explains *what* and *why*, this document explains *how* and *trade-offs*. Audience: engineers reviewing or extending the codebase.

---

## 1. High-level system

Faro is a two-tier real-time stream processor:

- **Tier 1 (Backend / Railway)** — owns all state and decision logic. Stateless from the user's perspective (no auth, no per-user state).
- **Tier 2 (Frontend / Vercel)** — pure read-only view. Connects to backend via SSE, renders, never sends commands back.

The choice of "read-only frontend" simplifies everything: no auth, no CSRF, no mutex on state, no race conditions across users. The bot's behavior is identical whether 0 or 10,000 dashboards are open.

### Data flow

```
[3 Exchange WebSockets]
        ↓ wss://
[Backend onTicker handler]
        ↓ (per-tick)
[Linear detector] + [Triangular detector]
        ↓
[Executor (cooldown + stale check + circuit breaker + capital check)]
        ↓
[WalletManager (mutate balances + record trade)]
        ↓
[ServerState snapshot]
        ↓ SSE every 200ms
[Frontend EventSource consumer]
        ↓
[React render]
```

---

## 2. Backend modules and responsibilities

### `src/exchanges/`

Each exchange file is a self-contained adapter that converts the exchange's proprietary WebSocket format into a normalized `Ticker` shape.

**Contract**: `startExchange(onTicker: TickerHandler): void` — the function never returns; it manages its own reconnection lifecycle internally.

**Responsibilities per file**:
- Connect to the exchange's public WS feed
- Subscribe to the relevant pairs
- Parse incoming messages
- Translate to `Ticker` shape (`{ exchange, pair, bid, ask, bidQty, askQty, timestamp }`)
- Reconnect with exponential backoff on `close`

**Why per-file, not generic**: Each exchange has different connection URL, subscription protocol, message structure, and quirks. A generic abstraction would be more complex than three focused files. The adapter pattern keeps each isolated and testable.

### `src/arbitrage/`

#### `fees.ts`
Pure constants. No logic. Importing this file has no side effects.

#### `detector.ts` (linear)
Pure function. Takes a `Map<ExchangeName, Ticker>` for one pair, returns sorted `Opportunity[]`. No state, no side effects.

The detector evaluates every `(buyExchange, sellExchange)` pair where `buy.ask < sell.bid`. For each candidate, it computes:
- Gross profit (`(sellBid - buyAsk) × min(askQty, bidQty)`)
- Trading fees (taker × both sides)
- Amortized withdrawal (per-asset constant ÷ 100 trades/rebalance)
- Estimated slippage (0.002% × trade value)
- Latency cost (0.001% × trade value)
- Net profit (gross - all costs)
- Retail equivalent (same trade at 0.5% taker)
- Suspicious flag (gross spread > 2% of price)

Results sorted by `netProfit DESC` so the executor picks the most profitable first.

#### `triangular.ts`
Same pure function pattern. For one exchange with all 3 pair tickers, evaluates both 3-leg cycles:

**Path 1: USDT → ETH → BTC → USDT**
- Leg 1: buy ETH (pay ETH/USDT ask, lose USDT, gain ETH)
- Leg 2: sell ETH for BTC (use ETH/BTC bid, lose ETH, gain BTC)
- Leg 3: sell BTC for USDT (use BTC/USDT bid, lose BTC, gain USDT)

**Path 2: USDT → BTC → ETH → USDT** (reverse direction)

Each leg discounts the exchange's taker fee. A standardized `$1,000` notional starts each cycle so opportunities are comparable across cycles and exchanges.

**Math precision**: All triangular calculations use `decimal.js`. Native floating-point would accumulate errors across 3 legs.

### `src/wallet/`

#### `manager.ts`
The only stateful module in `arbitrage/` or `wallet/`. Owns `balances: Map<ExchangeName, Balance>` (with multi-asset `Balance = {usdt, btc, eth}`) and `trades[]` arrays.

**Mutation surface**: only `executeTrade` and `executeTriangular`. Both are atomic — they apply or fail entirely; no half-applied state.

**Read surface**: `getBalance`, `getAllBalances`, `getTrades`, `getStats`, `canExecuteTriangular`.

**Why class, not factory**: Encapsulation of internal counters (`tradeIdCounter`, `triangularIdCounter`) and the invariant that `balances` map is initialized exactly once.

#### Strategy: `WalletManager.getStats()`

This method does heavy lifting at every snapshot (every 200ms via SSE). It computes:
- Total profit / trading fees / amortized withdrawal / slippage / latency
- Per-pair P&L breakdown
- Best/worst route by total profit
- Risk metrics (drawdown, imbalance, exposure, capital deployed)
- Success rate (profitable / scanned)

**Performance**: `O(N)` where N = total trades. With `MAX_TRADES = 500`, this is ~3-10µs. Acceptable at 5 Hz (200ms snapshot cadence).

### `src/index.ts`

The orchestrator. Owns the live state, wires modules together, runs the execution loop.

**The execution loop** (inside `onTicker`):

```
1. Track tick stats (rate, latency)
2. Update tickers map for the incoming pair
3. If linear pair (BTC/USDT or ETH/USDT):
     - Run linear detector
     - For best profitable opp:
         - if suspicious → skip + record decision
         - if any ticker stale → skip + record decision  
         - if cooldown active → skip + record decision + sum lost opportunity
         - if no capital → skip + record decision
         - else → execute via wallet, record decision
4. Always after step 3: Run triangular detector
5. For best profitable triangular opp:
     - if any ticker stale → skip
     - if cooldown active → skip
     - if can't execute (insufficient assets) → skip
     - else → execute via wallet
```

**Why linear before triangular**: Linear opportunities are more frequent and per-trade smaller; triangular is rarer but bigger. Processing both per-tick is cheap. The cooldown per-key prevents either from dominating.

**Why per-exchange cooldown for triangular** (not per-route): A triangular trade in Binance involves all 3 pairs in Binance. Two consecutive triangular trades in Binance within 5s would be spam — the order book hasn't changed enough.

### `src/server.ts`

Hono HTTP + SSE server. Builds a snapshot object on every read.

**`/state` and `/stream` share the same snapshot logic.** `/state` is a one-shot REST endpoint (mainly for debugging via curl). `/stream` opens an SSE connection and pushes the same snapshot every 200ms.

**Why 200ms?** Tradeoff between UI smoothness and bandwidth. At 200ms (5 Hz), ticker updates feel real-time. At 100ms, the JSON payload (~25 KB) means 250 KB/s per client — too much for free-tier hosting. At 500ms, the UI feels laggy.

**Snapshot enrichment**: `enrichTicker` computes `stale` flag and `ageMs` server-side so the client doesn't need clock-sync.

---

## 3. Concurrency model

JavaScript is single-threaded. All state mutations happen in the event loop's microtask queue. There are NO locks, NO mutexes, NO race conditions — by construction.

This is one of the underrated benefits of Node for stream processing: you don't need to think about concurrency, because the runtime guarantees serialization.

The only async boundaries are:
- WebSocket message receipt (handled in order by the event loop)
- `setTimeout` for reconnect backoff
- `setInterval` for latency pings

All "concurrent" work serializes through the event loop.

### Trade-off: blocking the loop

The `onTicker` handler runs synchronously. If we made it `async` (e.g., to fetch L2 depth), we'd introduce interleaving and would need to think about state consistency.

**Decision**: keep `onTicker` synchronous. Defer any I/O (network ping) to its own `setInterval`. This keeps the execution path simple and deterministic.

---

## 4. Cost model rationale

### Why 4 components and not more

The challenge brief lists exactly 4 cost categories: trading fees, withdrawal fees, slippage estimado, latencia de red. We model all 4 to match the brief. Adding more (e.g., gas fees, regulatory withholds, opportunity cost of capital) would be scope creep without judging benefit.

### Why amortize withdrawal

A withdrawal moves BTC (or USDT) from exchange A to exchange B. Real operators don't do this per trade — they batch transfers nightly to amortize the fixed fee. We model that: divide each exchange's withdrawal fee by `N_TRADES_PER_REBALANCE = 100`.

If you change `N_TRADES_PER_REBALANCE`, the amortized cost scales inversely. 100 is conservative (assumes daily rebalance with ~100 trades/day at our scale). Production would calibrate this from real trade volume.

### Why fixed slippage instead of L2-based

We use a constant `ESTIMATED_SLIPPAGE_PCT = 0.00002` (0.002%) of trade value. The alternative — fetching L2 depth and computing actual book consumption — adds:
- A REST polling layer per exchange per pair
- Depth state management
- Detector complexity (`for level in depth: consume`)
- ~3-4 hours of refactor and testing risk

For the 48h challenge, the constant model is defensible: at top-of-book volumes, slippage IS near-zero. We chose to model it as if even top-of-book has microstructure slippage (0.002% is realistic for institutional-grade execution).

### Why latency cost separate from eval latency

- **Eval latency** = time the bot takes to process a ticker (sub-millisecond, measured)
- **Network latency** = round-trip to the exchange when placing an order (typically 50-200ms in real life)

We model network latency as a *cost*: during the RTT, the price can move adversely. Magnitude: `0.001% × trade value`. We don't actually measure this in the simulation (no real orders), but we display the measured ping RTT per exchange to show we care about latency.

---

## 5. Testing strategy

**35 tests across 4 files**, all in `*.test.ts` colocated with their target.

### What we test

- **fees.ts**: constants exist, have plausible values, retail tier is much higher than institutional
- **detector.ts**: empty inputs, no-spread cases, opportunity detection, sorting, cost components present, suspicious flag, volume cap
- **triangular.ts**: both directions return, leg structure, fair-market price has no arb, divergence triggers arb
- **wallet/manager.ts**: initial state, capacity caps (USDT, asset, opportunity), execution mutates balances, partial flag, ETH vs BTC routing

### What we deliberately don't test

- **Integration tests** (E2E): would require mocking 3 exchange WS feeds, time-consuming, low ROI for hackathon
- **Performance tests**: not promised
- **The orchestrator (`index.ts`)**: it's mostly wiring; the modules it composes are tested

### Running

```bash
pnpm test          # one shot
pnpm test:watch    # watch mode
```

Both commands use Vitest with default config (no `vitest.config.ts` needed — Vitest infers from `package.json`).

---

## 6. Extension points

If you want to add features, here's where they go:

### Add a new exchange

1. Create `src/exchanges/<name>.ts` following the pattern of `binance.ts`.
2. Add `<name>` to the `ExchangeName` union in `src/exchanges/types.ts`.
3. Add fees entry in `src/arbitrage/fees.ts`.
4. Import and start it in `src/index.ts`.

Everything else (detector, wallet, frontend) handles it automatically because they iterate over `Object.keys(FEES)` or the `exchangeStats` map.

### Add a new pair

1. Add to `Pair` union and `PAIRS` array in `src/exchanges/types.ts`.
2. Update each exchange's subscription to include the new symbol.
3. Update `pairToAsset` if the asset is new (USDT/BTC/ETH currently — add e.g. SOL).
4. Update `WalletManager` to track the new asset.
5. Update frontend `LINEAR_PAIRS` if you want it shown.

### Add a new cost component

1. Add constant to `src/arbitrage/fees.ts`.
2. Add field to `Opportunity` type.
3. Compute it in `detector.ts` (and `triangular.ts` if relevant).
4. Add to `executeTrade` in `wallet/manager.ts` to store on the trade record.
5. Display in frontend `CostBreakdown` section.

### Add a new arbitrage strategy

1. Create `src/arbitrage/<strategy>.ts` with pure detector function.
2. Wire into `onTicker` in `src/index.ts`.
3. Add UI section in frontend.

The cleanly separated detector + executor pattern means you can add statistical arbitrage, mean-reversion, momentum, etc. without touching existing strategies.

---

## 7. Performance notes

### Hot path (per ticker)

A single ticker update triggers:
- Linear detector: O(E²) where E = exchanges per pair = 3, so 6 evaluations
- Triangular detector: O(E) per pair set = 3 evaluations
- Stats computation: O(N) where N = trades, capped at 500

Total: ~9 evaluations + N stats. At ~5 ticks/sec from Binance alone, that's 45 evaluations/sec + occasional stats. Sub-millisecond per cycle.

### Snapshot construction (per 200ms)

- `Array.from(Map.values())` for 3 pairs × 3 exchanges = 9 tickers
- `slice(0, 20)` of opportunities arrays
- `WalletManager.getStats()` = O(N) trades
- Build JSON

Total: ~50-200µs per snapshot. The bottleneck is JSON serialization of the ~25 KB payload (~1ms).

### Memory

- Tickers map: O(pairs × exchanges) = 9 entries
- Recent opportunities: 100 × 3 pairs = 300 entries
- Trades: 500
- Triangular trades: 200
- Decisions: 50
- Exchange stats: 3

Total in-memory state: well under 1 MB. Railway 512 MB instance has 500x headroom.

---

## 8. Failure modes and recovery

| Failure | Detection | Recovery |
|---|---|---|
| Exchange WS drops | `ws.on('close')` event | Exponential backoff reconnect (1s → 30s max) |
| Exchange WS slow / quiet | Snapshot's `stale` flag | Execution skips trades involving stale tickers |
| Suspicious data (huge spread) | `spread / price > 2%` check | Marked `suspicious`, never executed |
| Wallet exhausted | `maxExecutableVolume() <= 0` | Skipped, counter incremented |
| Backend Railway restart | App lifecycle | All state lost; new exchanges re-connect; counters/wallets reinitialize |
| SSE client disconnect | `stream.aborted` flag | Server cleanup, no impact on bot |
| Vercel rebuild | Frontend redeploy | Browser refresh; data persists on backend |
| Network partition (Railway ↔ exchanges) | All exchanges go stale within 60s | Execution stops automatically; reconnect when restored |

The system fails gracefully in every case. There's no scenario where the bot executes on bad data or makes wallet state inconsistent.

---

## 9. Things that would change in production

1. **Persistence**: Postgres for trades, Redis for hot state, TimescaleDB for time-series ticker history. Restart wouldn't lose history.
2. **Order book L2 depth**: REST polling or depth WS streams; real slippage modeling.
3. **Multiple bot instances**: Distribute across regions for latency optimization; coordinate via central state store.
4. **Real execution**: Replace `WalletManager` mutations with REST calls to exchanges' trading APIs. Add idempotency keys, retry logic, partial fill reconciliation.
5. **Monitoring**: Prometheus metrics, Grafana dashboards, alerting on stale state / execution failures.
6. **Backtest harness**: Replay historical data through the bot, compare strategies.
7. **Strategy A/B testing**: Run multiple cost models or detection algorithms in parallel, compare.

None of these are needed for the 48h hackathon, but the architecture is designed to accept them as additions, not rewrites.

---

Last updated: end of main development session.
