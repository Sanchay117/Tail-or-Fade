# Perps voucher claim reverts with an undecoded error while getPerpVoucherEligibility says eligible
Severity: major
Area: SDK

## Steps to reproduce
1. Fresh EOA on Somnia Tokyo testnet (Hideki, chain 50383) with 1 STT from the Tokyo faucet, no perp positions, no orders, never funded.
2. `await markets.client.getPerpVoucherEligibility("0x478769E1177C0773c43A593DCCc4Ad15F15F1394", account)` returns `{ eligible: true, grantAmount: 1000000000000000000000n }`.
3. `await markets.trader.claimPerpVoucher({ marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394" })`.

## Expected
The developer docs (Perps on Testnet for Developers) say "Any address can claim the 1,000 USDso perps credit once", and the SDK says its eligibility reasons are "checked in the order `VoucherDistributor.claim()` checks them". So an account reported eligible should be able to claim. If claims are closed on purpose, `getPerpVoucherEligibility` should say so (for example a `claimsClosed` reason) and the SDK should decode the error.

## Actual
`claim()` on the VoucherDistributor (0x2ACD9EFdA721450906bfE1bef3edE269636E42C4) reverts with custom error `0x3e31dcc2`, which is not in the SDK's error ABI, so the SDK reports "claim reverted: for an unknown reason". The transaction still mines and charges gas. Another address (0xF45077…42D3) hit the same failure twice about 15 hours earlier (visible on the distributor's explorer page), so this is not specific to one account.

What we found looking closer:

- `debug_traceTransaction` (callTracer) on both reverted claims shows the revert happens inside the distributor's implementation (0x9657F0fD53EFC01cD108d93C835BB4b517732b43, behind the EIP-1967 proxy) with no sub-call. MarginBank is never reached, so it is not a MarginBank-side check.
- `0x3e31dcc2` appears exactly once in the implementation's bytecode (pushed as a PUSH32 at byte offset 3672), and the branch that reaches it tests a flag read from storage. `getPerpVoucherEligibility` does not read that flag, which is why it keeps answering `eligible: true`.
- The campaign config the SDK can read still has `endsAt = 1798477478` (Dec 28 2026), so nothing readable says claims are over. Meanwhile the dreamDEX app's Perps Arena hub shows "Ended Oct 12 - Nov 9".
- A second, unrelated account (a Safe 1.5.0 smart account created by the dreamDEX app, 0xAAf28e5Dd265b2e6123f3DDE9a96228470176670) also reads `eligible: true`.
- We saw no successful claim to the distributor in the roughly 40,000 blocks we scanned before filing.
- Timing: both reverted claims landed at 12:40 UTC on Nov 9 2026 (blocks 45740079 and 45740148). The Perps Arena rules say trading ran until Nov 9 13:59 UTC, so the claim failed while the campaign was still open. The block is not simply the campaign ending.
- A simulated `claim()` (eth_call, nothing sent) now reverts for every address we tried: our EOA, an app-created Safe, its owner key, a bot key and a random address. `getPerpVoucherEligibility` still says `eligible: true` for all of them, and `getPerpVoucherCampaign` still reports 70,779 claims remaining.

So `claim()` is gated on something the SDK cannot see. It might be a global switch, or a per-account flag set by the app's Join Perps Arena flow. Either way, the eligibility read, the SDK error ABI and the developer docs do not reflect it. Builders following the docs spend gas on a claim that cannot succeed and get "unknown reason" back.

## Evidence
- Reverted claim: https://explorer.testnet.somnia.network/tokyo/tx/0x239a886e242403ee1f4f6e608ad23801add7988a92a9f2df752efea280c146c4 (block 45740079)
- Reverted claim: https://explorer.testnet.somnia.network/tokyo/tx/0x742756eeb31661da7fe0fb07553ba72df3d2076c1aad4472c0089f4ccfac965c (block 45740148)
- Revert data: `0x3e31dcc2`, calldata `0x4e71d92d` (`claim()`)
- Eligibility read immediately before: `{ eligible: true, grantAmount: 1000000000000000000000n }`
- Trace and bytecode scripts: `scripts/trace-tx.ts`, `scripts/distributor-disasm.ts` in our repo
- Claim simulation across addresses: `scripts/claim-sim.ts`; block times: `scripts/block-times.ts`

## Suggested fix
Add the claims-open flag to `getPerpVoucherEligibility` (a reason such as `claimsClosed`), add `0x3e31dcc2` to the SDK error ABI with a readable message, and update the "Get test funds" section of the developer docs to say whether builders can still get the 1,000 USDso credit and how.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.17, Node 24, Somnia Tokyo testnet (Hideki, chain 50383), wallet 0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4
