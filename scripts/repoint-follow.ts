// Move a follow to a different follower account, keeping its (already funded) bot key.
// Run only while the server is stopped: the server owns the store and would overwrite this.
// Run: npx tsx scripts/repoint-follow.ts <followId> <newFollower>

import "dotenv/config";
import { getAddress } from "viem";
import { Store } from "../src/store.js";

const [id, to] = process.argv.slice(2);
const store = new Store();
const f = store.follow(id ?? "");
if (!f || !to) throw new Error("usage: repoint-follow.ts <followId> <newFollower>");
store.updateFollow(f.id, { follower: getAddress(to), status: "waiting", blocker: "bot key is not linked to your wallet yet", pools: [] });
store.flush();
console.log(`follow ${f.id}: ${f.follower} -> ${getAddress(to)}, bot ${f.bot.address}`);
