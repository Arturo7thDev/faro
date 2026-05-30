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

## 5. Anticipá las preguntas del jurado

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

### "¿Cómo sé que tus números no están inflados?" (auditoría adversarial)
Antes del submit ejecuté una auditoría externa adversarial contra mí mismo, documentada en `docs/AUDIT.md`. Recompuse el P&L de los trades ejecutados desde fórmulas duplicadas a mano, sin importar el código de contabilidad del bot. **El diff cumulative es de $0.000000.** Cuadra al centavo. Los precios reportados los verifiqué contra Binance.US y Coinbase Advanced públicos, diff de 0.0000%. El script de auditoría está incluido en el repo y cualquiera puede reproducirlo.

### "¿Tu edge sobrevive a slippage real más alto?"
Stress test honesto, también en `docs/AUDIT.md`: el edge sobrevive 2x slippage (aunque cae 73%), rompe a 3x. Si ambos slippage y latency suben 2x simultáneamente, también rompe. Es positivo bajo asunciones favorables, no robusto bajo asunciones adversas. Lo declaro porque cualquier jurado quant lo calcula en su cabeza igual — esconderlo sería peor que declararlo.

### "¿La ventaja sobre el bot Naive viene del filtro o del tier de fees?"
Principalmente del tier. Re-corrí los mismos 4 trades de Faro pero pagando fees retail (0.5%): habrían sido pérdida de $67.97. **El filtro inteligente solo, a fees retail, también pierde.** La tesis correcta del producto NO es "Faro filtra mejor que Naive". Es: "el arbitraje retail es matemáticamente imposible incluso con filtro perfecto — solo la combinación tier institucional + filtro honesto produce un edge, y ninguna pieza alcanza por separado". Esta atribución honesta está en el subtitle de la sección de comparativa.

### "¿Cuántas observaciones tienes?"
Pocas — el bot lleva runtime corto post-deploy y opera en mercados donde fees institucionales hacen rentables solo una fracción muy pequeña de oportunidades. Con n=4 trades, métricas como Sharpe no son señal sino ruido. La UI lo declara explícitamente cuando totalTrades < 10 con un banner que avisa que los números necesitan más muestras para ser estadísticamente informativos.

---

## 6. Mensaje final si se pregunta "¿por qué este proyecto?"

> "El Coding Challenge Mexico nos pidió un bot de arbitraje BTC. Yo no quería entregar otro bot que repite la mentira que ya inunda el mercado cripto. Entregué uno que muestra la verdad, incluso cuando la verdad es incómoda — y especialmente cuando lo es. Esa honestidad es el producto."
