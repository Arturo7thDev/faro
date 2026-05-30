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
| Sin métricas de riesgo | Drawdown, exposure, imbalance, circuit breaker |
| Sin transparencia de decisión | Live decisions feed con razón por cada skip |
| Sin medición real de latencia | RTT real a cada exchange via REST ping cada 30s |
| Sin tests | 35 unit tests cubriendo cost model, detector, wallet |

---

## 4. Killer insight (la frase que vendés en 10 segundos)

> **"Cualquier bot puede mostrarte una ganancia. Faro te muestra la única que es real."**

Variantes para distintas audiencias:

- **Para jurado técnico**: "Modelo de costos 4-stack: cada trade descuenta fees, slippage, withdrawal y latencia antes de decidir ejecutar. La comparativa retail por trade demuestra que sin ese modelo, el mismo bot perdería 100-1000× más."
- **Para audiencia financiera**: "Faro ejecuta 26 trades para ganar $4.86 netos. Los mismos 26 trades a fees retail hubieran perdido $430. Esa es la matemática real del arbitraje a escala."
- **Para audiencia general**: "Es un bot de arbitraje BTC que cuenta toda la verdad — incluso cuando la verdad es que no hay oportunidad."

---

## 5. Guión del demo (Loom 60-90s)

### Setup técnico

- Grabá en pantalla completa, browser en https://faro-bot-ivory.vercel.app
- Audio claro, hablá despacio
- No leas el guión — internalizalo, hablalo natural

### Guión

> **(0:00 - 0:08) HOOK con texto en pantalla**
> 
> "La mayoría de bots de arbitraje cripto mienten. Te muestran un spread de $14 entre Binance y Kraken y dicen 'ganaste plata' — sin restar los $290 de fees que se la comieron."
>
> *Pantalla: dashboard general, scroll lento al hero.*

> **(0:08 - 0:25) LA REVELACIÓN VISUAL**
>
> "Esto es Faro. Mirá estos cinco números."
>
> *Zoom al hero stats. Cursor apuntando.*
>
> "Ganó $4.86 reales en 26 trades. Las mismas 26 trades, a fees retail, hubieran perdido $431. 88 veces de diferencia, en el mismo camino de ejecución."

> **(0:25 - 0:40) LA PRUEBA POR TRADE**
>
> *Scroll a la tabla de "Trades ejecutados".*
>
> "Cada fila muestra los dos cálculos: Neto Faro en verde, neto a retail en rojo. Trades reales contra data en vivo de tres exchanges."

> **(0:40 - 0:55) EL DESGLOSE DE COSTOS**
>
> *Scroll a "Desglose completo de costos".*
>
> "Y acá está el cómo. Cuatro componentes: fees de trading, retiro amortizado, slippage estimado, latencia de red. La mayoría de bots solo cuentan el primero."

> **(0:55 - 1:10) LA SOFISTICACIÓN**
>
> *Scroll al header counters + bot decisions panel.*
>
> "20,000 oportunidades escaneadas, 330 rentables tras fees, 26 ejecutadas. El resto las descartamos: cooldown, data vieja, capital insuficiente, spreads sospechosos. Cada decisión justificada y visible."

> **(1:10 - 1:25) BONUS TRIANGULAR**
>
> *Scroll a la sección "Arbitraje triangular".*
>
> "Además: arbitraje triangular dentro de cada exchange usando ETH como puente entre BTC y USDT. Cuando el mercado se desbalancea, Faro lo ejecuta como un solo trade atómico de tres patas."

> **(1:25 - 1:30) CIERRE**
>
> *Volver a hero.*
>
> "Faro. El bot que solo ejecuta lo que de verdad ganás. Coding Challenge Mexico, 2026."

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
Primer paso: persistencia (Postgres + TimescaleDB) para trade history. Segundo: order book L2 depth para slippage real. Tercero: arbitraje triangular cross-exchange (no solo intra). Cuarto: harness de A/B para comparar estrategias en paralelo.

### "¿Tu bot ganaría plata real?"
A fees institucionales, sí — los números que ves son reales sobre el modelo simulado. A retail, no — y lo demostramos transparentemente con la columna "Neto en retail" en cada trade ejecutado.

---

## 8. Mensaje final si se pregunta "¿por qué este proyecto?"

> "El Coding Challenge Mexico nos pidió un bot de arbitraje BTC. Yo no quería entregar otro bot que repite la mentira que ya inunda el mercado cripto. Entregué uno que muestra la verdad, incluso cuando la verdad es incómoda — y especialmente cuando lo es. Esa honestidad es el producto."
