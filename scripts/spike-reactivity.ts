// Spike: subscribe to MarginBank PositionUpdated over Somnia off-chain Reactivity (somnia_watch)
// and print each event with how long after its block it reached us.
//   npx tsx scripts/spike-reactivity.ts [seconds]

import { createPublicClient, decodeEventLog, parseAbiItem, toEventSelector, webSocket } from "viem";
import { SDK } from "@somnia-chain/reactivity";
import { network } from "../src/config.js";

const net = network();
const seconds = Number(process.argv[2] ?? 30);
const ev = parseAbiItem(
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
);
const topic0 = toEventSelector(ev);

const pub = createPublicClient({ chain: net.chain, transport: webSocket(net.wsUrl) });
const sdk = new SDK({ public: pub as never });

let n = 0;
const started = Date.now();
const sub = await sdk.watch({
  eventContractSources: [net.marginBank],
  topicOverrides: [topic0],
  ethCalls: [],
  onData: (data: any) => {
    const r = data?.result ?? data;
    n++;
    try {
      const d = decodeEventLog({ abi: [ev], topics: r.topics, data: r.data });
      const a = d.args as any;
      console.log(
        `#${n} +${((Date.now() - started) / 1000).toFixed(1)}s`,
        a.account.slice(0, 10),
        "pool",
        a.perpPool.slice(0, 10),
        "newSize",
        a.newSize.toString(),
        "keys",
        Object.keys(r).join(","),
      );
    } catch (e) {
      console.log("raw", JSON.stringify(r).slice(0, 300));
    }
  },
  onError: (e: unknown) => console.error("watch error", e),
} as never);

if (sub instanceof Error) throw sub;
console.log(`subscribed to PositionUpdated on ${net.marginBank} for ${seconds}s`);
setTimeout(async () => {
  console.log(`received ${n} events in ${seconds}s`);
  await (sub as any).unsubscribe?.();
  process.exit(0);
}, seconds * 1000);
