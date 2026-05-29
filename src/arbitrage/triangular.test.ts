import { describe, expect, it } from "vitest";
import type { ExchangeName, Ticker } from "../exchanges/types.js";
import {
  TRIANGULAR_NOTIONAL_USDT,
  detectTriangular,
} from "./triangular.js";

function mk(
  exchange: ExchangeName,
  pair: Ticker["pair"],
  bid: number,
  ask: number,
): Ticker {
  return {
    exchange,
    pair,
    bid,
    ask,
    bidQty: 100,
    askQty: 100,
    timestamp: Date.now(),
  };
}

describe("detectTriangular", () => {
  it("returns exactly 2 opportunities (both directions)", () => {
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_010),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_001),
      ethBtc: mk("binance", "ETH/BTC", 0.02857, 0.02858),
    });
    expect(opps).toHaveLength(2);
    expect(opps.find((o) => o.direction.includes("USDT → ETH"))).toBeDefined();
    expect(opps.find((o) => o.direction.includes("USDT → BTC"))).toBeDefined();
  });

  it("each opportunity has 3 legs", () => {
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_010),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_001),
      ethBtc: mk("binance", "ETH/BTC", 0.02857, 0.02858),
    });
    for (const opp of opps) {
      expect(opp.legs).toHaveLength(3);
    }
  });

  it("first leg starts with the standardized notional USDT", () => {
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_010),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_001),
      ethBtc: mk("binance", "ETH/BTC", 0.02857, 0.02858),
    });
    for (const opp of opps) {
      expect(opp.startUSDT).toBe(TRIANGULAR_NOTIONAL_USDT);
      expect(opp.legs[0].amountIn).toBe(TRIANGULAR_NOTIONAL_USDT);
      expect(opp.legs[0].amountInAsset).toBe("USDT");
    }
  });

  it("final leg returns to USDT", () => {
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_010),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_001),
      ethBtc: mk("binance", "ETH/BTC", 0.02857, 0.02858),
    });
    for (const opp of opps) {
      expect(opp.legs[2].amountOutAsset).toBe("USDT");
      expect(opp.finalUSDT).toBe(opp.legs[2].amountOut);
    }
  });

  it("netProfit = finalUSDT - startUSDT", () => {
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_010),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_001),
      ethBtc: mk("binance", "ETH/BTC", 0.02857, 0.02858),
    });
    for (const opp of opps) {
      expect(
        Math.abs(opp.netProfit - (opp.finalUSDT - opp.startUSDT)),
      ).toBeLessThan(0.0001);
    }
  });

  it("at fair market prices (no arb), both paths are unprofitable", () => {
    // Si BTC/USDT = 70k, ETH/USDT = 2k, entonces ETH/BTC fair = 2000/70000 = 0.02857
    // Con fees, ambos paths deberían perder
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_000),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_000),
      ethBtc: mk("binance", "ETH/BTC", 0.0285714, 0.0285714),
    });
    for (const opp of opps) {
      expect(opp.profitable).toBe(false);
    }
  });

  it("flags profitable when implied ETH/BTC diverges enough from market", () => {
    // ETH/BTC market = 0.0285714, but if exchange shows 0.030 bid (huge premium),
    // path 1 (sell ETH for BTC) gets better BTC payout
    const opps = detectTriangular("binance", {
      btcUsdt: mk("binance", "BTC/USDT", 70_000, 70_010),
      ethUsdt: mk("binance", "ETH/USDT", 2_000, 2_001),
      ethBtc: mk("binance", "ETH/BTC", 0.030, 0.0302),
    });
    const path1 = opps.find((o) => o.direction.includes("USDT → ETH"));
    expect(path1!.profitable).toBe(true);
  });
});
