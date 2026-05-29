import { beforeEach, describe, expect, it } from "vitest";
import type { Opportunity } from "../arbitrage/types.js";
import { WalletManager } from "./manager.js";

function mkOpportunity(
  overrides: Partial<Opportunity> = {},
): Opportunity {
  return {
    timestamp: Date.now(),
    pair: "BTC/USDT",
    buyExchange: "binance",
    sellExchange: "coinbase",
    buyPrice: 70_000,
    sellPrice: 70_100,
    maxVolume: 0.1,
    grossSpread: 100,
    grossProfit: 10,
    buyFee: 1.4,
    sellFee: 2.8,
    tradingFees: 4.2,
    amortizedWithdrawal: 0.5,
    estimatedSlippage: 0.3,
    latencyCost: 0.1,
    totalCosts: 5.1,
    netProfit: 4.9,
    netSpread: 49,
    profitable: true,
    suspicious: false,
    retailTradingFees: 70,
    retailNetProfit: -60,
    ...overrides,
  };
}

describe("WalletManager initial state", () => {
  it("initializes balances per exchange", () => {
    const w = new WalletManager();
    expect(w.getBalance("binance").usdt).toBe(50_000);
    expect(w.getBalance("binance").btc).toBe(0.5);
    expect(w.getBalance("binance").eth).toBe(10);
    expect(w.getBalance("coinbase").usdt).toBe(50_000);
    expect(w.getBalance("kraken").usdt).toBe(50_000);
  });

  it("has no executed trades initially", () => {
    const w = new WalletManager();
    expect(w.getTrades()).toHaveLength(0);
  });
});

describe("WalletManager.maxExecutableVolume", () => {
  it("caps by opportunity volume when capital is plenty", () => {
    const w = new WalletManager();
    const opp = mkOpportunity({ maxVolume: 0.05 });
    expect(w.maxExecutableVolume(opp)).toBe(0.05);
  });

  it("caps by USDT on buy side when not enough cash", () => {
    const w = new WalletManager();
    // 2 BTC at 70k = $140k > $50k available
    const opp = mkOpportunity({ maxVolume: 2 });
    const max = w.maxExecutableVolume(opp);
    expect(max).toBeLessThan(2);
    expect(max).toBeLessThan(50_000 / 70_000);
  });

  it("caps by asset (BTC) on sell side when not enough holdings", () => {
    const w = new WalletManager();
    // Asking to sell 1 BTC but only 0.5 BTC in coinbase wallet
    const opp = mkOpportunity({ maxVolume: 1 });
    const max = w.maxExecutableVolume(opp);
    expect(max).toBe(0.5);
  });

  it("works for ETH pair using ETH balance", () => {
    const w = new WalletManager();
    // ETH has 10 per exchange; trying to sell 15
    const opp = mkOpportunity({
      pair: "ETH/USDT",
      buyPrice: 2_000,
      sellPrice: 2_010,
      maxVolume: 15,
    });
    const max = w.maxExecutableVolume(opp);
    expect(max).toBe(10);
  });
});

describe("WalletManager.executeTrade", () => {
  let w: WalletManager;
  beforeEach(() => {
    w = new WalletManager();
  });

  it("moves USDT from buy wallet and BTC to buy wallet", () => {
    const initialUSDT = w.getBalance("binance").usdt;
    const initialBTC = w.getBalance("binance").btc;
    const opp = mkOpportunity();
    w.executeTrade(opp, 0.1);
    expect(w.getBalance("binance").usdt).toBeLessThan(initialUSDT);
    expect(w.getBalance("binance").btc).toBe(initialBTC + 0.1);
  });

  it("moves BTC from sell wallet and USDT to sell wallet", () => {
    const initialUSDT = w.getBalance("coinbase").usdt;
    const initialBTC = w.getBalance("coinbase").btc;
    const opp = mkOpportunity();
    w.executeTrade(opp, 0.1);
    expect(w.getBalance("coinbase").usdt).toBeGreaterThan(initialUSDT);
    expect(w.getBalance("coinbase").btc).toBe(initialBTC - 0.1);
  });

  it("records the trade with all cost components", () => {
    const opp = mkOpportunity();
    const trade = w.executeTrade(opp, 0.1);
    expect(trade.tradingFees).toBeGreaterThan(0);
    expect(trade.amortizedWithdrawal).toBeGreaterThan(0);
    expect(trade.estimatedSlippage).toBeGreaterThan(0);
    expect(trade.latencyCost).toBeGreaterThan(0);
    expect(trade.totalCosts).toBeGreaterThan(0);
  });

  it("marks trades as partial when executed below requested volume", () => {
    const opp = mkOpportunity({ maxVolume: 0.1 });
    const trade = w.executeTrade(opp, 0.05);
    expect(trade.partial).toBe(true);
  });

  it("does NOT mark trade as partial when executed at full volume", () => {
    const opp = mkOpportunity({ maxVolume: 0.1 });
    const trade = w.executeTrade(opp, 0.1);
    expect(trade.partial).toBe(false);
  });

  it("appends new trades to the front of the list", () => {
    const opp1 = mkOpportunity({ buyPrice: 70_000 });
    const opp2 = mkOpportunity({ buyPrice: 70_010 });
    w.executeTrade(opp1, 0.05);
    w.executeTrade(opp2, 0.05);
    const trades = w.getTrades();
    expect(trades).toHaveLength(2);
    expect(trades[0].buyPrice).toBe(70_010); // most recent first
  });

  it("ETH trade moves ETH balance not BTC", () => {
    const initialBTC = w.getBalance("binance").btc;
    const initialETH = w.getBalance("binance").eth;
    const opp = mkOpportunity({
      pair: "ETH/USDT",
      buyPrice: 2_000,
      sellPrice: 2_010,
      maxVolume: 1,
    });
    w.executeTrade(opp, 1);
    expect(w.getBalance("binance").btc).toBe(initialBTC);
    expect(w.getBalance("binance").eth).toBe(initialETH + 1);
  });
});
