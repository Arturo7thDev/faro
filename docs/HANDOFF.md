# Faro · Handoff & State

> Documento para retomar el proyecto en sesiones futuras (vos mismo o cualquier agente). Resume estado, decisiones clave y próximos pasos.

---

## Estado actual

**Cobertura estimada vs criterios del jurado: ~97%.**

| Criterio | Estado |
|---|---|
| 1 — Velocidad/eficiencia | ✅ 95% (WebSockets + latencia real medida + throughput visible) |
| 2 — Precisión cálculo neto | ✅ 100% (`decimal.js` end-to-end + 4-stack cost model + retail comparison) |
| 3 — Solidez/robustez | ✅ 95% (reconnect WS, circuit breaker, stale skip, partial fills, lost-opp tracking) |
| 4 — Inteligencia/estrategia | ✅ 100% (linear + triangular arbitrage, multi-pair, priorización por NET) |
| 5 — Arquitectura/código | ✅ 95% (35 tests, types estrictos, módulos aislados, diagrama SVG) |
| 6 — UI/UX | ✅ 95% (Apple-style refresh, glass morphism, jerarquía tipográfica, copy en español) |

---

## Lo que falta para cerrar el submit

1. **Screenshots permanentes** (no carpetas temporales). Guardar en `docs/screenshots/`:
   - `hero.png` — Top del dashboard: pill live + tagline "Arbitraje cripto **honesto.**" + ticker card BTC/ETH a la derecha
   - `costs.png` — Sección "Desglose completo de costos" con las 5 cards
   - `trades.png` — Tabla "Trades ejecutados" mostrando columnas Neto Faro vs Neto en retail
   - `triangular.png` — Sección "Arbitraje triangular" con métricas + tabla de ciclos
   - `strategy.png` — Sección "Estrategia" + "Decisiones del bot" + "Métricas de riesgo"
   - `equity.png` — Curva de equity en vivo
2. **Demo video Loom 60-90s** (guión en `docs/PRODUCT.md`)
3. **Submit** en `coding-challenge-mexico.com` → sección "Mi Cuenta" → URL del repo `github.com/Arturo7thDev/faro`

---

## URLs y repos

| Recurso | URL |
|---|---|
| Backend repo (principal, este) | https://github.com/Arturo7thDev/faro |
| Frontend repo | https://github.com/Arturo7thDev/practice-app |
| Backend live (Railway) | https://faro-production-9be0.up.railway.app |
| Frontend live (Vercel) | https://practice-app-ivory.vercel.app |
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
| L2 order book depth modeling | Top-of-book + `partial` flag ya respeta liquidez según consigna. Modelar L2 sería refinamiento, no requisito. |
| Real exchange execution | Consigna dice "simulación" explícitamente. |
| Tests E2E | Coverage vía 35 unit tests es suficiente para hackathon. |

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

---

## Lista de archivos clave

### Backend (`faro/`)

```
src/
├── index.ts              ← orquestador (WS clients + state + execution loop)
├── server.ts             ← Hono HTTP + SSE + snapshot builder
├── arbitrage/
│   ├── fees.ts           ← FEES + RETAIL_TAKER + cost model constants
│   ├── types.ts          ← Opportunity interface
│   ├── detector.ts       ← linear detection (6 routes per pair per tick)
│   ├── triangular.ts     ← triangular detection (2 paths per exchange)
│   ├── detector.test.ts  ← 9 unit tests
│   ├── fees.test.ts      ← 6 unit tests
│   └── triangular.test.ts ← 7 unit tests
├── exchanges/
│   ├── types.ts          ← Pair + Asset types + PAIRS array
│   ├── binance.ts        ← combined stream (BTC + ETH + ETHBTC)
│   ├── coinbase.ts       ← ticker_batch channel
│   ├── kraken.ts         ← ws v2 ticker channel
│   └── latency.ts        ← REST ping for network RTT measurement
└── wallet/
    ├── types.ts          ← Balance + ExecutedTrade + ExecutedTriangularTrade + ScanCounters + Decision + RiskMetrics
    ├── manager.ts        ← WalletManager class (multi-asset balances + execution + stats + risk)
    └── manager.test.ts   ← 13 unit tests
```

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
pnpm test                   # 35 tests vitest

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
5. Si vas a defenderlo al jurado o grabar demo: leé `docs/PRODUCT.md` para el storytelling.

### Tareas pendientes (si pasaste por acá sin completar el submit)

- [ ] Capturar 5-6 screenshots permanentes
- [ ] Grabar demo Loom 60-90s con el guión de `docs/PRODUCT.md`
- [ ] Submit del repo en `coding-challenge-mexico.com`
- [ ] (Opcional post-submit) Resolver Binance.US ETHBTC sparse push — pair existe y comercia, pero el WS push es esporádico

---

## Gotchas conocidos (no romper)

- `pnpm-workspace.yaml` con `allowBuilds: esbuild: true` es CRÍTICO para Railway. Si lo borrás, Railway falla en `pnpm install`.
- `packageManager: "pnpm@11.0.5"` en `package.json` fuerza a Railway a usar pnpm 11. Sin esto, usa pnpm 9 que rompe `allowBuilds` syntax.
- `src/lib/utils.ts` en `practice-app` debe existir con la función `cn()`. Si lo borrás, todos los componentes shadcn fallan al buildear (`pnpm dev` no lo detecta, `pnpm build` sí).
- Los imports en `faro` usan `.js` extension porque `module: NodeNext` lo requiere (ES Modules). NO sacar las extensiones.
- El cliente `EventSource` del navegador se conecta automáticamente a `/stream`. Si Vercel hace cold start, puede tardar 1-2s la primera vez.
- Backend en Railway puede entrar en idle si no recibe requests, pero los WS de salida lo mantienen activo.

---

Última actualización: 31 de mayo 2026, cierre de sesión de desarrollo principal.
