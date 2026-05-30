#!/usr/bin/env python3
"""
Faro · Auditoría adversarial — reconstrucción independiente del P&L.

NO IMPORTA NADA DEL CODE DEL BOT. Las constantes están duplicadas a mano
desde fees.ts. El objetivo es recomputar desde cero y ver si los números
del dashboard cuadran al centavo.

Para correr:  python3 /tmp/faro_audit.py
"""

from __future__ import annotations
import json
import math
import statistics
import sys
import urllib.request
from typing import Any

# ─── Constantes duplicadas a mano desde faro/src/arbitrage/fees.ts ─────────
# (no las importamos, las VERIFICAMOS contra la fuente)
FEES_TAKER = {
    "binance": 0.0002,   # 0.02%
    "coinbase": 0.0004,  # 0.04%
    "kraken": 0.0004,    # 0.04%
}
WITHDRAWAL_BTC = {
    "binance": 0.0002,
    "coinbase": 0.0001,
    "kraken": 0.00009,
}
WITHDRAWAL_ETH = {
    "binance": 0.005,
    "coinbase": 0.004,
    "kraken": 0.005,
}
RETAIL_TAKER = 0.005           # 0.50%
N_TRADES_PER_REBALANCE = 100
SLIPPAGE_PCT = 0.00002         # 0.002% del trade value
LATENCY_PCT = 0.00001          # 0.001% del trade value


# ─── Helpers ───────────────────────────────────────────────────────────────
def fetch_snapshot() -> dict[str, Any]:
    with urllib.request.urlopen(
        "https://faro-production-9be0.up.railway.app/state"
    ) as r:
        return json.loads(r.read())


def fetch_binance_price(symbol: str) -> float | None:
    """Public Binance.US ticker for independent price verification."""
    try:
        url = f"https://api.binance.us/api/v3/ticker/bookTicker?symbol={symbol}"
        with urllib.request.urlopen(url, timeout=5) as r:
            d = json.loads(r.read())
            return (float(d["bidPrice"]) + float(d["askPrice"])) / 2
    except Exception as e:
        return None


def fetch_coinbase_price(product: str) -> float | None:
    """Public Coinbase Advanced ticker."""
    try:
        url = f"https://api.exchange.coinbase.com/products/{product}/ticker"
        with urllib.request.urlopen(url, timeout=5) as r:
            d = json.loads(r.read())
            return (float(d["bid"]) + float(d["ask"])) / 2
    except Exception:
        return None


# ─── PASS 2: P&L reconstruction ────────────────────────────────────────────
def recompute_trade(t: dict[str, Any], fees_taker: dict[str, float],
                    slippage_pct: float, latency_pct: float) -> dict[str, float]:
    """Recompute every cost component for one trade from raw fields."""
    pair = t["pair"]
    asset = pair.split("/")[0]  # "BTC" or "ETH"
    bp = t["buyPrice"]
    sp = t["sellPrice"]
    vol = t["executedVolume"]
    buy_ex = t["buyExchange"]
    sell_ex = t["sellExchange"]

    gross_profit = (sp - bp) * vol
    buy_fee = bp * vol * fees_taker[buy_ex]
    sell_fee = sp * vol * fees_taker[sell_ex]
    trading_fees = buy_fee + sell_fee

    # Amortized withdrawal: tomar withdrawal del sell exchange (donde acumulo el asset)
    # y convertirlo a USD usando buyPrice (mismo precio que usa el código)
    if asset == "BTC":
        wd_asset = WITHDRAWAL_BTC[sell_ex]
    else:
        wd_asset = WITHDRAWAL_ETH[sell_ex]
    withdrawal_usd = wd_asset * bp
    amortized_withdrawal = withdrawal_usd / N_TRADES_PER_REBALANCE

    avg_price = (bp + sp) / 2
    trade_value = avg_price * vol * 2  # ambas patas
    estimated_slippage = trade_value * slippage_pct
    latency_cost = trade_value * latency_pct

    total_costs = trading_fees + amortized_withdrawal + estimated_slippage + latency_cost
    net_profit = gross_profit - total_costs

    return {
        "grossProfit": gross_profit,
        "buyFee": buy_fee,
        "sellFee": sell_fee,
        "tradingFees": trading_fees,
        "amortizedWithdrawal": amortized_withdrawal,
        "estimatedSlippage": estimated_slippage,
        "latencyCost": latency_cost,
        "totalCosts": total_costs,
        "netProfit": net_profit,
    }


def reconcile(snapshot: dict[str, Any]) -> tuple[list[dict], dict]:
    """Compare recomputed vs reported per trade."""
    rows = []
    sum_diff = 0.0
    max_diff = 0.0
    for t in snapshot["executedTrades"]:
        mine = recompute_trade(t, FEES_TAKER, SLIPPAGE_PCT, LATENCY_PCT)
        diffs = {
            "trade_id": t["id"],
            "route": f"{t['buyExchange']}→{t['sellExchange']} {t['pair']}",
            "vol": t["executedVolume"],
            "reported_net": t["netProfit"],
            "recomputed_net": mine["netProfit"],
            "diff": mine["netProfit"] - t["netProfit"],
            "reported_gross": t["grossProfit"],
            "recomputed_gross": mine["grossProfit"],
            "reported_costs": t["totalCosts"],
            "recomputed_costs": mine["totalCosts"],
        }
        rows.append(diffs)
        sum_diff += diffs["diff"]
        max_diff = max(max_diff, abs(diffs["diff"]))

    summary = {
        "trade_count": len(rows),
        "sum_reported_net": sum(t["netProfit"] for t in snapshot["executedTrades"]),
        "sum_recomputed_net": sum(r["recomputed_net"] for r in rows),
        "max_single_trade_diff": max_diff,
        "cumulative_diff": sum_diff,
    }
    return rows, summary


# ─── PASS 3: stress test ───────────────────────────────────────────────────
def stress_test(snapshot: dict[str, Any]) -> list[dict]:
    """Re-run cost model with elevated slippage and latency."""
    results = []
    scenarios = [
        ("baseline", 1.0, 1.0),
        ("slippage 2x", 2.0, 1.0),
        ("slippage 3x", 3.0, 1.0),
        ("latency 2x", 1.0, 2.0),
        ("latency 3x", 1.0, 3.0),
        ("BOTH 2x", 2.0, 2.0),
        ("BOTH 3x", 3.0, 3.0),
    ]
    for name, sl, lt in scenarios:
        total_net = 0.0
        wins = 0
        losses = 0
        for t in snapshot["executedTrades"]:
            mine = recompute_trade(
                t, FEES_TAKER, SLIPPAGE_PCT * sl, LATENCY_PCT * lt
            )
            total_net += mine["netProfit"]
            if mine["netProfit"] > 0:
                wins += 1
            elif mine["netProfit"] < 0:
                losses += 1
        results.append({
            "scenario": name,
            "total_net": total_net,
            "wins": wins,
            "losses": losses,
            "still_profitable": total_net > 0,
        })
    return results


# ─── PASS 4: same-fees comparison ──────────────────────────────────────────
def same_fees_comparison(snapshot: dict[str, Any]) -> dict:
    """Re-run Faro's executed trades but with retail fees applied."""
    retail_fees = {ex: RETAIL_TAKER for ex in FEES_TAKER}
    total_net_inst = 0.0
    total_net_retail = 0.0
    for t in snapshot["executedTrades"]:
        inst = recompute_trade(t, FEES_TAKER, SLIPPAGE_PCT, LATENCY_PCT)
        retail = recompute_trade(t, retail_fees, SLIPPAGE_PCT, LATENCY_PCT)
        total_net_inst += inst["netProfit"]
        total_net_retail += retail["netProfit"]
    return {
        "trades_evaluated": len(snapshot["executedTrades"]),
        "net_at_institutional": total_net_inst,
        "net_at_retail_0.5%": total_net_retail,
        "still_profitable_at_retail": total_net_retail > 0,
        "fee_tier_advantage_usd": total_net_inst - total_net_retail,
    }


# ─── PASS 5: independent metrics recomputation ─────────────────────────────
def recompute_metrics(snapshot: dict[str, Any]) -> dict:
    nets = [t["netProfit"] for t in snapshot["executedTrades"]]
    if not nets:
        return {"error": "no trades"}

    n = len(nets)
    mean = statistics.mean(nets)
    stddev = statistics.stdev(nets) if n > 1 else 0
    sharpe = mean / stddev if stddev > 0 else None

    negatives = [x for x in nets if x < 0]
    downside_stddev = statistics.stdev(negatives) if len(negatives) > 1 else 0
    sortino = mean / downside_stddev if downside_stddev > 0 else None

    wins = [x for x in nets if x > 0]
    losses = [x for x in nets if x < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else None

    win_rate = len(wins) / n

    # Reported by dashboard:
    reported = snapshot["stats"]["fintech"]

    return {
        "n": n,
        "mean_net": mean,
        "stddev": stddev,
        "recomputed_sharpe": sharpe,
        "reported_sharpe": reported["sharpeRatio"],
        "recomputed_sortino": sortino,
        "reported_sortino": reported["sortinoRatio"],
        "recomputed_profit_factor": profit_factor,
        "reported_profit_factor": reported["profitFactor"],
        "recomputed_win_rate": win_rate,
        "reported_win_rate": reported["winRate"],
    }


# ─── PASS 1: data integrity (independent price check) ──────────────────────
def data_integrity_check(snapshot: dict[str, Any]) -> list[dict]:
    """Compare bot's reported prices vs public exchange APIs RIGHT NOW.

    Caveat: bot snapshot is from a moment ago, public APIs are NOW —
    crypto prices move so we accept ~0.5% tolerance.
    """
    checks = []
    # BTC/USDT on Binance.US
    bot_binance_btc = None
    for t in snapshot["tickersByPair"]["BTC/USDT"]:
        if t["exchange"] == "binance":
            bot_binance_btc = (t["bid"] + t["ask"]) / 2
            break
    real_binance_btc = fetch_binance_price("BTCUSDT")
    if bot_binance_btc and real_binance_btc:
        diff_pct = abs(bot_binance_btc - real_binance_btc) / real_binance_btc * 100
        checks.append({
            "instrument": "BTC/USDT @ Binance.US",
            "bot_reported": bot_binance_btc,
            "independent_source": real_binance_btc,
            "diff_pct": diff_pct,
            "within_0.5pct_tolerance": diff_pct < 0.5,
        })

    # ETH/USDT on Binance.US
    bot_binance_eth = None
    for t in snapshot["tickersByPair"]["ETH/USDT"]:
        if t["exchange"] == "binance":
            bot_binance_eth = (t["bid"] + t["ask"]) / 2
            break
    real_binance_eth = fetch_binance_price("ETHUSDT")
    if bot_binance_eth and real_binance_eth:
        diff_pct = abs(bot_binance_eth - real_binance_eth) / real_binance_eth * 100
        checks.append({
            "instrument": "ETH/USDT @ Binance.US",
            "bot_reported": bot_binance_eth,
            "independent_source": real_binance_eth,
            "diff_pct": diff_pct,
            "within_0.5pct_tolerance": diff_pct < 0.5,
        })

    # BTC/USDT on Coinbase
    bot_coinbase = None
    for t in snapshot["tickersByPair"]["BTC/USDT"]:
        if t["exchange"] == "coinbase":
            bot_coinbase = (t["bid"] + t["ask"]) / 2
            break
    real_coinbase = fetch_coinbase_price("BTC-USDT")
    if bot_coinbase and real_coinbase:
        diff_pct = abs(bot_coinbase - real_coinbase) / real_coinbase * 100
        checks.append({
            "instrument": "BTC/USDT @ Coinbase",
            "bot_reported": bot_coinbase,
            "independent_source": real_coinbase,
            "diff_pct": diff_pct,
            "within_0.5pct_tolerance": diff_pct < 0.5,
        })

    return checks


# ─── Main ──────────────────────────────────────────────────────────────────
def main():
    snap = fetch_snapshot()

    print("=" * 70)
    print("PASS 1 — DATA INTEGRITY (independent price check)")
    print("=" * 70)
    for chk in data_integrity_check(snap):
        ok = "✓" if chk["within_0.5pct_tolerance"] else "✗"
        print(f"  {ok}  {chk['instrument']}")
        print(f"      bot:    ${chk['bot_reported']:,.2f}")
        print(f"      source: ${chk['independent_source']:,.2f}")
        print(f"      diff:   {chk['diff_pct']:.4f}%")

    print()
    print("=" * 70)
    print("PASS 2 — INDEPENDENT P&L RECONSTRUCTION")
    print("=" * 70)
    rows, summary = reconcile(snap)
    print(f"  Trades en log: {summary['trade_count']}")
    print(f"  Σ reported net:    ${summary['sum_reported_net']:.6f}")
    print(f"  Σ recomputed net:  ${summary['sum_recomputed_net']:.6f}")
    print(f"  Cumulative diff:   ${summary['cumulative_diff']:.6f}")
    print(f"  Max single diff:   ${summary['max_single_trade_diff']:.6f}")
    print()
    if abs(summary["cumulative_diff"]) < 0.001:
        print("  ✓ CUADRA AL CENTAVO — reconstrucción VERIFICA el dashboard")
    else:
        print(f"  ✗ NO CUADRA — diff = ${summary['cumulative_diff']:.6f}")
        for r in rows[:5]:
            print(f"    {r['route']}: diff ${r['diff']:.6f}")
    print()
    print(f"  Cross-check vs stats.totalArbitrageProfit = "
          f"${snap['stats']['totalArbitrageProfit']:.6f}")
    cross_diff = (snap["stats"]["totalArbitrageProfit"]
                  - summary["sum_recomputed_net"])
    print(f"  Diff vs my reconstruction: ${cross_diff:.6f}")

    print()
    print("=" * 70)
    print("PASS 3 — STRESS TEST (slippage / latency sensitivity)")
    print("=" * 70)
    for s in stress_test(snap):
        ok = "✓" if s["still_profitable"] else "✗"
        print(f"  {ok}  {s['scenario']:<20} net: ${s['total_net']:>10.4f}  "
              f"(wins {s['wins']}, losses {s['losses']})")

    print()
    print("=" * 70)
    print("PASS 4 — SAME-FEES BASELINE (¿el edge depende del tier?)")
    print("=" * 70)
    sf = same_fees_comparison(snap)
    print(f"  Trades evaluados:                       {sf['trades_evaluated']}")
    print(f"  Net a fees institucionales (0.02-0.04%): ${sf['net_at_institutional']:.6f}")
    print(f"  Net a fees retail (0.5%):                ${sf['net_at_retail_0.5%']:.6f}")
    print(f"  Ventaja del tier de fees:                ${sf['fee_tier_advantage_usd']:.6f}")
    if sf["still_profitable_at_retail"]:
        print("  ✓ Faro SIGUE siendo rentable incluso a fees retail")
    else:
        print("  ✗ Si Faro pagara fees retail, sus mismos trades serían PÉRDIDA")
        print("    → La ventaja sobre Naive viene PRINCIPALMENTE del tier de fees,")
        print("      no de un filtro más inteligente.")

    print()
    print("=" * 70)
    print("PASS 5 — METRIC CORRECTNESS (Sharpe/Sortino/PF/WR recomputados)")
    print("=" * 70)
    m = recompute_metrics(snap)
    if "error" in m:
        print(f"  {m['error']}")
    else:
        def fmt(v):
            return "∞/null" if v is None else f"{v:.6f}"
        print(f"  n={m['n']}, mean=${m['mean_net']:.6f}, stddev=${m['stddev']:.6f}")
        print()
        print(f"  Metric        Recomputed       Reported          Match")
        print(f"  ─────────────────────────────────────────────────────────")
        print(f"  Sharpe        {fmt(m['recomputed_sharpe']):<16} "
              f"{fmt(m['reported_sharpe']):<16} "
              f"{'✓' if (m['recomputed_sharpe'] is None and m['reported_sharpe'] is None) or (m['recomputed_sharpe'] and m['reported_sharpe'] and abs(m['recomputed_sharpe'] - m['reported_sharpe']) < 0.001) else '✗'}")
        print(f"  Sortino       {fmt(m['recomputed_sortino']):<16} "
              f"{fmt(m['reported_sortino']):<16} "
              f"{'✓' if (m['recomputed_sortino'] is None and m['reported_sortino'] is None) else '?'}")
        print(f"  Profit factor {fmt(m['recomputed_profit_factor']):<16} "
              f"{fmt(m['reported_profit_factor']):<16} "
              f"{'✓' if (m['recomputed_profit_factor'] is None and m['reported_profit_factor'] is None) else '?'}")
        print(f"  Win rate      {fmt(m['recomputed_win_rate']):<16} "
              f"{fmt(m['reported_win_rate']):<16} "
              f"{'✓' if abs(m['recomputed_win_rate'] - m['reported_win_rate']) < 0.001 else '✗'}")

    print()
    print("=" * 70)
    print("PASS 6 — REPRODUCIBILITY")
    print("=" * 70)
    print(f"  ¿Hay log inmutable de TODOS los ticks? NO — bot keeps in-memory buffers only")
    print(f"  ¿Hay log inmutable de TODOS los trades? PARTIAL — last 200 in memory, rest lost on restart")
    print(f"  ¿Hay seed determinístico? NO — observaciones Bayesianas usan Math.random()")
    print(f"  ¿Un tercero puede reproducir? NO — al restart el estado se pierde y los ticks llegan vivos")
    print(f"  Snapshot actual auditado: timestamp {snap['timestamp']}")

    print()
    print("=" * 70)
    print("DATOS DEL CONTEXTO DEL SNAPSHOT")
    print("=" * 70)
    s = snap["stats"]
    c = snap["counters"]
    n = snap["naive"]["stats"]
    print(f"  Trades de Faro en buffer:     {len(snap['executedTrades'])}")
    print(f"  Total trades históricos:      {s['totalTrades']} (stats.totalTrades)")
    print(f"  Naive trades en buffer:       {len(snap['naive']['recentTrades'])}")
    print(f"  Naive total cumulative net:   ${n['cumulativeNet']:.4f}")
    print(f"  Naive trades históricos:      {n['totalTrades']}")
    print(f"  Oportunidades escaneadas:     {c['opportunitiesScanned']:,}")
    print(f"  Profitable detected:          {c['profitableDetected']:,}")
    print(f"  Lost opportunity USD:         ${c['lostOpportunityUSD']:.4f}")


if __name__ == "__main__":
    main()
