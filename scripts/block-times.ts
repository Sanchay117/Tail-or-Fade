// Prints the UTC time of each block given, plus the chain head.
// Usage: npx tsx scripts/block-times.ts <block> [block...]
import { createPublicClient, http } from "viem";

const client = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network") });
const head = await client.getBlock();
console.log(`head ${head.number}  ${new Date(Number(head.timestamp) * 1000).toISOString()}`);
for (const n of process.argv.slice(2)) {
  const b = await client.getBlock({ blockNumber: BigInt(n) });
  console.log(`${n}  ${new Date(Number(b.timestamp) * 1000).toISOString()}`);
}
