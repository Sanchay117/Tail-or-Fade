// Link a bot key to the deploy account on every perp pool, the same registry write the app's
// Link a Bot makes for app wallets. Pass "unlink" as the second argument to revoke.
// Run: npx tsx scripts/link-bot.ts <bot> [unlink]

import "dotenv/config";
import { createWalletClient, getAddress, toFunctionSelector, webSocket, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PLACE_ORDER_FOR, registryAbi } from "../src/abi.js";
import { isLinked, loadMarkets, rpc } from "../src/chain.js";
import { network, requireEnv, txUrl } from "../src/config.js";

const net = network();
const bot = getAddress(process.argv[2] ?? "");
const approve = process.argv[3] !== "unlink";
const owner = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);
const CANCEL_ORDER_FOR = toFunctionSelector("cancelOrderFor(address,uint128)");

const wallet = createWalletClient({ account: owner, chain: net.chain, transport: webSocket(net.wsUrl) });
const { request } = await rpc.simulateContract({
  account: owner,
  address: net.operatorRegistry,
  abi: registryAbi,
  functionName: "setOperatorApprovalGlobal",
  args: [bot, [PLACE_ORDER_FOR, CANCEL_ORDER_FOR], approve],
});
const hash = await wallet.writeContract({ ...request, gas: 2_000_000n });
const receipt = await rpc.waitForTransactionReceipt({ hash, timeout: 60_000 });
console.log(`${approve ? "linked" : "unlinked"} ${bot} for ${owner.address}: ${receipt.status}`);
console.log(txUrl(hash));

const btc = [...(await loadMarkets()).values()].find((m) => m.symbol === "BTC-PERP")!;
console.log("pool says authorized:", await isLinked(owner.address, bot, btc.pool));
process.exit(0);
