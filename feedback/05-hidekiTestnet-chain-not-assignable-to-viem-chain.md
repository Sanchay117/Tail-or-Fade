# The SDK's exported chains (including `hidekiTestnet`) do not type-check as a viem `Chain` on viem 2.57
Severity: normal
Area: SDK

## Steps to reproduce
1. New TypeScript project with `strict: true`, @somnia-chain/markets-sdk 0.32.1, viem 2.57.17, TypeScript 7.0.2.
2. Use the chain the SDK exports:

```ts
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

export const m = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});
```

3. `npx tsc --noEmit`.

## Expected
The chain object the SDK ships for its own constructor type-checks with no cast.

## Actual
```
error TS2322: Type '{ ... blockTime: 10; ... }' is not assignable to type 'Chain'.
  Types of property 'prepareTransactionRequest' are incompatible.
    ...
      Types of parameters 'options' and 'options' are incompatible.
        Types of property 'phase' are incompatible.
          Type 'PrepareTransactionRequestPhase' is not assignable to type
          '"afterFillParameters" | "beforeFillParameters" | "beforeFillTransaction"'.
            Type '"afterFillTransactionError"' is not assignable to type
            '"afterFillParameters" | "beforeFillParameters" | "beforeFillTransaction"'.
```

Only one viem is installed (`npm ls viem` shows 2.57.17, deduped for the SDK too), so this is not a duplicate-dependency problem. The cause is in the SDK's published declaration file. `dist/chains/definitions/hidekiTestnet.d.ts` has the phase union written out inline, from the viem the SDK was built with:

```ts
phase: "beforeFillTransaction" | "beforeFillParameters" | "afterFillParameters";
```

viem 2.57.17 (`viem/_types/types/chain.d.ts`) has a fourth phase:

```ts
type PrepareTransactionRequestPhase = 'beforeFillTransaction' | 'afterFillTransactionError' | 'beforeFillParameters' | 'afterFillParameters';
```

`Chain` may call the hook with any of the four phases, so a hook typed for three is not assignable. The same frozen union is in `somniaMainnet.d.ts`, `somniaShannon.d.ts`, `somniaElwood.d.ts`, `somniaLocal.d.ts` and `chains/index.d.ts`, so every chain the SDK exports is affected. Runtime behaviour is fine; only the types break. Every builder on a current viem hits this in their first file, and the usual fix is an `as Chain` cast that hides real mistakes.

## Evidence
Full compiler output above, reproduced Nov 9 2026 with the snippet in step 2.

## Suggested fix
Give the exported chains an explicit annotation (for example `export const hidekiTestnet: Chain = defineChain({...})`) so the emitted `.d.ts` refers to viem's `Chain` type instead of copying its current shape. Then a newer viem cannot break it. Rebuilding against the current viem fixes it today but will break again on the next viem change. Also state the supported viem range in `peerDependencies`.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.17, TypeScript 7.0.2, Node 24, Somnia Tokyo testnet (Hideki, chain 50383)
