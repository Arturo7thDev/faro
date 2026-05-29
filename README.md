# Faro · Honest BTC Arbitrage

> Real-time Bitcoin arbitrage detection across 3 exchanges (Binance.US, Coinbase, Kraken) with simulated execution and wallet tracking. The bot that executes **only** what survives fees + slippage — and shows you exactly what a retail bot would have lost on the same trades.

🚀 **[Live Demo](https://faro-dashboard.vercel.app)** · 📡 **[Backend API](https://faro-production-9be0.up.railway.app/state)** · 🖥️ **[Frontend repo](https://github.com/Arturo7thDev/practice-app)**

---

## The problem

Most arbitrage bots lie.

They show you a $14 spread between Binance and Kraken and call it a "profitable opportunity" — without subtracting the $290 in fees + slippage that eat it. Thousands of retail traders run these bots and bleed money silently, convinced they're making "small but steady" profits.

**Faro is the antithesis.** Every opportunity is evaluated against the full cost stack before execution. Every executed trade displays two numbers side by side: what Faro netted at institutional fees, and what the *same trade* would have yielded for a retail operator. The gap between those numbers is the story.

## What you see in 30 seconds

When you open the dashboard, three numbers tell the entire pitch:

| Faro arbitrage profit | Same trades at retail (0.5%) | Portfolio value |
|:---:|:---:|:---:|
| **+$4.86** (green) | **−$430.94** (red) | **$260,712** |
| 26 trades · institutional fees | What a retail bot would yield | Initial: $150,000 + 1.5 BTC |

That **88× difference** between Faro's profit and retail's loss on the *same execution path* is the killer insight: arbitrage isn't a game retail can play — and bots that promise otherwise are misleading their users.

## Architecture

```
┌────────────────────────┐         ┌──────────────────────────┐
│  3 Exchange WebSockets │         │   Frontend (Vercel)      │
│  • Binance.US          │         │   Next.js 16 + Tailwind  │
│  • Coinbase Advanced   │         │   shadcn/ui · recharts   │
│  • Kraken v2           │         └────────────┬─────────────┘
└──────────┬─────────────┘                      │ SSE (EventSource)
           │ wss://                              ▲
           ▼                                     │
┌──────────────────────────────────────────────────────────────┐
│              Backend Bot (Railway, this repo)                │
│  • 3 WS clients with reconnect + exponential backoff         │
│  • Best bid/ask tracked in memory per exchange               │
│  • Detector: evaluates all 6 directional pairs each tick     │
│  • Execution engine with wallet state + cooldown + stale skip│
│  • Circuit breaker for suspicious spreads (>2%)              │
│  • REST + SSE API exposed via hono                           │
└──────────────────────────────────────────────────────────────┘
```

This repo is the **backend bot**. The dashboard frontend lives in [`practice-app`](https://github.com/Arturo7thDev/practice-app) and consumes the SSE stream from this server.

## Key technical decisions (and why)

### Backend persistent (not serverless)

WebSockets need long-lived TCP connections. Vercel's serverless functions can't hold them open. Railway runs the bot 24/7 with auto-deploy from GitHub, which is exactly what the challenge brief asks for: *"el sistema debe estar corriendo y sea funcional en el momento de la evaluación."*

### `decimal.js` for every cents-affecting calculation

JavaScript's IEEE 754 floats break financial math: `0.1 + 0.2 === 0.30000000000000004`. For a bot that brags about precision, that would be hypocrisy. Every price, fee, and balance calculation routes through `decimal.js`. Only the final `.toFixed(2)` returns to native `number` for display.

### Three exchanges (not more)

Three creates **six directional pairs** of arbitrage detection (each exchange can be buy or sell side). That's enough for natural opportunities to emerge during normal volatility without overwhelming the dashboard or the budget. The architecture trivially extends to N exchanges via the `Ticker` adapter pattern.

### SSE for backend → frontend (not WebSocket bidirectional)

The frontend only consumes data; it never sends commands. SSE is HTTP-native, browsers auto-reconnect for free, and there's no need for bidirectional complexity. One less moving part.

### Institutional fees (0.02–0.04%) in the simulation

At retail rates (0.4–0.6%), virtually *zero* BTC arbitrage opportunities are profitable. Modeling institutional fees represents what a serious arbitrage desk (Binance VIP 9, Coinbase top tier, accessible at $4B+ monthly volume) actually pays. To preserve honesty, the "Same trade at retail" column shows what these same opportunities would yield at retail rates — and the answer is brutal: every single one becomes a loss.

### No persistent database

The bot is a stream processor. State (wallets, opportunity log, executed trades, counters) lives in memory. A Railway restart loses history. For a 48h hackathon demo, that's an acceptable trade-off — and we never claimed to be a production trading system.

### Binance.US (not Binance.com)

Railway deploys in `us-west1`. `binance.com` blocks US-based IPs with HTTP 451 for regulatory reasons. `binance.us` is the legally-equivalent endpoint with the same WebSocket API format. This kind of regional adaptation is exactly what real arbitrage operators handle daily — and Faro continued running with 2 of 3 exchanges connected before the fix landed.

## Robustness features (covered by Sprint B)

| Feature | What it does | Why it matters |
|---|---|---|
| **WebSocket reconnect** | Exponential backoff: 1s → 2s → 4s → ... → 30s | Exchanges drop connections periodically (rate limits, maintenance) |
| **Circuit breaker** | Spread > 2% of price → flagged `SUSPICIOUS`, never executed | Most "huge spreads" are stale data or fat-finger entries |
| **Stale data skip** | If any ticker is > 10s old → execution skipped | Prevents trading against ghost prices when one exchange goes quiet |
| **Per-pair cooldown** | 5s min between executions on the same buy→sell route | Avoids spamming hundreds of micro-trades on the same opportunity |
| **Capital constraints** | Trade volume capped by wallet USDT (buy) and BTC (sell) | Models real liquidity; flags `partial` when book depth < intended size |

The header counters expose this transparently: `opportunities scanned`, `profitable after fees`, `executed`, `skipped (stale data)`.

## Stack

**Backend (this repo)** — Node 22 LTS · TypeScript · `ws` · `hono` · `@hono/node-server` · `decimal.js` · `tsx` · `pnpm`

**Frontend** ([`practice-app`](https://github.com/Arturo7thDev/practice-app)) — Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · recharts · native `EventSource`

**Infra** — Backend on **Railway** (Node 22 container, auto-deploy from `main`), Frontend on **Vercel** (Next.js, auto-deploy from `main`). Zero infra config beyond linking GitHub repos.

## API

```
GET /health         → { "status": "ok" }
GET /state          → JSON snapshot (tickers, opportunities, wallets, trades, stats, counters)
GET /stream         → SSE stream, pushes snapshot every 200ms
```

## Run locally

Requires Node 22 (use `nvm install 22 && nvm use 22`) and pnpm 11.

```bash
git clone git@github.com:Arturo7thDev/faro.git
cd faro
pnpm install
pnpm dev    # tsx watch src/index.ts on port 3001
```

The server starts WebSocket clients to the 3 exchanges immediately. Visit `http://localhost:3001/state` to see the data flowing.

To run the frontend pointing at your local backend, see the [dashboard repo](https://github.com/Arturo7thDev/practice-app) and set `NEXT_PUBLIC_FARO_URL=http://localhost:3001`.

## What I did NOT implement (deliberate scope cuts)

| Cut | Why |
|---|---|
| Triangular arbitrage | Bonus per challenge brief but would consume 8+ hours. Chose depth on the linear path over breadth. |
| Persistent database (Postgres / Redis) | In-memory state is sufficient for demo. Persistence would be the first add-on for production. |
| Multi-pair (ETH, SOL, etc.) | Challenge explicitly scoped to BTC. |
| Real exchange execution | Challenge brief: simulation only. |
| Order book depth modeling | Used top-of-book quantities with `partial` flag instead. Full L2 depth would be the next refinement. |
| ML / statistical arbitrage | Out of scope for 48 hours; overkill for what BTC cross-exchange arbitrage rewards. |

## Roadmap (if this were a real product)

- **Order book depth** for accurate slippage modeling beyond top-of-book
- **Triangular arbitrage** across 3+ pairs within a single exchange
- **Latency tracking** per exchange (ms from quote to execution)
- **Withdrawal cost amortization** across rebalancing cycles
- **Strategy A/B testing** (compare detection algorithms in parallel)
- **Postgres + TimescaleDB** for trade history and post-mortem analysis

---

Built for [Coding Challenge Mexico 2026](https://www.coding-challenge-mexico.com) by [Arturo González](https://github.com/Arturo7thDev) in 48 hours.

The premise of this challenge — *"the inefficiencies of the market are out there; your job is to capture them before anyone else"* — is only half the story. The other half: most of those inefficiencies are illusions. Faro is the proof.
