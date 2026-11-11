// Smallest order each perp market accepts, in dollars, plus a few balances we care about.
// Run: npx tsx scripts/min-orders.ts

import { formatEther, type Address } from "viem";
import { loadMarkets, mark, rpc } from "../src/chain.js";

const watch: Record<string, Address> = {
  "app key (Safe owner)": "0x6914e3F146ecd978d7797069D857d4669a971346",
  "bot key": "0x5DF364268Ce5EcAe7B0f09d70a72a2E61A51d76B",
  "deploy key": "0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4",
};
for (const [k, a] of Object.entries(watch)) console.log(k.padEnd(22), formatEther(await rpc.getBalance({ address: a })), "STT");

const rows: { sym: string; min: number }[] = [];
for (const m of (await loadMarkets()).values()) {
  const mk = await mark(m.pool).catch(() => undefined);
  if (!mk) continue;
  rows.push({ sym: m.symbol, min: (Number(m.minQuantity) / 10 ** m.baseDecimals) * (Number(mk) / 1e18) });
}
rows.sort((a, b) => a.min - b.min);
console.log("\nsmallest orders:");
for (const r of rows.slice(0, 8)) console.log(r.sym.padEnd(14), `$${r.min.toFixed(4)}`);
process.exit(0);
