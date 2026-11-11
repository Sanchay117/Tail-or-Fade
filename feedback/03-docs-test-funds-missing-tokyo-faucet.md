# "Get test funds" never mentions the Tokyo faucet or the bridge, so a new builder ends up with no gas and no margin
Severity: normal
Area: docs

## Steps to reproduce
1. Start from a fresh EOA with no STT, as a new builder would.
2. Follow https://app.dreamdex.io/docs/developers/perps-testnet, section "Get test funds".

## Expected
The section says where a new address gets its first STT for gas, and where it gets USDso for margin. Both exist today:
- Gas: the Tokyo explorer faucet, https://explorer.testnet.somnia.network/tokyo/faucet (1 STT to an address holding under 1 STT).
- Margin: Somnia's test bridge, https://explorer.testnet.somnia.network/bridge. USDso on the Global testnet (0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171) can be minted by any address, and the bridge's USDso router (0x94e2e7f4b2b0a8e3032c7d3ff3c86790bb5979e6 on Global) delivers it to Tokyo as the perps collateral token 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72, with no bridge fee.

## Actual
The section only describes funding a bot through the app's Link a Bot dialog ("Send it … for gas"). That route moves STT the dreamDEX wallet already has, so it does not help an address with zero STT. The page never links the Tokyo faucet. We found it only by browsing the Tokyo explorer.

For margin, the same section says any address can claim the 1,000 USDso perps credit once. Claims currently revert (see our report "Perps voucher claim reverts with an undecoded error while getPerpVoucherEligibility says eligible"), and the Perps Arena closed on Nov 9. The bounty page says to ask in Discord. We asked on Nov 9 and were pointed at the Arena; joining it after the close brought nothing in two days. The bridge route above worked within minutes, but nothing in the docs or the bounty page mentions it. We found it by reading the USDso token page on the explorer.

## Evidence
- Docs page: https://app.dreamdex.io/docs/developers/perps-testnet ("Get test funds"), read Nov 9 2026
- Working faucet: https://explorer.testnet.somnia.network/tokyo/faucet
- Our margin, Nov 11 2026, deploy account 0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4:
  - mint 500 USDso on Global: https://explorer.testnet.somnia.network/tx/0xe538769b7c0642244db7318a4717c3a1f2b4477963c326e2093fad1879801009
  - bridge to Tokyo (`transferRemote(50383, …)`): https://explorer.testnet.somnia.network/tx/0xfb01a172accfdda6687de4c22269ed1370cade384b3cf28d842ae6f7f64bcb77
  - deposit into MarginBank on Tokyo: https://explorer.testnet.somnia.network/tokyo/tx/0x8c7b4c81deebda01d8318f2eb56ea73bba34ca25ffb135ac8a05510b1076a0fa
- Script: `scripts/bridge-usdso.ts` in our repo

## Suggested fix
Add two lines to "Get test funds": "Gas: the Tokyo faucet, https://explorer.testnet.somnia.network/tokyo/faucet (1 STT per address under 1 STT)." and "Margin: mint USDso on the Global testnet and bridge it to Tokyo at https://explorer.testnet.somnia.network/bridge, then deposit it into the MarginBank." Point the bounty page's "ask us in Discord" at the same route.

## Environment
Docs as of Nov 9 2026, Somnia Tokyo testnet (Hideki, chain 50383) and Global testnet (chain 50312), wallet 0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4
