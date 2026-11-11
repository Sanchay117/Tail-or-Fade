// Spike: is Multicall3 on Hideki, and can somnia_watch attach getBlockNumber() to each event?
//   npx tsx scripts/spike-ethcalls.ts
import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, parseAbi, toEventSelector, webSocket } from "viem";
import { SDK } from "@somnia-chain/reactivity";
import { network } from "../src/config.js";

const net = network();
const MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const abi = parseAbi(["function getBlockNumber() view returns (uint256)", "function getCurrentBlockTimestamp() view returns (uint256)"]);
const http0 = createPublicClient({ transport: http(net.rpcUrl) });
const code = await http0.getCode({ address: MC3 });
console.log("multicall3 code bytes", code ? (code.length - 2) / 2 : 0);
if (!code) process.exit(0);

const pub = createPublicClient({ chain: net.chain, transport: webSocket(net.wsUrl) });
const sdk = new SDK({ public: pub as never });
const topic0 = toEventSelector(
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
);
let n = 0;
const sub = await sdk.watch({
  eventContractSources: [net.marginBank],
  topicOverrides: [topic0],
  ethCalls: [
    { to: MC3, data: encodeFunctionData({ abi, functionName: "getBlockNumber" }) },
    { to: MC3, data: encodeFunctionData({ abi, functionName: "getCurrentBlockTimestamp" }) },
  ],
  onData: async (d: any) => {
    const r = d?.result ?? d;
    if (n++ > 4) return;
    const sims = r.simulationResults ?? [];
    const block = sims[0] ? decodeFunctionResult({ abi, functionName: "getBlockNumber", data: sims[0] }) : undefined;
    const ts = sims[1] ? decodeFunctionResult({ abi, functionName: "getCurrentBlockTimestamp", data: sims[1] }) : undefined;
    const head = await http0.getBlockNumber();
    console.log("event block", block, "ts", ts, "now ms", Date.now(), "head", head, "raw sims", JSON.stringify(sims).slice(0, 160));
  },
} as never);
if (sub instanceof Error) throw sub;
setTimeout(() => process.exit(0), 15000);
