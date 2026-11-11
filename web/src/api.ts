import { useEffect, useRef, useState } from "react";

export type Mode = "tail" | "fade";

export interface TraderStats {
  address: string;
  pnl7d: number;
  closes: number;
  wins: number;
  winRate: number;
  best: number;
  worst: number;
  lastActive: number;
  markets: string[];
  spark: number[];
}

export interface Leaderboard {
  updatedAt: number;
  tail: TraderStats[];
  fade: TraderStats[];
  traders: number;
  losing: number;
}

export interface OpenPosition {
  symbol: string;
  base: string;
  pool: string;
  size: number;
  side: "long" | "short";
  notionalUsd: number;
}

export interface Mirror {
  id: string;
  at: number;
  followId: string;
  mode: Mode;
  leader: string;
  follower: string;
  pool: string;
  symbol: string;
  leaderSize: string;
  leaderBlock?: number;
  latencyMs?: number;
  side?: "buy" | "sell";
  quantity?: string;
  price?: string;
  notionalUsd?: number;
  txHash?: string;
  block?: number;
  blocksBehind?: number;
  gasCostStt?: number;
  status: "filled" | "partial" | "nofill" | "skipped" | "failed";
  reason?: string;
  txUrl?: string;
}

export interface TraderProfile {
  address: string;
  stats?: TraderStats;
  equityUsd: number;
  positions: OpenPosition[];
  closes: { symbol: string; pnl: number; at: number; txHash: string }[];
  followers: { tail: number; fade: number };
  mirrors: Mirror[];
}

export interface Follow {
  id: string;
  createdAt: number;
  leader: string;
  follower: string;
  mode: Mode;
  multiplierBps: number;
  maxNotional: number;
  bot: string;
  botUrl: string;
  status: "waiting" | "active" | "paused" | "stopped";
  pools: string[];
  blocker?: string;
  linkedAt?: number;
  lastCheckAt?: number;
}

export interface FollowDetail {
  follow: Follow;
  botGasStt: number;
  ready: { gas: boolean; linked: boolean; margin: boolean };
  equityUsd: number;
  mirrors: Mirror[];
}

export interface Stats {
  follows: number;
  active: number;
  leaders: number;
  orders: number;
  notionalUsd: number;
  medianBlocksBehind: number | null;
  eventsSeen: number;
}

export interface Tape {
  account: string;
  pool: string;
  symbol: string;
  base: string;
  newSize: string;
  size: number;
  realizedPnl: string;
  pnl: number;
  following: boolean;
  block?: number;
  at: number;
  /** Assigned on receipt; two events can share every other field. */
  seq: number;
}

export const EXPLORER = "https://explorer.testnet.somnia.network/tokyo";
export const FAUCET = "https://explorer.testnet.somnia.network/tokyo/faucet";
export const DREAMDEX = "https://dreamdex.io";
export const txLink = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrLink = (a: string) => `${EXPLORER}/address/${a}`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}

export const api = {
  leaders: () => req<Leaderboard>("/api/leaders"),
  trader: (a: string) => req<TraderProfile>(`/api/traders/${a}`),
  stats: () => req<Stats>("/api/stats"),
  mirrors: (limit = 30) => req<Mirror[]>(`/api/mirrors?limit=${limit}`),
  markets: () => req<{ symbol: string; base: string; pool: string }[]>("/api/markets"),
  follow: (id: string) => req<FollowDetail>(`/api/follows/${id}`),
  createFollow: (body: { leader: string; follower: string; mode: Mode; multiplier: number; maxNotional: number }) =>
    req<{ follow: Follow; manageToken: string }>("/api/follows", { method: "POST", body: JSON.stringify(body) }),
  act: (id: string, action: "stop" | "pause" | "resume", token: string, close = false) =>
    req<{ follow: Follow }>(`/api/follows/${id}/${action}`, { method: "POST", body: JSON.stringify({ token, close }) }),
};

/** Manage tokens live only in this browser. Losing them means losing the pause and stop buttons, not the follow. */
const KEY = "tailorfade.follows";
export interface Saved { id: string; token: string; leader: string; mode: Mode; createdAt: number }
export function savedFollows(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Saved[];
  } catch {
    return [];
  }
}
export function saveFollow(s: Saved) {
  try {
    const list = savedFollows().filter((x) => x.id !== s.id);
    localStorage.setItem(KEY, JSON.stringify([s, ...list]));
  } catch {
    /* private mode: the follow still runs, it just is not remembered here */
  }
}
export const tokenFor = (id: string) => savedFollows().find((s) => s.id === id)?.token;

/** Fetch once, then optionally poll. */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const run = () =>
      fn()
        .then((d) => live && (setData(d), setError(undefined)))
        .catch((e: Error) => live && setError(e.message));
    void run();
    const t = pollMs ? setInterval(run, pollMs) : undefined;
    return () => {
      live = false;
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

/** The live stream: dreamDEX position changes, mirrored orders and stats. */
export function useStream(maxTape = 14) {
  const [tape, setTape] = useState<Tape[]>([]);
  const [mirrors, setMirrors] = useState<Mirror[]>([]);
  const [stats, setStats] = useState<Stats>();
  const [connected, setConnected] = useState(false);
  const queue = useRef<Tape[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("tape", (e) => queue.current.push({ ...(JSON.parse((e as MessageEvent).data) as Tape), seq: ++seq.current }));
    es.addEventListener("mirror", (e) => setMirrors((m) => [JSON.parse((e as MessageEvent).data) as Mirror, ...m].slice(0, 50)));
    es.addEventListener("stats", (e) => setStats(JSON.parse((e as MessageEvent).data) as Stats));
    // Advance the strip one frame at a time, like a film gate, instead of dumping bursts.
    const gate = setInterval(() => {
      const next = queue.current.shift();
      if (queue.current.length > 30) queue.current.splice(0, queue.current.length - 30);
      if (next) setTape((t) => [next, ...t].slice(0, maxTape));
    }, 420);
    return () => {
      es.close();
      clearInterval(gate);
    };
  }, [maxTape]);
  return { tape, mirrors, stats, connected };
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const usd = (n: number, sign = false) => {
  const s = Math.abs(n) >= 1000 ? Math.round(Math.abs(n)).toLocaleString("en-US") : Math.abs(n).toFixed(Math.abs(n) < 10 ? 2 : 0);
  return `${n < 0 ? "−" : sign ? "+" : ""}$${s}`;
};
export const ago = (unixS: number) => {
  const d = Math.max(0, Date.now() / 1000 - unixS);
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
};
