# Base-decimals table in the developer docs lists 21 markets and leaves out ADLT
Severity: normal
Area: docs

## Steps to reproduce
1. Open https://app.dreamdex.io/docs/developers/perps-testnet and find the table of base decimals per market.
2. Load the live perps markets with the SDK: `await markets.loadMarkets(true)` on the Tokyo testnet, filtered to perps.

## Expected
The table lists every live perps market. The same page tells builders "Never assume 18; see the table above", so a missing row sends them to a table that has no answer.

## Actual
The SDK returns 22 perps markets. The docs table has 21. ADLT is missing:

| Field | Value |
| --- | --- |
| Pool | 0xe3f6DcDa98595764970E5a6FFd167af1D1B35123 |
| baseDecimals | 18 |
| tickSize | 10000000000000000 (0.01) |
| lotSize | 100000000000000 (0.0001) |
| minQuantity | 4000000000000000 (0.004) |

ADLT is also the one market the Perps Arena voucher does not allow (`MarginBank.isVoucherMarketAllowed(pool)` returns false for it and true for the other 21), so it may have been left out on purpose. If so, the page should still list it, or say the table covers voucher markets only.

## Evidence
- Market row read with @somnia-chain/markets-sdk 0.32.1, `loadMarkets(true)`, Nov 9 2026 (`scripts/min-orders.ts` and `scripts/pick-leader.ts` in our repo)
- Docs page: https://app.dreamdex.io/docs/developers/perps-testnet

## Suggested fix
Add an ADLT row (18 decimals), or generate the table from the market list so new listings appear on their own.

## Environment
@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet (Hideki, chain 50383), wallet 0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4
