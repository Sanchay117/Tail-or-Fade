// Who is worth tailing, and who is worth fading. Built from the markets indexer's position
// changes: every close in the last 7 days, with its realized PnL.

import { getAddress, type Address } from "viem";
import { network } from "./config.js";
import { account, loadMarkets, mark, position } from "./chain.js";

const net = network();
const WINDOW_S = 7 * 86_400;
const BOT_CLOSES = 400; // more closes than this in a week is a market maker or a script

async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(net.indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as any;
  if (j.errors) throw new Error(`indexer: ${JSON.stringify(j.errors).slice(0, 300)}`);
  return j.data as T;
}

export interface TraderStats {
  address: Address;
  pnl7d: number;
  closes: number;
  wins: number;
  winRate: number;
  best: number;
  worst: number;
  lastActive: number; // unix s
  markets: string[];
  /** Cumulative realized PnL over the window, oldest first, at most 32 points. */
  spark: number[];
}

function sparkline(points: { t: number; pnl: number }[]): number[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let acc = 0;
  const cum = [0, ...sorted.map((p) => (acc += p.pnl))];
  if (cum.length <= 32) return cum.map((v) => Math.round(v * 100) / 100);
  const out: number[] = [];
  for (let i = 0; i < 32; i++) out.push(Math.round(cum[Math.round((i * (cum.length - 1)) / 31)]! * 100) / 100);
  return out;
}

export interface Leaderboard {
  updatedAt: number;
  tail: TraderStats[];
  fade: TraderStats[];
  /** Accounts (bots excluded) that closed at least one perp position in the window. */
  traders: number;
  /** How many of them are down over the window. */
  losing: number;
}

let board: Leaderboard | undefined;
let building: Promise<Leaderboard> | undefined;

async function closesSince(since: number) {
  const rows: { account: string; pool: string; realizedPnl: string; timestamp: string }[] = [];
  for (let offset = 0; offset < 60_000; offset += 1000) {
    const d = await gql<{ PerpPositionChange: typeof rows }>(
      `query($o:Int!,$s:numeric!){ PerpPositionChange(limit:1000, offset:$o, order_by:{timestamp:desc},
        where:{timestamp:{_gte:$s}, realizedPnl:{_neq:"0"}}){ account pool realizedPnl timestamp } }`,
      { o: offset, s: since },
    );
    rows.push(...d.PerpPositionChange);
    if (d.PerpPositionChange.length < 1000) break;
  }
  return rows;
}

async function build(): Promise<Leaderboard> {
  const now = Math.floor(Date.now() / 1000);
  const [rows, markets] = await Promise.all([closesSince(now - WINDOW_S), loadMarkets()]);
  const by = new Map<string, TraderStats & { pools: Set<string>; points: { t: number; pnl: number }[] }>();
  for (const r of rows) {
    let s = by.get(r.account);
    if (!s) {
      s = {
        address: getAddress(r.account),
        pnl7d: 0, closes: 0, wins: 0, winRate: 0, best: 0, worst: 0, lastActive: 0,
        markets: [], spark: [], pools: new Set(), points: [],
      };
      by.set(r.account, s);
    }
    const pnl = Number(r.realizedPnl) / 1e18;
    s.points.push({ t: Number(r.timestamp), pnl });
    s.pnl7d += pnl;
    s.closes++;
    if (pnl > 0) s.wins++;
    s.best = Math.max(s.best, pnl);
    s.worst = Math.min(s.worst, pnl);
    s.lastActive = Math.max(s.lastActive, Number(r.timestamp));
    s.pools.add(r.pool.toLowerCase());
  }
  const humans: TraderStats[] = [];
  for (const s of by.values()) {
    if (s.closes > BOT_CLOSES) continue;
    s.winRate = s.closes ? s.wins / s.closes : 0;
    s.markets = [...s.pools].map((p) => markets.get(p)?.base ?? "?").slice(0, 6);
    s.spark = sparkline(s.points);
    const { pools: _pools, points: _points, ...stats } = s;
    humans.push(stats);
  }
  const recent = (t: TraderStats, hours: number) => now - t.lastActive < hours * 3600;
  const tail = humans
    .filter((t) => t.closes >= 3 && t.pnl7d > 0 && recent(t, 48))
    .sort((a, b) => b.pnl7d - a.pnl7d)
    .slice(0, 12);
  const fade = humans
    .filter((t) => t.closes >= 5 && t.pnl7d < 0 && t.winRate < 0.45 && recent(t, 72))
    .sort((a, b) => a.pnl7d - b.pnl7d)
    .slice(0, 12);
  board = { updatedAt: Date.now(), tail, fade, traders: humans.length, losing: humans.filter((t) => t.pnl7d < 0).length };
  return board;
}

/** Cached leaderboard, rebuilt at most every 10 minutes. */
export async function leaderboard(): Promise<Leaderboard> {
  if (board && Date.now() - board.updatedAt < 10 * 60_000) return board;
  if (!building) building = build().finally(() => (building = undefined));
  if (board) return board; // serve stale while rebuilding
  return building;
}

export interface OpenPosition {
  symbol: string;
  base: string;
  pool: Address;
  size: number;
  side: "long" | "short";
  notionalUsd: number;
}

export interface TraderProfile {
  address: Address;
  stats?: TraderStats;
  equityUsd: number;
  positions: OpenPosition[];
  closes: { symbol: string; pnl: number; at: number; txHash: string }[];
}

export async function profile(addr: Address): Promise<TraderProfile> {
  const [acct, markets, b] = await Promise.all([account(addr, true), loadMarkets(), leaderboard().catch(() => undefined)]);
  const positions: OpenPosition[] = [];
  for (const pool of acct.activePools) {
    const m = markets.get(pool.toLowerCase());
    if (!m) continue;
    const [size, mk] = await Promise.all([position(addr, m.pool), mark(m.pool).catch(() => undefined)]);
    if (size === 0n) continue;
    const human = Number(size) / 10 ** m.baseDecimals;
    positions.push({
      symbol: m.symbol,
      base: m.base,
      pool: m.pool,
      size: Math.abs(human),
      side: size > 0n ? "long" : "short",
      notionalUsd: mk ? (Math.abs(human) * Number(mk)) / 1e18 : 0,
    });
  }
  const since = Math.floor(Date.now() / 1000) - WINDOW_S;
  const d = await gql<{ PerpPositionChange: { pool: string; realizedPnl: string; timestamp: string; txHash: string }[] }>(
    `query($a:String!,$s:numeric!){ PerpPositionChange(limit:60, order_by:{timestamp:desc},
      where:{account:{_eq:$a}, timestamp:{_gte:$s}, realizedPnl:{_neq:"0"}}){ pool realizedPnl timestamp txHash } }`,
    { a: addr.toLowerCase(), s: since },
  );
  const closes = d.PerpPositionChange.map((c) => ({
    symbol: markets.get(c.pool.toLowerCase())?.symbol ?? "?",
    pnl: Number(c.realizedPnl) / 1e18,
    at: Number(c.timestamp),
    txHash: c.txHash,
  }));
  const stats = b ? [...b.tail, ...b.fade].find((t) => t.address.toLowerCase() === addr.toLowerCase()) : undefined;
  let fallback: TraderStats | undefined;
  if (!stats && closes.length) {
    const wins = closes.filter((c) => c.pnl > 0).length;
    fallback = {
      address: addr,
      pnl7d: closes.reduce((s, c) => s + c.pnl, 0),
      closes: closes.length,
      wins,
      winRate: wins / closes.length,
      best: Math.max(...closes.map((c) => c.pnl)),
      worst: Math.min(...closes.map((c) => c.pnl)),
      lastActive: closes[0]!.at,
      markets: [...new Set(closes.map((c) => c.symbol.replace("-PERP", "")))].slice(0, 6),
      spark: sparkline(closes.map((c) => ({ t: c.at, pnl: c.pnl }))),
    };
  }
  return { address: addr, stats: stats ?? fallback, equityUsd: Number(acct.equity) / 1e18, positions, closes };
}
