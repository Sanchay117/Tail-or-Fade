// Small JSON-file store. One process owns it; writes are debounced and atomic (tmp + rename).
// Scale target is a hackathon MVP: hundreds of follows, a few thousand mirror records.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Address, Hex } from "viem";
import type { Mode } from "./sizing.js";

export type FollowStatus = "waiting" | "active" | "paused" | "stopped";

export interface Follow {
  id: string;
  createdAt: number;
  leader: Address;
  follower: Address;
  mode: Mode;
  multiplierBps: number;
  /** USDso, whole units. */
  maxNotional: number;
  bot: { address: Address; sealedKey: string };
  manageTokenHash: string;
  status: FollowStatus;
  /** Pools this follow has traded, so a stop or a leader close only touches positions we opened. */
  pools: Address[];
  /** Why the follow is not mirroring right now (no gas, not linked, ...). */
  blocker?: string;
  linkedAt?: number;
  lastCheckAt?: number;
}

export type MirrorStatus = "filled" | "partial" | "nofill" | "skipped" | "failed";

export interface MirrorRecord {
  id: string;
  at: number;
  followId: string;
  mode: Mode;
  leader: Address;
  follower: Address;
  pool: Address;
  symbol: string;
  leaderSize: string;
  leaderBlock?: number;
  /** ms between Reactivity delivering the leader's event and our receipt. */
  latencyMs?: number;
  side?: "buy" | "sell";
  quantity?: string;
  price?: string;
  notionalUsd?: number;
  txHash?: Hex;
  block?: number;
  blocksBehind?: number;
  gasCostStt?: number;
  status: MirrorStatus;
  reason?: string;
}

interface State {
  follows: Follow[];
  mirrors: MirrorRecord[];
}

const MAX_MIRRORS = 3000;

export class Store {
  private state: State = { follows: [], mirrors: [] };
  private timer?: NodeJS.Timeout;
  readonly path: string;

  constructor(dataDir = process.env.DATA_DIR ?? "data") {
    this.path = join(dataDir, "state.json");
    if (existsSync(this.path)) this.state = JSON.parse(readFileSync(this.path, "utf8"));
    else if (process.env.SEED_STATE_B64) {
      // First boot on a fresh host volume: carry over follows made elsewhere. Their bot keys are
      // sealed with MASTER_KEY, so the host must run with the same MASTER_KEY.
      this.state = JSON.parse(Buffer.from(process.env.SEED_STATE_B64, "base64").toString("utf8"));
      this.flush();
    }
  }

  private save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state));
    renameSync(tmp, this.path);
  }

  follows(): Follow[] {
    return this.state.follows;
  }

  follow(id: string): Follow | undefined {
    return this.state.follows.find((f) => f.id === id);
  }

  addFollow(f: Follow) {
    this.state.follows.push(f);
    this.save();
  }

  updateFollow(id: string, patch: Partial<Follow>) {
    const f = this.follow(id);
    if (!f) return;
    Object.assign(f, patch);
    this.save();
  }

  addMirror(m: MirrorRecord) {
    this.state.mirrors.push(m);
    if (this.state.mirrors.length > MAX_MIRRORS) this.state.mirrors.splice(0, this.state.mirrors.length - MAX_MIRRORS);
    this.save();
  }

  mirrors(filter?: (m: MirrorRecord) => boolean, limit = 100): MirrorRecord[] {
    const out: MirrorRecord[] = [];
    for (let i = this.state.mirrors.length - 1; i >= 0 && out.length < limit; i--) {
      const m = this.state.mirrors[i]!;
      if (!filter || filter(m)) out.push(m);
    }
    return out;
  }

  allMirrors(): readonly MirrorRecord[] {
    return this.state.mirrors;
  }
}
