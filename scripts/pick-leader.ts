// Which markets Perps Arena credit can open, and who is trading right now at sane leverage.
// Used to pick a leader whose moves will produce mirrored orders within minutes.
// Run: npx tsx scripts/pick-leader.ts [hours=3]

import { getAddress, parseAbi, type Address } from "viem";
import { account, loadMarkets, mark, position, ws } from "../src/chain.js";
import { network } from "../src/config.js";

const net = network();
const hours = Number(process.argv[2] ?? 3);

const bankAbi = parseAbi([
  "function isVoucherMarketAllowed(address pool) view returns (bool)",
  "function getVoucherLeverageCap() view returns (uint256)",
]);

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch(net.indexerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = (await r.json()) as { data: T; errors?: unknown };
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

const markets = await loadMarkets();
const cap = await ws.readContract({ address: net.marginBank, abi: bankAbi, functionName: "getVoucherLeverageCap" });
const allowed = new Set<string>();
for (const m of markets.values()) {
  const ok = await ws.readContract({ address: net.marginBank, abi: bankAbi, functionName: "isVoucherMarketAllowed", args: [m.pool] });
  if (ok) allowed.add(m.pool.toLowerCase());
}
console.log(`voucher leverage cap: ${cap}x`);
console.log(`voucher markets (${allowed.size}/${markets.size}): ${[...allowed].map((p) => markets.get(p)!.base).join(", ")}`);

const since = Math.floor(Date.now() / 1000) - hours * 3600;
const rows: { account: string; pool: string; timestamp: string }[] = [];
for (let o = 0; o < 20_000; o += 1000) {
  const d = await gql<{ PerpPositionChange: typeof rows }>(
    `query($o:Int!,$s:numeric!){ PerpPositionChange(limit:1000, offset:$o, order_by:{timestamp:desc}, where:{timestamp:{_gte:$s}}){ account pool timestamp } }`,
    { o, s: since },
  );
  rows.push(...d.PerpPositionChange);
  if (d.PerpPositionChange.length < 1000) break;
}

const by = new Map<string, { n: number; onAllowed: number; last: number; pools: Set<string> }>();
for (const r of rows) {
  const s = by.get(r.account) ?? { n: 0, onAllowed: 0, last: 0, pools: new Set<string>() };
  s.n++;
  if (allowed.has(r.pool.toLowerCase())) s.onAllowed++;
  s.last = Math.max(s.last, Number(r.timestamp));
  s.pools.add(markets.get(r.pool.toLowerCase())?.base ?? "?");
  by.set(r.account, s);
}

// A few moves an hour, mostly on markets a voucher account can open. Market makers move far more often.
const candidates = [...by.entries()]
  .filter(([, s]) => s.n >= 3 && s.n <= 25 * hours && s.onAllowed / s.n >= 0.6)
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, 15);

console.log(`\n${by.size} accounts moved in the last ${hours}h; ${candidates.length} candidates\n`);
for (const [addr, s] of candidates) {
  const who = getAddress(addr) as Address;
  const acct = await account(who, true).catch(() => undefined);
  const eq = acct ? Number(acct.equity) / 1e18 : 0;
  let notional = 0;
  const open: string[] = [];
  for (const pool of acct?.activePools ?? []) {
    const m = markets.get(pool.toLowerCase());
    if (!m) continue;
    const [size, mk] = await Promise.all([position(who, m.pool), mark(m.pool)]);
    if (size === 0n || !mk) continue;
    const n = (Math.abs(Number(size)) / 10 ** m.baseDecimals) * (Number(mk) / 1e18);
    notional += n;
    open.push(`${size > 0n ? "L" : "S"} ${m.base}${allowed.has(m.pool.toLowerCase()) ? "" : "(x)"}`);
  }
  const lev = eq > 0 ? notional / eq : 0;
  const mins = Math.round((Date.now() / 1000 - s.last) / 60);
  console.log(
    `${who}  moves ${String(s.n).padStart(3)}  allowed ${Math.round((s.onAllowed / s.n) * 100)}%  last ${mins}m  equity $${Math.round(eq)}  lev ${lev.toFixed(1)}x  [${[...s.pools].join(" ")}]  open: ${open.join(", ") || "flat"}`,
  );
}
process.exit(0);
