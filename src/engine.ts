// The mirror engine. A leader move arrives (from Reactivity or a periodic reconcile), and every
// active follow of that leader is brought to its target position in that market with one IOC
// order through the follow's own bot key.
//
// Mirroring is state-based: we copy where the leader IS, not the order they sent. Bursts of
// leader fills coalesce into one follower order, and a missed event heals on the next one.

import { EventEmitter } from "node:events";
import { formatUnits, getAddress, type Address } from "viem";
import { account, isLinked, loadMarkets, mark, market, position, sdk, sttBalance, type Market } from "./chain.js";
import { placeFor } from "./executor.js";
import { planOrder, notionalUsd } from "./sizing.js";
import { alignPrice, alignQuantity, withSlippage } from "./units.js";
import type { Follow, MirrorRecord, Store } from "./store.js";

const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS ?? 75);
const MIN_BOT_GAS = 5n * 10n ** 15n; // 0.005 STT, enough for one order at full gas price
const MAX_ORDERS_PER_HOUR = Number(process.env.MAX_ORDERS_PER_HOUR ?? 60);

export interface LeaderMove {
  leader: Address;
  pool: Address;
  newSize: bigint;
  /** Block the leader's change landed in, from the Reactivity eth_call. */
  block?: bigint;
  /** When we learned about it (ms). */
  receivedAt: number;
  source: "reactivity" | "reconcile" | "start" | "stop";
}

let seq = 0;
const rid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export class MirrorEngine extends EventEmitter {
  private running = new Map<string, boolean>();
  private pending = new Map<string, LeaderMove>();
  private sent = new Map<string, number[]>();

  constructor(private store: Store) {
    super();
  }

  /** Lower-cased leaders that have at least one active follow. */
  leaders(): Set<string> {
    return new Set(this.store.follows().filter((f) => f.status === "active").map((f) => f.leader.toLowerCase()));
  }

  onLeaderMove(move: LeaderMove) {
    const who = move.leader.toLowerCase();
    for (const f of this.store.follows()) {
      if (f.status === "active" && f.leader.toLowerCase() === who) this.schedule(f, move);
    }
  }

  private schedule(f: Follow, move: LeaderMove) {
    const key = `${f.id}:${move.pool.toLowerCase()}`;
    if (this.running.get(key)) {
      this.pending.set(key, move); // keep only the latest; state-based mirroring needs nothing else
      return;
    }
    this.running.set(key, true);
    void (async () => {
      let next: LeaderMove | undefined = move;
      while (next) {
        try {
          await this.mirror(f, next);
        } catch (err) {
          console.error(`[engine] ${f.id} ${next.pool}:`, (err as Error).message);
        }
        next = this.pending.get(key);
        this.pending.delete(key);
      }
      this.running.set(key, false);
    })();
  }

  private record(f: Follow, move: LeaderMove, m: Market | undefined, patch: Partial<MirrorRecord>) {
    const rec: MirrorRecord = {
      id: rid(),
      at: Date.now(),
      followId: f.id,
      mode: f.mode,
      leader: f.leader,
      follower: f.follower,
      pool: move.pool,
      symbol: m?.symbol ?? move.pool.slice(0, 10),
      leaderSize: m ? formatUnits(move.newSize, m.baseDecimals) : move.newSize.toString(),
      leaderBlock: move.block ? Number(move.block) : undefined,
      status: "skipped",
      ...patch,
    };
    this.store.addMirror(rec);
    this.emit("mirror", rec);
    return rec;
  }

  private underRateLimit(f: Follow): boolean {
    const now = Date.now();
    const list = (this.sent.get(f.id) ?? []).filter((t) => now - t < 3_600_000);
    this.sent.set(f.id, list);
    return list.length < MAX_ORDERS_PER_HOUR;
  }

  private async mirror(f: Follow, move: LeaderMove) {
    const m = await market(move.pool);
    if (!m) return this.record(f, move, m, { reason: "unknown market" });
    const quiet = move.source === "reconcile";

    const [mk, leader, follower, followerSize] = await Promise.all([
      mark(m.pool),
      account(f.leader),
      account(f.follower, true),
      position(f.follower, m.pool),
    ]);
    if (!mk) return quiet ? undefined : this.record(f, move, m, { reason: "market has no live mark price" });

    const plan = planOrder({
      mode: f.mode,
      multiplierBps: BigInt(f.multiplierBps),
      maxNotional: BigInt(Math.round(f.maxNotional)) * 10n ** 18n,
      leaderSize: move.newSize,
      leaderEquity: leader.equity,
      followerEquity: follower.equity,
      followerSize,
      mark: mk,
      grid: m,
    });
    if (plan.action === "skip") {
      if (quiet || plan.reason === "already in sync") return;
      return this.record(f, move, m, { reason: plan.reason });
    }
    if (!this.underRateLimit(f)) {
      return this.record(f, move, m, { reason: `paused: over ${MAX_ORDERS_PER_HOUR} orders this hour` });
    }

    const price = alignPrice(withSlippage(mk, SLIPPAGE_BPS, plan.isBid), m.tickSize, plan.isBid);
    let quantity = plan.quantity;
    if (!plan.reducing) {
      const max = await sdk.client.getMaxPerpOrderSize({
        pool: m.pool,
        marginBank: m.marginBank,
        account: f.follower,
        isBid: plan.isBid,
        price,
      });
      if (!max.priceable) return this.record(f, move, m, { reason: "market has no live mark price" });
      if (!max.placeable) {
        const why = max.limitedBy === "voucherBlocked" ? "Perps Arena credit can't open this market" : `blocked: ${max.limitedBy}`;
        return this.record(f, move, m, { reason: why });
      }
      if (quantity > max.maxQuantity) quantity = alignQuantity(max.maxQuantity, m.lotSize, m.minQuantity);
      if (quantity === 0n) return this.record(f, move, m, { reason: "not enough margin for the minimum size" });
    }

    this.sent.get(f.id)!.push(Date.now());
    const out = await placeFor({ sealedKey: f.bot.sealedKey, owner: f.follower, pool: m.pool, isBid: plan.isBid, price, quantity });
    const base = {
      side: plan.isBid ? ("buy" as const) : ("sell" as const),
      quantity: formatUnits(quantity, m.baseDecimals),
      price: formatUnits(price, 18),
      notionalUsd: notionalUsd(quantity, mk, m.baseDecimals),
    };
    if (!out.ok) {
      this.noteBlocker(f, out.reason);
      return this.record(f, move, m, { ...base, status: out.noFill ? "nofill" : "failed", reason: out.reason, txHash: out.hash });
    }

    if (!f.pools.some((p) => p.toLowerCase() === m.pool.toLowerCase())) {
      this.store.updateFollow(f.id, { pools: [...f.pools, m.pool] });
    }
    const after = await position(f.follower, m.pool).catch(() => undefined);
    const filled = after === undefined ? quantity : after > followerSize ? after - followerSize : followerSize - after;
    return this.record(f, move, m, {
      ...base,
      status: filled >= quantity ? "filled" : filled > 0n ? "partial" : "nofill",
      txHash: out.hash,
      block: Number(out.block),
      blocksBehind: move.block ? Number(out.block - move.block) : undefined,
      latencyMs: move.source === "reactivity" ? Date.now() - move.receivedAt : undefined,
      gasCostStt: out.gasCostStt,
    });
  }

  private noteBlocker(f: Follow, reason: string) {
    if (/insufficient funds/i.test(reason)) this.store.updateFollow(f.id, { status: "waiting", blocker: "bot key is out of gas" });
    if (/not ?authori[sz]ed|operator/i.test(reason)) this.store.updateFollow(f.id, { status: "waiting", blocker: "bot key is not linked" });
  }

  /** Check a follow's prerequisites and flip it between waiting and active. Starting syncs to the leader's open positions. */
  /** The three things a follow needs: gas on the bot key, the bot linked in dreamDEX, margin in the perps account. */
  async readiness(f: Follow) {
    const pools = [...(await loadMarkets()).values()];
    const probe = pools.find((p) => p.symbol === "BTC-PERP") ?? pools[0]!;
    const [linked, gas, acct] = await Promise.all([
      isLinked(f.follower, f.bot.address, probe.pool).catch(() => false),
      sttBalance(f.bot.address).catch(() => 0n),
      account(f.follower, true).catch(() => ({ equity: 0n, activePools: [] })),
    ]);
    return { linked, gas, gasOk: gas >= MIN_BOT_GAS, equity: acct.equity, marginOk: acct.equity > 0n };
  }

  async check(f: Follow): Promise<Follow> {
    if (f.status === "stopped" || f.status === "paused") return f;
    const { linked, gasOk, marginOk } = await this.readiness(f);
    const blocker = !gasOk
      ? "bot key needs gas"
      : !linked
        ? "bot key is not linked to your wallet yet"
        : !marginOk
          ? "your perps account has no margin"
          : undefined;
    const wasActive = f.status === "active";
    this.store.updateFollow(f.id, {
      status: blocker ? "waiting" : "active",
      blocker,
      lastCheckAt: Date.now(),
      linkedAt: linked ? (f.linkedAt ?? Date.now()) : f.linkedAt,
    });
    if (!blocker && !wasActive) await this.syncAll(f, "start");
    return this.store.follow(f.id)!;
  }

  /** Bring every market the leader holds, plus every market we touched, to target. */
  async syncAll(f: Follow, source: LeaderMove["source"]) {
    const leader = await account(f.leader, true);
    const pools = new Map<string, Address>();
    for (const p of leader.activePools) pools.set(p.toLowerCase(), p);
    for (const p of f.pools) pools.set(p.toLowerCase(), getAddress(p));
    for (const pool of pools.values()) {
      const newSize = await position(f.leader, pool);
      this.schedule(f, { leader: f.leader, pool, newSize, receivedAt: Date.now(), source });
    }
  }

  /** Stop mirroring; optionally flatten what this follow opened. */
  async stop(f: Follow, close: boolean) {
    this.store.updateFollow(f.id, { status: "stopped", blocker: undefined });
    if (!close) return;
    for (const pool of f.pools) {
      const m = await market(pool);
      if (!m) continue;
      const size = await position(f.follower, m.pool);
      if (size === 0n) continue;
      const mk = await mark(m.pool);
      if (!mk) continue;
      const isBid = size < 0n;
      const quantity = alignQuantity(size < 0n ? -size : size, m.lotSize, m.minQuantity);
      if (quantity === 0n) continue;
      const price = alignPrice(withSlippage(mk, SLIPPAGE_BPS, isBid), m.tickSize, isBid);
      const out = await placeFor({ sealedKey: f.bot.sealedKey, owner: f.follower, pool: m.pool, isBid, price, quantity });
      this.record(f, { leader: f.leader, pool: m.pool, newSize: 0n, receivedAt: Date.now(), source: "stop" }, m, {
        side: isBid ? "buy" : "sell",
        quantity: formatUnits(quantity, m.baseDecimals),
        price: formatUnits(price, 18),
        notionalUsd: notionalUsd(quantity, mk, m.baseDecimals),
        status: out.ok ? "filled" : out.noFill ? "nofill" : "failed",
        txHash: out.ok ? out.hash : out.hash,
        block: out.ok ? Number(out.block) : undefined,
        reason: out.ok ? "closed on stop" : out.reason,
      });
    }
  }
}
