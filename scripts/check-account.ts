// Is this dreamDEX account ready to be a follower? Margin, voucher state, gas.
// Run: npx tsx scripts/check-account.ts 0x...

import { formatEther, getAddress, type Address } from "viem";
import { account, sdk, sttBalance } from "../src/chain.js";
import { network } from "../src/config.js";

const net = network();
const who = getAddress(process.argv[2] ?? "") as Address;

const [acct, stt, elig, voucher, campaign] = await Promise.all([
  account(who, true),
  sttBalance(who),
  sdk.client.getPerpVoucherEligibility(net.marginBank, who).catch((e: Error) => ({ error: e.message })),
  sdk.client.getPerpVoucher(net.marginBank, who).catch((e: Error) => ({ error: e.message })),
  sdk.client.getPerpVoucherCampaign(net.marginBank).catch((e: Error) => ({ error: e.message })),
]);

const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
console.log("account      ", who);
console.log("perps equity ", formatEther(acct.equity), "USDso");
console.log("active pools ", acct.activePools.length);
console.log("STT          ", formatEther(stt));
console.log("voucher elig ", show(elig));
console.log("voucher      ", show(voucher));
console.log("campaign     ", show(campaign));
process.exit(0);
