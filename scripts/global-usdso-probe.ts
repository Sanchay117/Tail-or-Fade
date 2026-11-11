// Where does USDso come from on the Global testnet (the bridge's other side)? Simulation only.
// Reads the Hyperlane USDso router's underlying token, then tries common faucet calls on it.
// Run: npx tsx scripts/global-usdso-probe.ts
import { createPublicClient, formatUnits, http, parseAbi, type Address } from "viem";

const global = createPublicClient({ transport: http("https://dream-rpc.somnia.network") });
const router = "0x94e2e7f4b2b0a8e3032c7d3ff3c86790bb5979e6" as Address;
const me = "0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4" as Address;

console.log("chain id", await global.getChainId());
const routerAbi = parseAbi(["function wrappedToken() view returns (address)", "function token() view returns (address)"]);
let token: Address | undefined;
for (const fn of ["wrappedToken", "token"] as const) {
  try {
    token = await global.readContract({ address: router, abi: routerAbi, functionName: fn });
    console.log(`router.${fn}() = ${token}`);
    break;
  } catch {
    console.log(`router.${fn}() not there`);
  }
}
if (!token) process.exit(0);

const abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function faucet(uint256 amount)",
  "function faucet()",
  "function mint(address to, uint256 amount)",
  "function mint(uint256 amount)",
  "function drip()",
  "function claim()",
]);
const [symbol, decimals, supply, mine] = await Promise.all([
  global.readContract({ address: token, abi, functionName: "symbol" }),
  global.readContract({ address: token, abi, functionName: "decimals" }),
  global.readContract({ address: token, abi, functionName: "totalSupply" }),
  global.readContract({ address: token, abi, functionName: "balanceOf", args: [me] }),
]);
console.log(`token ${symbol}, ${decimals} decimals, supply ${formatUnits(supply, decimals)}, deploy key holds ${formatUnits(mine, decimals)}`);
console.log(`code size ${((await global.getCode({ address: token })) ?? "0x").length / 2 - 1} bytes`);

const one = 10n ** BigInt(decimals);
const tries: { fn: string; args: unknown[] }[] = [
  { fn: "faucet", args: [100n * one] },
  { fn: "faucet", args: [one] },
  { fn: "faucet", args: [] },
  { fn: "mint", args: [me, 100n * one] },
  { fn: "mint", args: [100n * one] },
  { fn: "drip", args: [] },
  { fn: "claim", args: [] },
];
for (const t of tries) {
  try {
    await global.simulateContract({ address: token, abi, functionName: t.fn as never, args: t.args as never, account: me });
    console.log(`${t.fn}(${t.args.map(String).join(", ")}): would succeed`);
  } catch (e) {
    console.log(`${t.fn}(${t.args.length} args): reverts (${(e as Error).message.split("\n")[0].slice(0, 80)})`);
  }
}
