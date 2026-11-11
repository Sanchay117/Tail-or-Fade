// Simulates VoucherDistributor.claim() (eth_call, nothing is sent) from each address given, to see
// whether the 0x3e31dcc2 revert is global or per account.
// Usage: npx tsx scripts/claim-sim.ts <address> [address...]
import { createPublicClient, http, type Address, type Hex } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const DISTRIBUTOR = "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4";
const CLAIM = "0x4e71d92d" as Hex;

const client = createPublicClient({ transport: http(RPC) });
for (const from of process.argv.slice(2) as Address[]) {
  try {
    const r = await client.call({ account: from, to: DISTRIBUTOR, data: CLAIM, gas: 3_000_000n });
    console.log(`${from}  ok  ${r.data ?? "0x"}`);
  } catch (e) {
    const err = e as { cause?: { data?: Hex }; data?: Hex; shortMessage?: string };
    const data = err.cause?.data ?? err.data;
    console.log(`${from}  reverts  ${data ?? err.shortMessage}`);
  }
}
