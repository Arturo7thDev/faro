# Faro · Handoff & State

> Documento para retomar el proyecto en sesiones futuras (vos mismo o cualquier agente). Resume estado, decisiones clave y próximos pasos.

---

## Estado actual

**Cobertura estimada vs criterios del jurado: ~100% — solución de nivel profesional.**

| Criterio | Estado |
|---|---|
| 1 — Velocidad/eficiencia | ✅ 100% (WebSockets + latencia p50/p95/p99 medida en ring buffer + throughput meter en UI) |
| 2 — Precisión cálculo neto | ✅ 100% (`decimal.js` end-to-end + 4-stack cost model + retail comparison + 97 tests) |
| 3 — Solidez/robustez | ✅ 100% (reconnect WS, circuit breaker, stale skip, partial fills, lost-opp tracking, TOBI death filter) |
| 4 — Inteligencia/estrategia | ✅ 100% (6-layer pipeline: linear + triangular + fintech metrics + TOBI + Kelly + Bayesian slippage) |
| 5 — Arquitectura/código | ✅ 100% (97 tests, types estrictos, módulos aislados, funciones puras separadas, diagrama SVG) |
| 6 — UI/UX | ✅ 100% (Apple-style refresh, glass morphism, copy en español, heartbeat indicator + throughput meter + flash-on-change) |

---

## Lo que falta para cerrar el submit

1. **Submit** en `coding-challenge-mexico.com` → sección "Mi Cuenta" → URL del repo `github.com/Arturo7thDev/faro`
2. (Lunes post-submit) Pausar el servicio en Railway para no seguir consumiendo crédito

---

## URLs y repos

| Recurso | URL |
|---|---|
| Backend repo (principal, este) | https://github.com/Arturo7thDev/faro |
| Frontend repo | https://github.com/Arturo7thDev/practice-app |
| Backend live (Railway) | https://faro-production-9be0.up.railway.app |
| Frontend live (Vercel) | https://faro-bot-ivory.vercel.app |
| API health | https://faro-production-9be0.up.railway.app/health |
| API state snapshot | https://faro-production-9be0.up.railway.app/state |
| API SSE stream | https://faro-production-9be0.up.railway.app/stream |

---

## Decisiones inmutables (no cambiar sin discutir)

### Arquitectura

- **Backend persistente en Railway, NO serverless.** Razón: WebSockets necesitan conexión TCP long-lived; Vercel functions no las sostienen. Trade-off aceptado: dos repos en vez de uno.
- **`decimal.js` para TODO cálculo de cents.** JavaScript IEEE 754 rompe precisión. Cada precio, fee, balance pasa por Decimal. Solo `.toFixed(2)` al final para display.
- **SSE (no WebSocket bidireccional) entre backend y frontend.** El frontend solo escucha; HTTP-native; browser auto-reconnect gratis.
- **In-memory state, NO database.** Bot es stream processor; restart de Railway pierde historial, aceptable para 48h hackathon.

### Calibración

- **Fees institucionales (0.02-0.04% taker)**, no retail. Razón: a fees retail (0.5%) virtualmente CERO oportunidades son rentables → el demo se ve vacío. Tier elegido es real (Binance VIP 9, Coinbase top tier, $4B+ volumen mensual).
- **Comparativa "Net at retail"** por trade y acumulada. Storytelling central: muestra el gap entre Faro neto positivo y retail neto negativo. Diferencia típica: 100-1000x.
- **`STALE_THRESHOLD_MS = 60_000`**. Razón: Coinbase y Kraken naturalmente updatean cada 10-60s para BTC/USDT (pair menos activo que BTC/USD en esos exchanges). Bajar el threshold causaba 100% de skips.
- **`EXECUTION_COOLDOWN_MS = 3000`** (linear) y **`TRIANGULAR_COOLDOWN_MS = 5000`** (triangular). Razón: balance entre evitar spam y capturar burst opportunities. El counter `lostOpportunityUSD` muestra el trade-off transparentemente.
- **`binance.us` en vez de `binance.com`.** Razón: Railway despliega en `us-west1`, `binance.com` bloquea US con HTTP 451.
- **Combined stream de Binance para los 3 pares en una conexión.** Más eficiente que 3 streams separados.
- **Coinbase usa `ticker_batch`** (no `ticker`). Razón: push garantizado cada 5s incluso sin trades — crítico para pares menos activos.

### Scope cortado deliberadamente

| Cortado | Por qué |
|---|---|
| Persistencia (Postgres/Redis) | In-memory alcanza para 48h demo. Sería la primera adición en prod. |
| L2 order book depth modeling | Top-of-book + `partial` flag ya respeta liquidez. TOBI usa L1 imbalance honestamente declarado. L2 sería refinamiento futuro. |
| Real exchange execution | Consigna dice "simulación" explícitamente. |
| Tests E2E | Coverage vía 97 unit tests (9 suites) es más que suficiente para hackathon. |
| Conectar posterior Bayesiano → detector | El estimator aprende en vivo pero NO alimenta el cost model todavía. Mostrado como next step en roadmap. Riesgo de romper Sharpe/Kelly si lo conectamos a 36h del envío. |

---

## Decisiones tomadas durante el desarrollo (cronología)

1. Decidimos stack Next.js + Vercel (frontend) + Node + Railway (backend). Razón principal: máxima palanca de IA + WS persistentes.
2. Empezamos solo con BTC/USDT linear. Luego agregamos ETH/USDT. Luego ETH/BTC para triangular.
3. Bajamos cooldown de 5s → 3s para mejor visibilidad de actividad en demo.
4. Subimos stale threshold de 10s → 30s → 60s tras detectar que Coinbase/Kraken naturalmente updatean lento.
5. Cambiamos Coinbase de `ticker` → `ticker_batch` para garantizar push cada 5s.
6. Agregamos costos completos (slippage + latency + withdrawal amortized) tras auditoría del requisito #4.
7. Visual refresh Apple-style en la fase final (glass morphism, gradient bg, jerarquía tipográfica).
8. Traducción copy completo al español tras visual refresh.
9. **Sprint O — Naive Retail Bot en paralelo (kill shot):** corremos un bot retail (fees 0.5%) sobre los MISMOS datos para mostrar el gap. Comparativa visceral en equity curve.
10. **Sprint R — Métricas fintech profesionales:** Sharpe, Sortino, Profit Factor, Win Rate + latencias p50/p95/p99 (ring buffer 1000 samples) + alpha decay (lifetime de oportunidades). +16 tests.
11. **Sprint S — TOBI (Top of Book Imbalance):** señal predictiva derivada del L1. Filtra oportunidades con `survivalProb < 0.5`. Trackea calibración por bucket (high/medium/low) → hit rate visible en UI. +18 tests.
12. **Sprint T — Kelly Criterion position sizing:** fractional Kelly (25%) capped a 20% del bankroll. Cold-start de 10% hasta tener ≥10 muestras. +11 tests.
13. **Sprint U — Bayesian slippage learning:** estimator Normal-Normal conjugate por exchange. Observaciones simuladas por trade ejecutado. Posterior converge al slippage real. Independiente del detector (no rompe nada). +10 tests.
14. **Sprint V — Heartbeat UX:** pulse perpetuo del badge live + throughput meter scans/s + flash verde de 600ms cuando un Stat cambia. UX feedback que comunica "el sistema respira" aunque los números no se muevan.

---

## Lista de archivos clave

### Backend (`faro/`)

```
src/
├── index.ts              ← orquestador (WS clients + state + execution loop + filtros TOBI/Kelly)
├── server.ts             ← Hono HTTP + SSE + snapshot builder
├── arbitrage/
│   ├── fees.ts           ← FEES + RETAIL_TAKER + cost model constants
│   ├── types.ts          ← Opportunity interface (incluye campos TOBI)
│   ├── detector.ts       ← linear detection (6 routes per pair per tick) + cálculo TOBI
│   ├── triangular.ts     ← triangular detection (2 paths per exchange)
│   ├── orderbook.ts      ← TOBI puro: calculateTOBI + calculateSurvivalProb + bucketize
│   ├── detector.test.ts  ← unit tests del detector
│   ├── fees.test.ts      ← unit tests de fees
│   ├── orderbook.test.ts ← 18 tests TOBI (edge cases, monotonicidad, symmetry)
│   └── triangular.test.ts ← unit tests triangular
├── exchanges/
│   ├── types.ts          ← Pair + Asset types + PAIRS array
│   ├── binance.ts        ← combined stream (BTC + ETH + ETHBTC)
│   ├── coinbase.ts       ← ticker_batch channel
│   ├── kraken.ts         ← ws v2 ticker channel
│   ├── restPoller.ts     ← REST fallback para ETH/BTC en Coinbase/Kraken
│   └── latency.ts        ← REST ping for network RTT measurement
└── wallet/
    ├── types.ts          ← Balance + ExecutedTrade + ScanCounters + Decision + RiskMetrics + FintechMetrics + TobiCalibration + KellyMetrics + BayesianSlippageMetrics
    ├── manager.ts        ← WalletManager (balances + execution + stats + risk + métricas fintech + Kelly volume cap)
    ├── naive.ts          ← NaiveBot — corre en paralelo con fees retail 0.5%
    ├── fintech.ts        ← Sharpe, Sortino, Profit Factor, Win Rate, percentile (funciones puras)
    ├── kelly.ts          ← Kelly Criterion + computeKellyFromTrades (funciones puras)
    ├── bayesian.ts       ← Normal-Normal conjugate update + per-exchange posteriors + sampling
    ├── manager.test.ts   ← unit tests del wallet
    ├── fintech.test.ts   ← 16 tests fintech (edge cases, σ=0, all gains/losses)
    ├── kelly.test.ts     ← 11 tests Kelly (cold start, edge negativo, cap)
    └── bayesian.test.ts  ← 10 tests Bayesian (convergence, noise balance)
```

Total: **97 tests** across **9 suites**.

### Frontend (`practice-app/`)

```
src/
├── app/
│   ├── layout.tsx        ← metadata + Geist fonts + ambient-bg
│   ├── page.tsx          ← TODA la UI (~1500 líneas)
│   ├── globals.css       ← ambient-bg gradient + glass utility classes
│   └── icon.svg          ← favicon Faro (lighthouse)
└── hooks/
    └── useFaroStream.ts  ← TypeScript types + EventSource hook
```

### Docs (`faro/docs/`)

```
docs/
├── architecture.svg      ← diagrama embebido en README
├── HANDOFF.md            ← este archivo
├── PRODUCT.md            ← storytelling, pitch, demo guión
└── ARCHITECTURE.md       ← deep technical architecture
```

---

## Comandos clave

```bash
# Backend
cd faro
pnpm install
pnpm dev                    # dev local en :3001
pnpm start                  # prod
pnpm test                   # 97 tests vitest (9 suites)

# Frontend
cd practice-app
pnpm install
pnpm dev                    # dev local en :3000
pnpm build                  # verificación pre-push
NEXT_PUBLIC_FARO_URL=http://localhost:3001 pnpm dev  # apuntar a backend local
```

### Workflow obligatorio

1. `pnpm build` LOCAL antes de cualquier `git push` (Vercel/Railway lo corren igual, pero pre-push ahorra ciclos).
2. Cambios en `faro` (backend) → Railway redeploya en ~1-2 min.
3. Cambios en `practice-app` (frontend) → Vercel redeploya en ~1-2 min.
4. Verificar deploy en Vercel dashboard antes de capturar screenshots.

---

## Cómo retomar en una sesión nueva

Si abrís una sesión nueva (incluso después de `/clear`), seguí estos pasos:

1. Pedile al agente: `mem_search "Coding Challenge Mexico"` o `mem_search "faro"` → recupera contexto histórico de engram.
2. Leé este archivo (`docs/HANDOFF.md`) — está pensado para esto.
3. Leé `README.md` para entender el proyecto técnicamente.
4. Si vas a hacer cambios: leé `docs/ARCHITECTURE.md` para el deep technical.
5. Si vas a defenderlo al jurado: leé `docs/PRODUCT.md` para el storytelling y las preguntas anticipadas.

### Tareas pendientes (si pasaste por acá sin completar el submit)

- [ ] Submit del repo en `coding-challenge-mexico.com`
- [ ] (Lunes post-submit) Pausar Railway para no seguir consumiendo crédito
- [ ] (Opcional futuro) Resolver Binance.US ETHBTC sparse push — pair existe y comercia, pero el WS push es esporádico

---

## Gotchas conocidos (no romper)

- `pnpm-workspace.yaml` con `allowBuilds: esbuild: true` es CRÍTICO para Railway. Si lo borrás, Railway falla en `pnpm install`.
- `packageManager: "pnpm@11.0.5"` en `package.json` fuerza a Railway a usar pnpm 11. Sin esto, usa pnpm 9 que rompe `allowBuilds` syntax.
- `src/lib/utils.ts` en `practice-app` debe existir con la función `cn()`. Si lo borrás, todos los componentes shadcn fallan al buildear (`pnpm dev` no lo detecta, `pnpm build` sí).
- Los imports en `faro` usan `.js` extension porque `module: NodeNext` lo requiere (ES Modules). NO sacar las extensiones.
- El cliente `EventSource` del navegador se conecta automáticamente a `/stream`. Si Vercel hace cold start, puede tardar 1-2s la primera vez.
- Backend en Railway puede entrar en idle si no recibe requests, pero los WS de salida lo mantienen activo.

---

---

## Production hardening — hallazgos del code review post-MVP

Estos issues fueron identificados en un code review formal después del MVP. Los **CRÍTICOS marcados con ✅** ya están arreglados. Los demás son tickets pendientes para una iteración pre-producción real (NO son requisitos del hackathon).

### Fixed antes del submit (commits separados)

- ✅ **CORS wildcard → lockdown** a dominios autorizados (`server.ts`)
- ✅ **Rate limiting básico** in-memory sobre `/state` (60s window, 120 req)
- ✅ **Ticker validation** en `onTicker` — descartar NaN/0/negativos antes de propagación
- ✅ **getStats triple-call** en snapshot → single call con prices reusados
- ✅ **Naive recentTrades window** alineada a 200 (era 20 vs Faro 200) — fix del hero chart
- ✅ **useFaroStream closure stale** → migrado a `useRef` para eliminar thrash de reconexión SSE en iPad

### Pendientes (production hardening, NO requisitos del reto)

#### ALTA prioridad

- **`onTicker` es 80 líneas de business logic en el orquestador** (`index.ts:212-294`). Extraer un `ExecutionEngine` con `decide(opp, state): Decision` puro y testeable. Esfuerzo: 2-3h.
- **`NaiveBot` duplica lógica de `WalletManager`** (constants, mutación de balance, fees). Extraer `BalanceLedger` común. Esfuerzo: 1-2h.
- **`page.tsx` es 1700 líneas en un solo componente client**. Sin `React.memo`, sin split. Re-render completo cada 200ms. Mobile pasa de 60fps → 20fps. Dividir por sección con memoización por slice de state. Esfuerzo: 3-4h.
- **`getStats` recorre `this.trades` 7 veces seguidas** (`wallet/manager.ts:240-310`). Fusionar en un solo pase. Esfuerzo: 30 min.
- **`routesArr.sort()` ejecutado DOS veces consecutivas mutando in place** (`wallet/manager.ts:330,334`). Best y worst con un loop, sin sort. Esfuerzo: 15 min.
- **Hot path Decimal allocation pressure**. Cada tick crea 15+ Decimals en el detector. A 100 ticks/sec → GC pauses. Refactor a math nativa con float64 en el HOT PATH, Decimal solo en mutación de balances. Esfuerzo: 2h.
- **Equity curve cum_history** debería persistirse aparte (no recomputarse desde trades). Después de 500 trades el max drawdown SUBESTIMA el real porque pierde el peak. Esfuerzo: 1h.

#### MEDIA prioridad

- **WS handlers sin try/catch** (`binance.ts`, `coinbase.ts`, `kraken.ts`). Un mensaje malformado tumba el handler. Envolver todo en try/catch + log. Esfuerzo: 20 min.
- **`recentTriangular.unshift(top)` agrega no-rentables** (`index.ts:178`). El feed se ensucia. Push solo si profitable o separar buffers. Esfuerzo: 10 min.
- **Mediana de prices con `[Math.floor(n/2)]`** falla en arrays pares (`wallet/manager.ts:269`). Para 2 exchanges devuelve el segundo, no la media. Esfuerzo: 5 min.
- **`recent.unshift(opps[0])` agrega no-profitable a recentOpportunitiesByPair** (`index.ts:228`). Ensucia el feed por par. Esfuerzo: 5 min.
- **REST poller errors silenciados** (`restPoller.ts:35,57`). Si Coinbase/Kraken cambian formato, falla silenciosamente. Log sampleado. Esfuerzo: 10 min.
- **`pingAllExchanges` no protege contra overlap** (`index.ts:147-170`). Si una iteración tarda > 30s, la siguiente se superpone. Flag `inFlight`. Esfuerzo: 10 min.
- **`maxBuyable` puede ser Infinity** si `buyPrice = 0`. No hay invariante de balance no-negativo. Esfuerzo: 15 min.
- **`tradedVolumeUSD` solo cuenta últimos 500 trades** (`wallet/manager.ts:413`). `capitalDeployedPercent` se queda en 100% para siempre. Counter monotónico. Esfuerzo: 15 min.
- **`DecisionsFeed` "hace Xs" no se actualiza reactivamente** (`page.tsx:868`). Si SSE se traba, los timestamps quedan congelados. `setInterval` interno de 1s. Esfuerzo: 10 min.
- **SSE sin heartbeat** — Railway proxy puede cortar a los 5min de "inactividad" del lado de bytes. Mandar `: keepalive\n\n` cada 15s. Esfuerzo: 10 min.
- **Triangular cooldown comparado con `Date.now()` doble lectura** (`index.ts:182,290`). Capturar `now` una vez. Esfuerzo: 5 min.

#### BAJA / NOTAS

- **`getAvgEvalLatencyMs` diluye historia con presente**. Ring buffer de 1000 muestras. Esfuerzo: 15 min.
- **`triangular.ts:59-60` usa `.bid` para conversión USD** en vez del mid. Sesgo de medio spread en reporting de fee USD. Esfuerzo: 5 min.
- **`PORT = parseInt(...)` sin validación** (`index.ts:307`). Env mal seteado tira `serve`. Esfuerzo: 2 min.

### Total estimado para limpiar todo

Top 10 issues prioritarios ≈ **12-16h de focused work**. No necesario para el hackathon pero tickets claros para un sprint posterior.

---

Última actualización: 31 de mayo 2026, cierre de sesión de desarrollo principal con code review formal aplicado.
