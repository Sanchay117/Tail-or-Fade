// One line per follow in data/state.json (no key material), plus the mirror count.
// Run: npx tsx scripts/state-summary.ts
import { readFileSync } from "node:fs";

const s = JSON.parse(readFileSync("data/state.json", "utf8"));
for (const f of s.follows) {
  console.log(`${f.id} ${f.status} ${f.mode} leader ${f.leader} follower ${f.follower} bot ${f.bot?.address ?? "?"}`);
}
console.log(`mirrors ${s.mirrors.length}, state.json ${readFileSync("data/state.json").length} bytes`);
