// Match an unknown 4-byte custom error against plausible error names.
//   npx tsx scripts/find-error.ts 0x3e31dcc2
import { toFunctionSelector } from "viem";

const target = (process.argv[2] ?? "").toLowerCase();
const nouns = [
  "", "Claim", "Voucher", "Account", "Caller", "Sender", "Claimer", "Campaign", "Credit", "Grant", "User", "Address",
  "Recipient", "Wallet", "Participant", "Registration", "Signature", "Merkle", "Proof", "Allowlist", "Whitelist",
];
const preds = [
  "NotEligible", "Ineligible", "NotAllowed", "NotAllowlisted", "NotWhitelisted", "NotRegistered", "Unauthorized",
  "NotAuthorized", "AlreadyClaimed", "NotActive", "Inactive", "Paused", "Ended", "NotStarted", "Expired", "Exhausted",
  "NotFlat", "HasPosition", "HasPositions", "HasOpenOrders", "MainFunded", "Dormant", "Disabled", "Closed", "Blocked",
  "Denied", "Invalid", "Required", "Missing", "Mismatch", "OnlySmartAccount", "OnlyEOA", "NotSmartAccount",
  "NotSomniaAccount", "NoCode", "IsContract", "NotContract", "OnlyRelayer", "OnlyOperator", "OnlyOwner",
  "SignatureRequired", "InvalidSignature", "InvalidProof", "CapReached", "BudgetExhausted", "LimitReached",
  "NotOpen", "ClaimsClosed", "ClaimsPaused", "NoCampaign", "CampaignNotLive", "NotLive", "Frozen", "Sybil",
  "InsufficientBalance", "InsufficientGas", "ZeroAddress", "NotFound", "Exists", "AlreadyExists",
];
const hits: string[] = [];
for (const n of nouns) {
  for (const p of preds) {
    for (const name of [`${n}${p}`, `${p}${n}`]) {
      if (!name) continue;
      if (toFunctionSelector(`${name}()`).toLowerCase() === target) hits.push(`${name}()`);
      if (toFunctionSelector(`${name}(address)`).toLowerCase() === target) hits.push(`${name}(address)`);
    }
  }
}
console.log(hits.length ? hits.join("\n") : "no match");
