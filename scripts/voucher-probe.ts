// Why does a voucher claim revert while eligibility says yes? Match the revert selector against
// candidate error names, and look for recent successful claims on the distributor.
// Run: npx tsx scripts/voucher-probe.ts

import { keccak256, parseAbiItem, toHex } from "viem";
import { rpc } from "../src/chain.js";

const DISTRIBUTOR = "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4";
const target = "0x3e31dcc2";

const names = [
  "AlreadyClaimed()", "BudgetExhausted()", "CampaignInactive()", "ClaimantNotFlat()", "ClaimantIsMainFunded()",
  "CreditRecipientInDebt()", "InsufficientCredit()", "MainFundedAccountCannotBeCredited()", "NothingToClaim()",
  "OnlyCreditGranter()", "VoucherAccountCannotBeMainFunded()", "NotSmartAccount()", "ClaimantNotSmartAccount()",
  "NotRegistered()", "ClaimantNotRegistered()", "Unauthorized()", "NotAllowlisted()", "ClaimantNotAllowed()",
  "CallerNotAccount()", "OnlySmartAccount()", "ContractCallerNotAllowed()", "EOANotAllowed()", "NotEligible()",
  "ClaimantHasCode()", "ClaimantNotContract()", "AccountNotFlat()", "AccountHasPosition()", "AccountHasOpenOrders()",
];
for (const n of names) {
  const sel = keccak256(toHex(n)).slice(0, 10);
  if (sel === target) console.log("MATCH", n);
}
console.log("no other matches printed means the name is not in the list");

// Recent Credited / claim events on the distributor, newest 999-block windows going back.
const head = await rpc.getBlockNumber();
let found = 0;
for (let i = 0; i < 40 && found < 5; i++) {
  const to = head - BigInt(i * 999);
  const logs = await rpc.getLogs({ address: DISTRIBUTOR, fromBlock: to - 998n, toBlock: to });
  for (const l of logs.slice(-5)) {
    found++;
    console.log("log", l.blockNumber, l.transactionHash, l.topics[0]);
  }
}
console.log(`searched back ${40 * 999} blocks from ${head}, ${found} logs`);
void parseAbiItem;
process.exit(0);
