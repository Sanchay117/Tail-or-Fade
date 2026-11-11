// How big the follower's position should be, and the order that gets it there.
//
// We copy leverage, not size. A whale's 40 ETH long on 200k of equity is 0.7x; a follower
// with 1,000 USDso tailing at 1x goes 0.7x too, about 700 USDso of ETH. Fading flips the sign.
// A per-market notional cap bounds the result whatever the leader does.
//
// Pure bigint math so it can be tested without a chain.

const ONE = 10n ** 18n;
const BPS = 10_000n;

export type Mode = "tail" | "fade";

export interface MarketGrid {
  baseDecimals: number;
  lotSize: bigint;
  minQuantity: bigint;
}

export interface SizingInput {
  mode: Mode;
  /** Leverage multiplier in basis points: 10000 = match their leverage, 5000 = half. */
  multiplierBps: bigint;
  /** Largest position the follower allows in one market, USDso with 18 decimals. */
  maxNotional: bigint;
  /** Leader's signed position after the event, raw base units. */
  leaderSize: bigint;
  /** Leader's total equity, USDso 18 decimals. */
  leaderEquity: bigint;
  /** Follower's total equity, USDso 18 decimals. */
  followerEquity: bigint;
  /** Follower's signed position now, raw base units. */
  followerSize: bigint;
  /** Mark price, 18 decimals per whole base unit. */
  mark: bigint;
  grid: MarketGrid;
}

export type SizingResult =
  | { action: "order"; isBid: boolean; quantity: bigint; target: bigint; reducing: boolean }
  | { action: "skip"; reason: string; target: bigint };

const abs = (x: bigint) => (x < 0n ? -x : x);
const sign = (x: bigint) => (x < 0n ? -1n : 1n);

/** Toward zero, on the lot grid. Under minQuantity becomes 0. */
export function onGrid(size: bigint, grid: MarketGrid): bigint {
  const a = abs(size);
  const aligned = grid.lotSize > 0n ? (a / grid.lotSize) * grid.lotSize : a;
  if (aligned < grid.minQuantity) return 0n;
  return size < 0n ? -aligned : aligned;
}

export function targetSize(i: SizingInput): bigint {
  if (i.mark <= 0n) return 0n;
  if (i.leaderSize === 0n) return 0n;
  if (i.leaderEquity <= 0n || i.followerEquity <= 0n) return 0n;
  const unit = 10n ** BigInt(i.grid.baseDecimals);
  // Leader notional in USDso (18 dec), signed.
  const leaderNotional = (i.leaderSize * i.mark) / unit;
  // Follower notional = leaderNotional / leaderEquity * followerEquity * multiplier, signed.
  let notional = (leaderNotional * i.followerEquity * i.multiplierBps) / (i.leaderEquity * BPS);
  if (i.mode === "fade") notional = -notional;
  if (abs(notional) > i.maxNotional) notional = sign(notional) * i.maxNotional;
  const size = (notional * unit) / i.mark;
  return onGrid(size, i.grid);
}

export function planOrder(i: SizingInput): SizingResult {
  const target = targetSize(i);
  if (i.leaderSize !== 0n && target === 0n && i.followerSize === 0n) {
    return { action: "skip", reason: "copy rounds below the market minimum size", target };
  }
  let delta = target - i.followerSize;
  if (delta === 0n) return { action: "skip", reason: "already in sync", target };
  // Closing: take the whole position off, even when the remainder is under minQuantity.
  if (target === 0n) delta = -i.followerSize;
  const quantity = onGrid(delta, i.grid);
  if (quantity === 0n) return { action: "skip", reason: "difference is under the market minimum size", target };
  const isBid = quantity > 0n;
  const reducing = i.followerSize !== 0n && sign(quantity) !== sign(i.followerSize) && abs(quantity) <= abs(i.followerSize);
  return { action: "order", isBid, quantity: abs(quantity), target, reducing };
}

/** USDso notional of a raw size at a mark, as a JS number for display. */
export function notionalUsd(size: bigint, mark: bigint, baseDecimals: number): number {
  return Number((abs(size) * mark) / 10n ** BigInt(baseDecimals)) / Number(ONE);
}
