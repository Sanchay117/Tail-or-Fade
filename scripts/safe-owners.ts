// Owners and threshold of a Safe on the Tokyo testnet, with each owner's STT balance.
// Usage: npx tsx scripts/safe-owners.ts <safe>
import { createPublicClient, formatEther, http, parseAbi, type Address } from "viem";

const client = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network") });
const abi = parseAbi(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)", "function nonce() view returns (uint256)"]);
const safe = process.argv[2] as Address;
const [owners, threshold, nonce] = await Promise.all([
  client.readContract({ address: safe, abi, functionName: "getOwners" }),
  client.readContract({ address: safe, abi, functionName: "getThreshold" }),
  client.readContract({ address: safe, abi, functionName: "nonce" }),
]);
console.log(`safe ${safe}  threshold ${threshold} of ${owners.length}  nonce ${nonce}`);
for (const o of owners) console.log(`  owner ${o}  ${formatEther(await client.getBalance({ address: o }))} STT`);
