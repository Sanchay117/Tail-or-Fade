// Unit conversion and grid alignment for perp orders.
// Adapted from dreamdex-bot-kit packages/perp-core/src/markets.ts (MIT, DreamDEX S.A.).

/** Human number to raw units without float drift. (0.0888).toFixed(18) is off the grid. */
export function toRaw(human: number, decimals: number): bigint {
  const s = human.toFixed(Math.min(decimals, 9));
  const [i = "0", f = ""] = s.split(".");
  const negative = i.startsWith("-");
  const digits = (negative ? i.slice(1) : i) + f.padEnd(decimals, "0").slice(0, decimals);
  const raw = BigInt(digits || "0");
  return negative ? -raw : raw;
}

/** Raw units to a human number, for display only. */
export function fromRaw(raw: bigint | string | number, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals;
}

export const abs = (x: bigint) => (x < 0n ? -x : x);

/** Price to the tick grid. Bids round UP and asks round DOWN so a crossing limit still crosses. */
export function alignPrice(price: bigint, tick: bigint, isBid: boolean): bigint {
  if (tick <= 0n) return price;
  const down = (price / tick) * tick;
  if (!isBid || down === price) return down;
  return down + tick;
}

/** Quantity down to the lot grid; 0n when the result is under the market minimum. */
export function alignQuantity(quantity: bigint, lot: bigint, min: bigint): bigint {
  const q = abs(quantity);
  const aligned = lot > 0n ? (q / lot) * lot : q;
  return aligned < min ? 0n : aligned;
}

/** Apply slippage in basis points: a bid pays up, an ask sells down. */
export function withSlippage(price: bigint, bps: number, isBid: boolean): bigint {
  const b = BigInt(Math.round(bps));
  return isBid ? (price * (10_000n + b)) / 10_000n : (price * (10_000n - b)) / 10_000n;
}
