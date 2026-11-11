// Shared chain access: one WebSocket client (the node that pushes Reactivity events is also the
// freshest one to read from; the public HTTP node trails it by a couple of seconds), the markets
// SDK for perp reads, and short caches so a burst of leader events doesn't hammer the node.

import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, getAddress, http, webSocket, type Address, type PublicClient } from "viem";
import { network } from "./config.js";
import { operatorAbi, PLACE_ORDER_FOR } from "./abi.js";

const net = network();

export const ws: PublicClient = createPublicClient({
  chain: net.chain,
  transport: webSocket(net.wsUrl, { keepAlive: { interval: 15_000 }, reconnect: { attempts: 1_000, delay: 1_000 } }),
}) as PublicClient;

export const rpc: PublicClient = createPublicClient({ chain: net.chain, transport: http(net.rpcUrl) }) as PublicClient;

export const sdk = new SomniaMarkets({
  // The SDK's own chain definition fails viem's Chain type under strict TS; the runtime value is fine.
  chain: hidekiTestnet as never,
  indexerUrl: net.indexerUrl,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});

export interface Market {
  pool: Address;
  symbol: string; // "ETH-PERP"
  base: string; // "ETH"
  marginBank: Address;
  baseDecimals: number;
  tickSize: bigint;
  lotSize: bigint;
  minQuantity: bigint;
}

let markets = new Map<string, Market>();
let marketsAt = 0;

export async function loadMarkets(force = false): Promise<Map<string, Market>> {
  if (!force && markets.size && Date.now() - marketsAt < 5 * 60_000) return markets;
  const rows = await sdk.client.listPerpMarkets();
  const next = new Map<string, Market>();
  for (const r of rows) {
    const pool = getAddress(r.poolAddress);
    const base = r.baseSymbol ?? pool.slice(0, 8);
    next.set(pool.toLowerCase(), {
      pool,
      symbol: `${base}-PERP`,
      base,
      marginBank: getAddress(r.marginBank),
      baseDecimals: r.baseDecimals,
      tickSize: BigInt(r.tickSize),
      lotSize: BigInt(r.lotSize),
      minQuantity: BigInt(r.minQuantity),
    });
  }
  markets = next;
  marketsAt = Date.now();
  return markets;
}

export async function market(pool: string): Promise<Market | undefined> {
  const m = (await loadMarkets()).get(pool.toLowerCase());
  if (m) return m;
  return (await loadMarkets(true)).get(pool.toLowerCase());
}

function cached<K, V>(ttlMs: number, fn: (k: K) => Promise<V>) {
  const cache = new Map<K, { at: number; v: Promise<V> }>();
  return (k: K, fresh = false): Promise<V> => {
    const hit = cache.get(k);
    if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.v;
    const v = fn(k);
    cache.set(k, { at: Date.now(), v });
    v.catch(() => cache.delete(k));
    return v;
  };
}

/** Live mark the pool acts on, or undefined while the market is un-priceable. */
export const mark = cached(1_500, async (pool: Address): Promise<bigint | undefined> => {
  const s = await sdk.client.getPerpHealthSnapshot(pool);
  return s.priceable && s.markPrice > 0n ? s.markPrice : undefined;
});

export interface AccountView {
  equity: bigint; // free collateral + uPnL + collateral locked by resting orders
  activePools: Address[];
}

export const account = cached(4_000, async (who: Address): Promise<AccountView> => {
  const a = await sdk.client.getMarginAccount(net.marginBank, who);
  return { equity: a.equity + a.lockedCollateral, activePools: a.activePerpPools.map((p) => getAddress(p)) };
});

export async function position(who: Address, pool: Address): Promise<bigint> {
  const p = await sdk.client.getPerpPosition({ marginBank: net.marginBank, account: who, pool });
  return p.size;
}

/** Whether `bot` may place orders for `owner` on `pool`. The pool's answer is the one it enforces. */
export async function isLinked(owner: Address, bot: Address, pool: Address): Promise<boolean> {
  return (await ws.readContract({
    address: pool,
    abi: operatorAbi,
    functionName: "isOperatorAuthorized",
    args: [owner, bot, PLACE_ORDER_FOR],
  })) as boolean;
}

export async function sttBalance(who: Address): Promise<bigint> {
  return ws.getBalance({ address: who });
}
