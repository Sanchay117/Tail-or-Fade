// Test USDso for the deploy account: mint it on the Global testnet (the token there has an open
// mint), bridge it to Tokyo over Somnia's Hyperlane test bridge, and deposit it as perps margin.
// Dry run by default: prints balances, the bridge fee and simulations, sends nothing.
// Run: npx tsx scripts/bridge-usdso.ts [amount=200] [--send] [--deposit]
//   --send     mint (if needed), approve and bridge `amount` from Global to Tokyo, then wait for it
//   --deposit  deposit `amount` of Tokyo USDso into the MarginBank

import "dotenv/config";
import { createPublicClient, createWalletClient, formatEther, http, pad, parseAbi, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rpc } from "../src/chain.js";
import { network, requireEnv, txUrl } from "../src/config.js";

const net = network();
const amount = parseEther(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? "200");
const send = process.argv.includes("--send");
const deposit = process.argv.includes("--deposit");
const me = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);

const GLOBAL_ID = 50312;
const TOKYO_ID = 50383;
const globalChain = {
  id: GLOBAL_ID,
  name: "Somnia Global testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: ["https://dream-rpc.somnia.network"] } },
} as const;
const global = createPublicClient({ chain: globalChain, transport: http() });
const globalWallet = createWalletClient({ account: me, chain: globalChain, transport: http() });

const ROUTER = "0x94e2e7f4b2b0a8e3032c7d3ff3c86790bb5979e6" as Address; // USDso router on Global
const GLOBAL_USDSO = "0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171" as Address;
const TOKYO_USDSO = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72" as Address;

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function mint(address to, uint256 amount)",
]);
const routerAbi = parseAbi([
  "function quoteGasPayment(uint32 destination) view returns (uint256)",
  "function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32)",
]);
const bankAbi = parseAbi(["function deposit(uint256 amount)"]);

const usd = (x: bigint) => `${formatEther(x)} USDso`;
const [gStt, gUsd, allowance, fee, tUsd] = await Promise.all([
  global.getBalance({ address: me.address }),
  global.readContract({ address: GLOBAL_USDSO, abi: erc20, functionName: "balanceOf", args: [me.address] }),
  global.readContract({ address: GLOBAL_USDSO, abi: erc20, functionName: "allowance", args: [me.address, ROUTER] }),
  global.readContract({ address: ROUTER, abi: routerAbi, functionName: "quoteGasPayment", args: [TOKYO_ID] }),
  rpc.readContract({ address: TOKYO_USDSO, abi: erc20, functionName: "balanceOf", args: [me.address] }),
]);
console.log(`account        ${me.address}`);
console.log(`global         ${formatEther(gStt)} STT, ${usd(gUsd)}, router allowance ${usd(allowance)}`);
console.log(`bridge fee     ${formatEther(fee)} STT to Tokyo`);
console.log(`tokyo          ${usd(tUsd)}`);

if (!send && !deposit) {
  await global.simulateContract({ account: me, address: GLOBAL_USDSO, abi: erc20, functionName: "mint", args: [me.address, amount] });
  console.log(`dry run: mint(${usd(amount)}) on Global would succeed. Add --send to mint and bridge.`);
  process.exit(0);
}

if (send) {
  if (gStt === 0n) throw new Error("no STT on Global for gas: claim 1 STT at explorer.testnet.somnia.network/faucet (Global testnet)");
  const globalTx = (h: Hex) => `https://explorer.testnet.somnia.network/tx/${h}`;
  if (gUsd < amount) {
    const h = await globalWallet.writeContract({ address: GLOBAL_USDSO, abi: erc20, functionName: "mint", args: [me.address, amount - gUsd] });
    await global.waitForTransactionReceipt({ hash: h });
    console.log(`minted         ${globalTx(h)}`);
  }
  if (allowance < amount) {
    const h = await globalWallet.writeContract({ address: GLOBAL_USDSO, abi: erc20, functionName: "approve", args: [ROUTER, amount] });
    await global.waitForTransactionReceipt({ hash: h });
    console.log(`approved       ${globalTx(h)}`);
  }
  const { request } = await global.simulateContract({
    account: me,
    address: ROUTER,
    abi: routerAbi,
    functionName: "transferRemote",
    args: [TOKYO_ID, pad(me.address, { size: 32 }), amount],
    value: fee,
  });
  const h = await globalWallet.writeContract(request);
  const r = await global.waitForTransactionReceipt({ hash: h });
  console.log(`bridged        ${r.status} ${globalTx(h)}`);
  console.log("waiting for delivery on Tokyo (up to 10 min)...");
  for (let i = 0; i < 60; i++) {
    const now = await rpc.readContract({ address: TOKYO_USDSO, abi: erc20, functionName: "balanceOf", args: [me.address] });
    if (now > tUsd) {
      console.log(`delivered      tokyo now holds ${usd(now)}`);
      break;
    }
    await new Promise((res) => setTimeout(res, 10_000));
  }
}

if (deposit) {
  const tokyoWallet = createWalletClient({ account: me, chain: net.chain, transport: http(net.rpcUrl) });
  const allowed = await rpc.readContract({ address: TOKYO_USDSO, abi: erc20, functionName: "allowance", args: [me.address, net.marginBank] });
  if (allowed < amount) {
    const h = await tokyoWallet.writeContract({ address: TOKYO_USDSO, abi: erc20, functionName: "approve", args: [net.marginBank, amount], gas: 2_000_000n });
    const r = await rpc.waitForTransactionReceipt({ hash: h });
    console.log(`approved bank  ${r.status} ${txUrl(h)}`);
    if (r.status !== "success") process.exit(1);
  }
  const { request } = await rpc.simulateContract({ account: me, address: net.marginBank, abi: bankAbi, functionName: "deposit", args: [amount] });
  const h = await tokyoWallet.writeContract({ ...request, gas: 2_000_000n });
  const r = await rpc.waitForTransactionReceipt({ hash: h });
  console.log(`deposited      ${r.status} ${txUrl(h)}`);
}
process.exit(0);
