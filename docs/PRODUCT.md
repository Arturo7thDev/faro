# Faro · Producto, Storytelling y Demo

> Documento para defender el proyecto frente al jurado del Coding Challenge Mexico 2026. Aquí vive la narrativa, el pitch, el guión del demo y los mensajes clave.

---

## 1. El problema que resuelve Faro

### Lo que el mercado promete

Cuando un retail trader busca "bot de arbitraje BTC" en YouTube o foros cripto, encuentra cientos de promesas:

> "Gana $1,200 por mes con arbitraje automático entre Binance y Coinbase."
> "Compra a $73,000, vende a $73,014, repetí 100 veces al día."
> "Spreads garantizados todos los días, todos los exchanges."

### La realidad que esconden

Esos números asumen **trading fees = 0**.

Tomamos un spread real entre Binance y Kraken un viernes a las 11:42 hora central:

| Concepto | Valor |
|---|---|
| Spread bruto | $14.21 por BTC |
| Trading fees a 0.5% retail | $293.50 por BTC |
| Slippage estimado | $0.22 por BTC |
| Withdrawal amortizado | $0.07 por BTC |
| Latencia de red | $0.04 por BTC |
| **Neto real** | **−$279.62 por BTC** |

Los videos de YouTube celebran los $14.21. Los bots de retail los ejecutan. Los traders pierden plata sin darse cuenta — pierden centavos por trade, cientos de trades por mes, y al cierre de mes ven una "ganancia" en bruto que es un agujero en neto.

### Lo que hace Faro

Faro es la antítesis: un bot que **descuenta el stack completo de costos antes de decidir ejecutar**.

- ✅ Trading fees (taker × ambos lados)
- ✅ Withdrawal fees amortizados sobre ciclos de rebalance
- ✅ Slippage estimado más allá del top-of-book
- ✅ Costo de latencia de red durante el round-trip

Y para cada trade, muestra dos números lado a lado:
1. **Lo que Faro ganó** (a fees institucionales)
2. **Lo que el mismo trade habría dado a fees retail**

El gap entre esos dos números es la historia que ningún competidor cuenta.

---

## 2. Target del producto

### Operador ideal

- Volumen mensual > $1M (acceso a fees institucionales reales)
- Capital virtual o real distribuido entre múltiples exchanges
- Stack técnico para auto-deploy + monitoreo 24/7
- Tolerancia para que la mayoría de oportunidades aparentes sean rechazadas

### Quién NO debería usar Faro (honestidad declarada)

- Retail con fees de 0.4-0.6% — el bot CORRECTAMENTE rechaza el 99.9% de las oportunidades porque a esos fees no hay arbitraje BTC simple posible
- Operadores que buscan "ganancia rápida" sin entender por qué los costos reales matan los spreads aparentes

---

## 3. Diferenciadores frente a otros bots de arbitraje

| Lo que la mayoría tiene | Lo que Faro agrega |
|---|---|
| Detección de spreads brutos | Cálculo NETO con 4-stack cost model |
| Trading fees solamente | + Withdrawal amortizado + Slippage + Latencia |
| Una sola estrategia | Linear cross-exchange **Y** triangular intra-exchange |
| Un solo par (BTC) | BTC + ETH simultáneamente |
| Sin métricas profesionales | **Sharpe, Sortino, Profit Factor, Win Rate, Latencia p50/p95/p99, Alpha decay** |
| Reactivo (ejecuta lo que ve) | **TOBI**: predice cuáles oportunidades sobreviven, filtra las que mueren |
| Sizing fijo o arbitrario | **Kelly Criterion**: position size matemáticamente óptimo según edge observada |
| Cost model estático | **Bayesian slippage learning**: posterior por exchange, converge al valor real online |
| Sin métricas de riesgo | Drawdown, exposure, imbalance, circuit breaker |
| Sin transparencia de decisión | Live decisions feed con razón por cada skip |
| Sin medición real de latencia | RTT real a cada exchange via REST ping cada 30s |
| Sin tests | **97 unit tests across 9 suites** |

---

## 4. Killer insight (la frase que vendés en 10 segundos)

> **"Cualquier bot puede mostrarte una ganancia. Faro te muestra la única que es real."**

Variantes para distintas audiencias:

- **Para jurado técnico**: "Arquitectura de decisión cuantitativa de 6 capas: ingestión + cost model 4-stack + métricas fintech profesionales + señal TOBI predictiva + Kelly Criterion sizing + Bayesian learning. 97 tests, sub-2ms p99 de procesamiento, todo auditable."
- **Para audiencia financiera**: "Faro habla el idioma de la industria: Sharpe, Sortino, Profit Factor, alpha decay. Y demuestra que el filtro TOBI sobre el orderbook discrimina supervivencia con calibración en vivo."
- **Para audiencia general**: "Es un bot de arbitraje BTC que cuenta toda la verdad — incluso cuando la verdad es que no hay oportunidad — y que toma decisiones como las que tomaría un trading desk profesional."

---

## 5. Guión del demo (Loom 60-90s)

### Setup técnico

- Grabá en pantalla completa, browser en https://faro-bot-ivory.vercel.app
- Audio claro, hablá despacio
- No leas el guión — internalizalo, hablalo natural

### Guión (versión 90s con las 6 capas)

> **(0:00 - 0:08) HOOK**
>
> "La mayoría de bots de arbitraje cripto mienten. Te muestran un spread de catorce dólares entre Binance y Kraken y dicen 'ganaste plata' — sin restar los doscientos noventa dólares de fees que se la comieron."
>
> *Pantalla: dashboard, scroll lento al hero.*

> **(0:08 - 0:20) LA REVELACIÓN VISUAL**
>
> "Esto es Faro. Faro es honesto. Mirá estos cinco números."
>
> *Zoom al hero stats. Cursor apuntando.*
>
> "Faro gana $X reales. Los mismos trades a fees retail hubieran perdido $Y. Casi Z veces de diferencia, en el mismo camino de ejecución."

> **(0:20 - 0:32) DESGLOSE DE COSTOS**
>
> *Scroll a "Desglose completo de costos".*
>
> "Y acá está el cómo. Cuatro componentes: fees de trading, retiro amortizado, slippage estimado, latencia de red. La mayoría de bots solo cuentan el primero. Faro modela los cuatro."

> **(0:32 - 0:45) MÉTRICAS FINTECH PROFESIONALES**
>
> *Scroll a "Métricas fintech profesionales".*
>
> "Pero modelar costos es la mitad. Acá está la otra: las métricas que el jurado fintech reconoce como estándar de industria. Sharpe ratio, Sortino, Profit Factor, Win Rate. Más latencias de procesamiento percentiles: p50, p95, p99 — sub-dos-milisegundos en el peor uno por ciento."

> **(0:45 - 1:00) TOBI · LA SEÑAL PREDICTIVA**
>
> *Scroll a "TOBI · Top of Book Imbalance".*
>
> "Y todavía hay más. Para cada oportunidad detectada, Faro calcula una probabilidad de supervivencia basada en el desbalance del orderbook. Si el modelo predice que la oportunidad va a morir antes de capturarse, el bot NO la persigue. Acá está la calibración en vivo: las clasificadas como alta supervivencia viven más que las de baja. Prueba científica con datos en producción, sin papers."

> **(1:00 - 1:15) KELLY + BAYESIAN**
>
> *Scroll a "Kelly Criterion" y luego a "Bayesian slippage learning".*
>
> "Cada trade se sizea con Kelly Criterion: matemáticamente óptimo según la edge observada. Y un estimador Bayesiano aprende online el slippage real por exchange — el posterior converge en vivo, alimentaría el cost model en producción."

> **(1:15 - 1:25) CIERRE**
>
> *Volver al hero.*
>
> "Seis capas de inteligencia cuantitativa. Noventa y siete tests. Sub-dos-milisegundos por decisión. Los bots de hackathon hacen una capa. Faro hace seis. Esto no es un bot de hackathon — esto es lo que hace un sistema profesional."

### Guión alternativo (versión corta 60s)

Si el tiempo aprieta, comprimí así:

> **(0:00 - 0:10)** Hook — los bots mienten, $14 spread pero −$290 después de fees.
> **(0:10 - 0:25)** Hero — Faro $X vs retail −$Y, diferencia visible.
> **(0:25 - 0:40)** Desglose costos + métricas fintech (p99 latency, Sharpe).
> **(0:40 - 0:55)** TOBI + Kelly + Bayesian — "tres capas más que el bot de hackathon promedio no tiene: predicción de supervivencia, sizing científico, learning online".
> **(0:55 - 1:00)** Cierre — "seis capas. noventa y siete tests. esto es profesional".

---

## 6. Estructura del README para submission

El README en la raíz del repo está estructurado así (no romper sin razón):

1. Título + tagline + links live
2. El problema (sin tecnicismos, vendido)
3. Lo que ve el jurado en 30 segundos (los 4 números hero)
4. Arquitectura visual (SVG embebido)
5. Feature matrix vs requisitos del reto
6. Cobertura de criterios de evaluación
7. Decisiones técnicas con WHY
8. Features de robustez
9. Strategy intelligence
10. Triangular detection (cómo funciona)
11. Stack
12. API + payload schema
13. Tests
14. Run locally
15. What I did NOT implement (cortes deliberados)
16. Roadmap
17. Cierre emocional

---

## 7. Anticipá las preguntas del jurado

### "¿Por qué no probaste en exchanges reales?"
La consigna del reto dice "simulación". Hacerlo real necesita API keys con permisos de trading, KYC, capital inicial real, y la responsabilidad de pérdidas reales. Para 48h de hackathon, simulación con data en vivo era el balance correcto entre realismo y alcance.

### "¿Por qué no L2 order book depth?"
Capeamos el volumen al top-of-book, que es la interpretación MÁS conservadora de "respetar liquidez del order book". Modelar profundidad L2 nos haría ejecutar trades MÁS grandes, no más respetuosos de la liquidez. Documentamos esta decisión en `docs/HANDOFF.md`.

### "¿Por qué fees institucionales y no retail?"
A fees retail (0.4-0.6%), virtualmente CERO oportunidades son rentables. Modelando institucional (0.02-0.04%, tier real para operadores con $4B+ volumen mensual), el demo es viable. Pero para no esconder la realidad, mostramos en cada trade el "Neto en retail" — y queda claro que cada ganancia es una pérdida si fueras retail.

### "¿Por qué Binance.US y no Binance.com?"
Railway despliega en `us-west1`. `binance.com` bloquea US IPs con HTTP 451 por regulación SEC. `binance.us` es la versión US-legal con la misma API. Faro adapta automáticamente — exactamente lo que hace un operador real cuando enfrenta restricciones regionales.

### "¿Cómo escalarías esto a producción?"
Primer paso: conectar el posterior Bayesiano al detector — el cost model pasa de estático a exchange-aware self-improving. Segundo: persistencia (Postgres + TimescaleDB) para trade history. Tercero: order book L2 depth para slippage real y TOBI con features más ricas. Cuarto: harness de A/B para comparar parametrizaciones de TOBI/Kelly en paralelo. Quinto: arbitraje triangular cross-exchange (no solo intra).

### "¿Cómo funciona TOBI exactamente?"
Top of Book Imbalance es una señal L1 derivada de los volúmenes del mejor bid y mejor ask. `TOBI = (bidQty − askQty) / (bidQty + askQty)`. Si el exchange donde compramos tiene presión vendedora (TOBI negativo) y el exchange donde vendemos tiene presión compradora (TOBI positivo), la spread va a crecer y la oportunidad va a vivir más. Normalizamos a probabilidad y bucketizamos. El bot bloquea ejecución cuando `survivalProb < 0.5`, y el hit rate por bucket valida en vivo que el modelo discrimina.

### "¿Por qué Fractional Kelly y no Kelly completo?"
Kelly completo (f*) maximiza el crecimiento geométrico esperado del bankroll, pero tiene varianza brutal: drawdowns intermedios del 50%+ son normales antes de converger. En la práctica los traders profesionales usan Fractional Kelly (25-50%) para suavizar la curva. Nosotros usamos 25% con cap absoluto del 20% del bankroll por trade. Hasta los primeros 10 trades válidos usamos una fracción default de 10% para no apostar agresivo sobre estadísticas inestables.

### "¿Qué hace Bayesian slippage learning si no afecta el detector?"
Demuestra el modelo. El estimator mantiene un posterior por exchange y converge al slippage real de cada uno. Si lo conectáramos al detector — y eso es lo natural en producción — el cost model dejaría de usar un estimate global de 5 bps para usar valores diferenciados por exchange. Lo dejamos desconectado adrede a 36h del envío para no arriesgar romper Sharpe/Kelly/TOBI. El UI muestra el "delta vs estático" para que el jurado vea exactamente cuánto mejoraría el sistema.

### "¿Tu bot ganaría plata real?"
A fees institucionales, sí — los números que ves son reales sobre el modelo simulado. A retail, no — y lo demostramos transparentemente con la columna "Neto en retail" en cada trade ejecutado.

---

## 8. Mensaje final si se pregunta "¿por qué este proyecto?"

> "El Coding Challenge Mexico nos pidió un bot de arbitraje BTC. Yo no quería entregar otro bot que repite la mentira que ya inunda el mercado cripto. Entregué uno que muestra la verdad, incluso cuando la verdad es incómoda — y especialmente cuando lo es. Esa honestidad es el producto."
