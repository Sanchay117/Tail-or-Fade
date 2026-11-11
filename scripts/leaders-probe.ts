// Explore who would make a good leader: realized PnL and activity per account from the indexer.
//   npx tsx scripts/leaders-probe.ts
import { network } from "../src/config.js";

const url = network().indexerUrl;
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as any;
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

// All position rows, paged.
const rows: any[] = [];
for (let offset = 0; offset < 20000; offset += 1000) {
  const d = await gql(
    `query($o:Int!){ PerpPosition(limit:1000, offset:$o, order_by:{id:asc}){ account pool size isLong realizedPnl updatedAt market { baseSymbol: id } } }`,
    { o: offset },
  );
  rows.push(...d.PerpPosition);
  if (d.PerpPosition.length < 1000) break;
}
console.log("PerpPosition rows", rows.length, "sample", JSON.stringify(rows[0]));

const now = Date.now() / 1000;
const since = Math.floor(now - 7 * 86400);
const changes: any[] = [];
for (let offset = 0; offset < 50000; offset += 1000) {
  const d = await gql(
    `query($o:Int!,$s:numeric!){ PerpPositionChange(limit:1000, offset:$o, where:{timestamp:{_gte:$s}}, order_by:{timestamp:desc}){ account pool kind sizeBefore sizeAfter realizedPnl timestamp } }`,
    { o: offset, s: since },
  );
  changes.push(...d.PerpPositionChange);
  if (d.PerpPositionChange.length < 1000) break;
}
console.log("changes in 7d", changes.length, "sample", JSON.stringify(changes[0]));

type Agg = { account: string; realized: number; open: number; changes7d: number; pnl7d: number; wins: number; closes: number; last: number };
const by = new Map<string, Agg>();
const get = (a: string) => {
  let x = by.get(a);
  if (!x) by.set(a, (x = { account: a, realized: 0, open: 0, changes7d: 0, pnl7d: 0, wins: 0, closes: 0, last: 0 }));
  return x;
};
for (const r of rows) {
  const x = get(r.account);
  x.realized += Number(r.realizedPnl) / 1e18;
  if (Number(r.size) !== 0) x.open++;
  x.last = Math.max(x.last, Number(r.updatedAt));
}
for (const c of changes) {
  const x = get(c.account);
  x.changes7d++;
  const p = Number(c.realizedPnl) / 1e18;
  if (p !== 0) {
    x.pnl7d += p;
    x.closes++;
    if (p > 0) x.wins++;
  }
}
const all = [...by.values()];
console.log("accounts", all.length, "active 7d", all.filter((a) => a.changes7d > 0).length);
const kinds = new Map<string, number>();
for (const c of changes) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
console.log("kinds", [...kinds.entries()]);

const fmt = (a: Agg) =>
  `${a.account} realized=${a.realized.toFixed(1)} pnl7d=${a.pnl7d.toFixed(1)} changes7d=${a.changes7d} closes=${a.closes} win=${a.closes ? ((a.wins / a.closes) * 100).toFixed(0) : "-"}% open=${a.open} lastAgoH=${((now - a.last / (a.last > 1e12 ? 1e9 : 1)) / 3600).toFixed(1)}`;
console.log("\nTop by 7d PnL (2..400 changes, likely humans):");
for (const a of all.filter((a) => a.changes7d >= 2 && a.changes7d <= 400).sort((a, b) => b.pnl7d - a.pnl7d).slice(0, 15)) console.log(fmt(a));
console.log("\nWorst by 7d PnL:");
for (const a of all.filter((a) => a.changes7d >= 2 && a.changes7d <= 400).sort((a, b) => a.pnl7d - b.pnl7d).slice(0, 8)) console.log(fmt(a));
console.log("\nBusiest (bots?):");
for (const a of all.sort((a, b) => b.changes7d - a.changes7d).slice(0, 6)) console.log(fmt(a));
