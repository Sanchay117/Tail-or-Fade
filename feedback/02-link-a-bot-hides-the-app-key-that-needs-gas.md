# Link a Bot blocks on "the app's key has no SOMI" but never shows that key or how to fund it
Severity: normal
Area: app

## Steps to reproduce
1. Sign in to app.testnet.dreamdex.io with a new account. Ours is "Wallet 1", a Safe 1.5.0 smart account at 0xAAf28e5Dd265b2e6123f3DDE9a96228470176670. At the time its single owner, the key that sends changes for it, was 0x6914e3F146ecd978d7797069D857d4669a971346. (A later sign-in on a second device added that device's key as a second owner.)
2. Open Link a Bot, paste a bot address (ours: 0x5DF364268Ce5EcAe7B0f09d70a72a2E61A51d76B) and keep Perps ticked.

## Expected
If the change cannot be sent because a key has no gas, the dialog names that key, shows its address with a copy button, and links the Tokyo faucet. The developer docs send builders to exactly this dialog to link a bot, so it is on every builder's path.

## Actual
The dialog shows a red error, "Can't add a bot yet: the app's key that sends this change has no SOMI.", and Add bot stays disabled. Nowhere in the dialog, the wallet panel or the docs does the app say what "the app's key" is or show its address. We found it only by reading `getOwners()` on the Safe. It is the Safe's owner 0x6914…1346, and it pays the gas for the link itself: once it held STT (we sent it 1 STT from the Tokyo faucet), Link a Bot went through, and that key paid for both link transactions.

Three smaller problems on the same screen:

- Testnet gas is labelled "SOMI". The gas token on the Tokyo testnet is STT, and the faucet hands out STT, so a builder looking for "SOMI" on testnet finds nothing.
- The dialog ticks "Send it 5 SOMI for gas" by default. The Tokyo faucet gives 1 STT, and only to an address holding under 1 STT, so a new testnet account can never fund that default.
- Linking costs more than it looks. Our link was two transactions (26 calls to the OperatorPermissionsRegistry, one per market), paid by the app key: 0.0893 + 0.0213 = 0.11 STT. That is 11% of a faucet drip before the bot has placed one order.

## Evidence
- Link transactions, sent by the app key 0x6914e3…1346 through the Safe's `execTransaction` and a MultiSend:
  - https://explorer.testnet.somnia.network/tokyo/tx/0x0d2ad10a0dcbb965998cc2d046c6c3c1a2cb6c0738522be2d89825943cc56c5c (fee 0.089284 STT)
  - https://explorer.testnet.somnia.network/tokyo/tx/0x1136c19b25d93a124098fdedbe44c9df809cb4b72d9db5ff2d3449eddaa51770 (fee 0.021264 STT)
- Safe owners read with `scripts/safe-owners.ts` in our repo
- Screenshot of the blocked dialog available on request

## Suggested fix
In the error, show the app key's address with a copy button and a "Get STT from the Tokyo faucet" link. Label testnet gas STT. Default the gas top-up to an amount the faucet can cover, such as 0.5 STT.

## Environment
app.testnet.dreamdex.io (web, Chrome), Somnia Tokyo testnet (Hideki, chain 50383), wallet 0xAAf28e5Dd265b2e6123f3DDE9a96228470176670, bot 0x5DF364268Ce5EcAe7B0f09d70a72a2E61A51d76B
