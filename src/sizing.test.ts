import { describe, expect, it } from "vitest";
import { planOrder, targetSize, type SizingInput } from "./sizing.js";

const E18 = 10n ** 18n;
// ETH-PERP grid from the live market row.
const eth = { baseDecimals: 18, lotSize: 100000000000000n, minQuantity: 4000000000000000n };
const base: SizingInput = {
  mode: "tail",
  multiplierBps: 10_000n,
  maxNotional: 10_000n * E18,
  leaderSize: 10n * E18, // 10 ETH
  leaderEquity: 100_000n * E18,
  followerEquity: 1_000n * E18,
  followerSize: 0n,
  mark: 3_000n * E18,
  grid: eth,
};

describe("targetSize", () => {
  it("copies leverage, not size", () => {
    // Leader: 30k notional on 100k equity = 0.3x. Follower 1k equity -> 300 USDso -> 0.1 ETH.
    expect(targetSize(base)).toBe(E18 / 10n);
  });

  it("fade flips the sign", () => {
    expect(targetSize({ ...base, mode: "fade" })).toBe(-(E18 / 10n));
  });

  it("applies the multiplier", () => {
    expect(targetSize({ ...base, multiplierBps: 5_000n })).toBe(E18 / 20n);
  });

  it("caps notional per market", () => {
    // 0.3x of 1k = 300; cap at 150 USDso -> 0.05 ETH.
    expect(targetSize({ ...base, maxNotional: 150n * E18 })).toBe(E18 / 20n);
  });

  it("rounds under minQuantity to zero", () => {
    expect(targetSize({ ...base, followerEquity: 10n * E18 })).toBe(0n); // 3 USDso = 0.001 ETH < 0.004
  });

  it("goes flat when the leader goes flat", () => {
    expect(targetSize({ ...base, leaderSize: 0n })).toBe(0n);
  });

  it("works with 8-decimal BTC sizes", () => {
    const btc = { baseDecimals: 8, lotSize: 1000n, minQuantity: 13000n };
    // Leader 1 BTC at 100k on 200k equity = 0.5x; follower 1k -> 500 USDso -> 0.005 BTC = 500000 raw.
    const t = targetSize({ ...base, grid: btc, leaderSize: 100_000_000n, leaderEquity: 200_000n * E18, mark: 100_000n * E18 });
    expect(t).toBe(500_000n);
  });
});

describe("planOrder", () => {
  it("opens with a bid when tailing a long", () => {
    const p = planOrder(base);
    expect(p).toMatchObject({ action: "order", isBid: true, quantity: E18 / 10n, reducing: false });
  });

  it("opens with an ask when fading a long", () => {
    const p = planOrder({ ...base, mode: "fade" });
    expect(p).toMatchObject({ action: "order", isBid: false, quantity: E18 / 10n });
  });

  it("only sends the difference", () => {
    const p = planOrder({ ...base, followerSize: E18 / 20n });
    expect(p).toMatchObject({ action: "order", isBid: true, quantity: E18 / 20n });
  });

  it("skips when in sync", () => {
    expect(planOrder({ ...base, followerSize: E18 / 10n }).action).toBe("skip");
  });

  it("closes everything, dust included, when the leader closes", () => {
    const p = planOrder({ ...base, leaderSize: 0n, followerSize: 100_123_400_000_000_000n });
    expect(p).toMatchObject({ action: "order", isBid: false, reducing: true, quantity: 100_100_000_000_000_000n });
  });

  it("flips through zero when the leader flips", () => {
    const p = planOrder({ ...base, leaderSize: -10n * E18, followerSize: E18 / 10n });
    expect(p).toMatchObject({ action: "order", isBid: false, quantity: E18 / 5n, reducing: false });
  });
});
