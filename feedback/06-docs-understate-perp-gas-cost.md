# Docs say a perps transaction costs 0.0003 to 0.003 STT; bot orders on chain cost a median of 0.0175 STT
Severity: normal
Area: docs

## Steps to reproduce
1. Read https://app.dreamdex.io/docs/developers/perps-testnet. It says perps transactions cost between 0.0003 and 0.003 STT each.
2. Take every transaction that emitted `MarginBank.PositionUpdated` (topic0 `0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de`) in the last 900 blocks and compute `gasUsed * effectiveGasPrice` from the receipts.

## Expected
Real fees fall inside, or near, the documented range, so a builder can size a bot's gas budget from the docs.

## Actual
Sample of 55 transactions, blocks 45805496 to 45806396 (Nov 9 2026):

| Function (selector) | n | Min STT | Median STT | Max STT |
| --- | --- | --- | --- | --- |
| `placeOrderFor` (0x80054449), the bot path | 23 | 0.0048 | 0.0175 | 0.0293 |
| 0x68ae3595 | 17 | 0.0041 | 0.0060 | 0.0091 |
| 0x53edf33d | 10 | 0.0045 | 0.0071 | 0.0154 |
| 0x24ea3d1f | 3 | 0.0018 | 0.0018 | 0.0019 |
| Safe `execTransaction` (0x6a761202) | 2 | 0.0383 | 0.0939 | 0.0939 |

Only 3 of 55 cost 0.003 STT or less. Bot orders, which is the case the docs are budgeting for, never did: the cheapest was 0.0048 STT. Gas used per bot order runs about 2.9 to 9 million at 0.6 to 6 gwei.

This matters because the Tokyo faucet gives 1 STT. At the documented price that is 333 to 3,333 orders. At the median we measured it is about 57, so a copy-trading or market-making bot runs dry in an afternoon and its owner does not know why.

## Evidence
- Script: `scripts/perp-tx-costs.ts` in our repo (`npx tsx scripts/perp-tx-costs.ts 900 80`)
- Median `placeOrderFor`: https://explorer.testnet.somnia.network/tokyo/tx/0x799b65c7f65903fbecd9498fa5ba6a644a4d36381206162bee48845f8fe96288 (2,908,828 gas at 6 gwei, 0.01745 STT)
- Most expensive in sample: https://explorer.testnet.somnia.network/tokyo/tx/0x59d3e4154c6521176e278da4e9318624771dbe9ad3d113aa0c46a3bf893906d5 (15,653,176 gas at 6 gwei, 0.0939 STT)
- Cheapest in sample: https://explorer.testnet.somnia.network/tokyo/tx/0xb240d3ddf88362f812f4355fb8ed222c0b38f775140771d6b6ce2bc5c278d8a6 (0.0018 STT)

## Suggested fix
Change the range to roughly 0.005 to 0.03 STT per order, and say that gas used depends on how many resting orders a fill walks through, so a bot should budget for the high end.

## Environment
Somnia Tokyo testnet (Hideki, chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, read Nov 9 2026
