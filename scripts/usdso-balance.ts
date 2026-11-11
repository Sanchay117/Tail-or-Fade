// USDso held as a plain token (outside the perps account) by each address on the Tokyo testnet.
// Usage: npx tsx scripts/usdso-balance.ts <address> [address...]
import { createPublicClient, formatUnits, http, parseAbi, type Address } from "viem";

const client = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network") });
const usdso = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72" as Address;
const abi = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]);
const decimals = await client.readContract({ address: usdso, abi, functionName: "decimals" });
for (const a of process.argv.slice(2) as Address[]) {
  const bal = await client.readContract({ address: usdso, abi, functionName: "balanceOf", args: [a] });
  console.log(`${a}  ${formatUnits(bal, decimals)} USDso`);
}
