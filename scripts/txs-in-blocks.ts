// Print full hashes of txs sent by an address in the given blocks.
//   npx tsx scripts/txs-in-blocks.ts 0xFrom 45740079 45740148
import { createPublicClient, http, formatEther } from "viem";
import { network } from "../src/config.js";

const [from, ...blocks] = process.argv.slice(2);
const pub = createPublicClient({ transport: http(network().rpcUrl) });
for (const b of blocks) {
  const block = await pub.getBlock({ blockNumber: BigInt(b), includeTransactions: true });
  for (const tx of block.transactions) {
    if (typeof tx === "string" || tx.from.toLowerCase() !== from!.toLowerCase()) continue;
    const r = await pub.getTransactionReceipt({ hash: tx.hash });
    console.log(b, tx.hash, r.status, "to", tx.to, "input", tx.input.slice(0, 10), "fee", formatEther(r.gasUsed * r.effectiveGasPrice));
  }
}
