// Spike: prove the deploy key can claim paper USDso and place a real perps order on Hideki.
//   npx tsx scripts/spike-order.ts read           list perp markets and the key's state
//   npx tsx scripts/spike-order.ts claim          claim the 1,000 USDso voucher if eligible
//   npx tsx scripts/spike-order.ts open ETH 25    IOC long ~$25 notional
//   npx tsx scripts/spike-order.ts close ETH      IOC flatten the position

import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES, ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { formatEther, formatUnits, createPublicClient, http } from "viem";
import { network, requireEnv, txUrl } from "../src/config.js";
import { abs, alignPrice, alignQuantity, toRaw, withSlippage } from "../src/units.js";

const net = network();
const pk = requireEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
const markets = new SomniaMarkets({
  chain: hidekiTestnet as never,
  indexerUrl: net.indexerUrl,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  privateKey: pk,
});
const pub = createPublicClient({ transport: http(net.rpcUrl) });
const account = markets.walletAddress!;
const [cmd = "read", base = "ETH", notionalArg = "25"] = process.argv.slice(2);

async function balance() {
  return formatEther(await pub.getBalance({ address: account }));
}

async function cost(hash: `0x${string}`) {
  const r = await pub.getTransactionReceipt({ hash });
  return `${r.status} gasUsed=${r.gasUsed} cost=${formatEther(r.gasUsed * r.effectiveGasPrice)} STT block=${r.blockNumber}`;
}

const perps = await markets.client.listPerpMarkets();
const m = perps.find((x) => x.baseSymbol?.toUpperCase() === base.toUpperCase());

if (cmd === "read") {
  console.log("account", account, "STT", await balance());
  console.log("markets", perps.length);
  console.log("row keys", Object.keys(perps[0]!).join(", "));
  for (const x of perps.slice(0, 25)) {
    console.log(x.baseSymbol, x.poolAddress, "baseDec", x.baseDecimals, "tick", x.tickSize, "lot", x.lotSize, "min", x.minQuantity);
  }
  const elig = await markets.client.getPerpVoucherEligibility(net.marginBank, account);
  console.log("voucher eligibility", elig);
  const acct = await markets.client.getMarginAccount(net.marginBank, account).catch((e) => String(e));
  console.log("margin account", acct);
  process.exit(0);
}

if (!m) throw new Error(`no perp market for ${base}`);

if (cmd === "claim") {
  const elig = await markets.client.getPerpVoucherEligibility(net.marginBank, account);
  console.log("eligibility", elig);
  if (!elig.eligible) process.exit(1);
  const res = await markets.trader.claimPerpVoucher({ marginBank: net.marginBank });
  console.log("claim tx", res.hash, txUrl(res.hash), await cost(res.hash));
  process.exit(0);
}

const snap = await markets.client.getPerpHealthSnapshot(m.poolAddress);
if (!snap.priceable) throw new Error("market not priceable right now (stale mark)");
const mark = snap.markPrice;
const tick = BigInt(m.tickSize);
const lot = BigInt(m.lotSize);
const min = BigInt(m.minQuantity);
console.log(m.baseSymbol, "mark", formatUnits(mark, 18), "STT before", await balance());

if (cmd === "open") {
  const notional = Number(notionalArg);
  const markHuman = Number(formatUnits(mark, 18));
  const qty = alignQuantity(toRaw(notional / markHuman, m.baseDecimals), lot, min);
  const price = alignPrice(withSlippage(mark, 100, true), tick, true);
  const max = await markets.client.getMaxPerpOrderSize({
    pool: m.poolAddress,
    marginBank: m.marginBank,
    account,
    isBid: true,
    price,
  });
  console.log("qty", formatUnits(qty, m.baseDecimals), "price", formatUnits(price, 18), "max", max);
  if (!max.priceable || !max.placeable || qty === 0n || qty > max.maxQuantity) throw new Error("cannot place this size");
  const res = await markets.trader.placePerpOrder({
    pool: m.poolAddress,
    isBid: true,
    price,
    quantity: qty,
    orderType: ORDER_TYPE.MARKET,
    gas: 10_000_000n,
  });
  console.log("open tx", res.hash, txUrl(res.hash), await cost(res.hash));
}

if (cmd === "close") {
  const pos = await markets.client.getPerpPosition({ marginBank: m.marginBank, account, pool: m.poolAddress });
  console.log("position size", pos.size);
  if (pos.size === 0n) process.exit(0);
  const isBid = pos.size < 0n;
  const qty = alignQuantity(abs(pos.size), lot, min);
  const price = alignPrice(withSlippage(mark, 100, isBid), tick, isBid);
  const res = await markets.trader.placePerpOrder({
    pool: m.poolAddress,
    isBid,
    price,
    quantity: qty,
    orderType: ORDER_TYPE.MARKET,
    gas: 10_000_000n,
  });
  console.log("close tx", res.hash, txUrl(res.hash), await cost(res.hash));
}

const pos = await markets.client.getPerpPosition({ marginBank: m.marginBank, account, pool: m.poolAddress });
console.log("position now", formatUnits(pos.size, m.baseDecimals), m.baseSymbol, "STT after", await balance());
process.exit(0);
