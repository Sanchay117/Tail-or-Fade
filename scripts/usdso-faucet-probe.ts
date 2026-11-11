// Is Hideki's perps collateral (USDso) a test token with a public faucet(amount)? Simulation only.
// Run: npx tsx scripts/usdso-faucet-probe.ts

import { SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { formatUnits, parseAbi } from "viem";
import { rpc } from "../src/chain.js";

const USDSO = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72";
const ME = "0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4";
const abi = parseAbi([
  "function faucet(uint256 amount)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

console.log("sdk addresses:", JSON.stringify(SOMNIA_HIDEKI_TESTNET_ADDRESSES, null, 0).slice(0, 600));
const [sym, dec, code] = await Promise.all([
  rpc.readContract({ address: USDSO, abi, functionName: "symbol" }),
  rpc.readContract({ address: USDSO, abi, functionName: "decimals" }),
  rpc.getCode({ address: USDSO }),
]);
console.log(`token ${sym}, ${dec} decimals, code ${(code!.length - 2) / 2} bytes`);
try {
  await rpc.simulateContract({ address: USDSO, abi, functionName: "faucet", args: [1000n * 10n ** BigInt(dec)], account: ME });
  console.log("faucet(1000) simulates OK from", ME);
} catch (e) {
  console.log("faucet reverts:", (e as Error).message.split("\n").slice(0, 3).join(" | "));
}
const bal = await rpc.readContract({ address: USDSO, abi, functionName: "balanceOf", args: [ME] });
console.log("deploy key USDso balance:", formatUnits(bal, dec));
process.exit(0);
