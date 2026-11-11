// HTTP API, live stream and the mirror loop in one process.

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { existsSync, readFileSync } from "node:fs";
import { formatEther, getAddress, isAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { addressUrl, network, txUrl } from "./config.js";
import { loadMarkets } from "./chain.js";
import { encrypt, newToken, sha256, tokenMatches } from "./crypto.js";
import { MirrorEngine } from "./engine.js";
import { leaderboard, profile } from "./leaders.js";
import { Store, type Follow, type MirrorRecord } from "./store.js";
import { Watcher, type TapeEvent } from "./watcher.js";

const net = network();
const store = new Store();
const engine = new MirrorEngine(store);
const watcher = new Watcher();
const PORT = Number(process.env.PORT ?? 8787);

function publicFollow(f: Follow) {
  const { bot, manageTokenHash: _h, ...rest } = f;
  return { ...rest, bot: bot.address, botUrl: addressUrl(bot.address) };
}

function stats() {
  const mirrors = store.allMirrors();
  const placed = mirrors.filter((m) => m.txHash && (m.status === "filled" || m.status === "partial"));
  const behind = placed.map((m) => m.blocksBehind).filter((b): b is number => typeof b === "number").sort((a, b) => a - b);
  const follows = store.follows();
  return {
    follows: follows.filter((f) => f.status !== "stopped").length,
    active: follows.filter((f) => f.status === "active").length,
    leaders: new Set(follows.filter((f) => f.status !== "stopped").map((f) => f.leader.toLowerCase())).size,
    orders: placed.length,
    notionalUsd: Math.round(placed.reduce((s, m) => s + (m.notionalUsd ?? 0), 0)),
    medianBlocksBehind: behind.length ? behind[Math.floor(behind.length / 2)] : null,
    eventsSeen: watcher.count,
  };
}

const app = new Hono();
app.use("/api/*", cors());

const startedAt = Date.now();
app.get("/api/health", (c) =>
  c.json({ ok: true, network: net.name, upMinutes: Math.round((Date.now() - startedAt) / 60_000), ...stats() }),
);
app.get("/api/stats", (c) => c.json(stats()));

app.get("/api/leaders", async (c) => {
  try {
    return c.json(await leaderboard());
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.get("/api/traders/:address", async (c) => {
  const a = c.req.param("address");
  if (!isAddress(a)) return c.json({ error: "not an address" }, 400);
  const addr = getAddress(a);
  try {
    const p = await profile(addr);
    const follows = store.follows().filter((f) => f.status !== "stopped" && f.leader.toLowerCase() === addr.toLowerCase());
    return c.json({
      ...p,
      followers: { tail: follows.filter((f) => f.mode === "tail").length, fade: follows.filter((f) => f.mode === "fade").length },
      mirrors: store.mirrors((m) => m.leader.toLowerCase() === addr.toLowerCase(), 30),
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.post("/api/follows", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { leader, follower, mode } = body as Record<string, string>;
  if (!isAddress(leader ?? "") || !isAddress(follower ?? "")) return c.json({ error: "leader and follower must be addresses" }, 400);
  if (leader!.toLowerCase() === follower!.toLowerCase()) return c.json({ error: "you can't follow yourself" }, 400);
  if (mode !== "tail" && mode !== "fade") return c.json({ error: "mode must be tail or fade" }, 400);
  // Two follows on one account would each steer the same positions toward a different target.
  const clash = store.follows().find((f) => f.status !== "stopped" && f.follower.toLowerCase() === follower!.toLowerCase());
  if (clash) {
    return c.json({ error: `this account already ${clash.mode}s ${clash.leader.slice(0, 6)}…${clash.leader.slice(-4)}. Stop that follow first.` }, 409);
  }
  const multiplier = Math.min(3, Math.max(0.1, Number(body.multiplier ?? 1)));
  const maxNotional = Math.min(10_000, Math.max(10, Number(body.maxNotional ?? 250)));
  const pk = generatePrivateKey();
  const bot = privateKeyToAccount(pk).address;
  const token = newToken();
  const f: Follow = {
    id: sha256(`${bot}${Date.now()}`).slice(0, 12),
    createdAt: Date.now(),
    leader: getAddress(leader!),
    follower: getAddress(follower!),
    mode,
    multiplierBps: Math.round(multiplier * 10_000),
    maxNotional,
    bot: { address: bot, sealedKey: encrypt(pk) },
    manageTokenHash: sha256(token),
    status: "waiting",
    pools: [],
    blocker: "bot key needs gas",
  };
  store.addFollow(f);
  return c.json({ follow: publicFollow(f), manageToken: token });
});

app.get("/api/follows", (c) => {
  const leader = c.req.query("leader")?.toLowerCase();
  const follower = c.req.query("follower")?.toLowerCase();
  const list = store
    .follows()
    .filter((f) => (!leader || f.leader.toLowerCase() === leader) && (!follower || f.follower.toLowerCase() === follower))
    .map(publicFollow);
  return c.json(list);
});

app.get("/api/follows/:id", async (c) => {
  let f = store.follow(c.req.param("id"));
  if (!f) return c.json({ error: "no such follow" }, 404);
  if (f.status === "waiting" && Date.now() - (f.lastCheckAt ?? 0) > 4_000) f = await engine.check(f).catch(() => f!);
  const r = await engine.readiness(f).catch(() => undefined);
  return c.json({
    follow: publicFollow(f),
    botGasStt: r ? Number(formatEther(r.gas)) : 0,
    ready: { gas: r?.gasOk ?? false, linked: r?.linked ?? false, margin: r?.marginOk ?? false },
    equityUsd: r ? Number(formatEther(r.equity)) : 0,
    mirrors: store.mirrors((m) => m.followId === f!.id, 50),
  });
});

async function authed(c: any): Promise<Follow | Response> {
  const f = store.follow(c.req.param("id"));
  if (!f) return c.json({ error: "no such follow" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (!body.token || !tokenMatches(String(body.token), f.manageTokenHash)) return c.json({ error: "wrong manage token" }, 403);
  (c as any).body_ = body;
  return f;
}

app.post("/api/follows/:id/stop", async (c) => {
  const f = await authed(c);
  if (f instanceof Response) return f;
  await engine.stop(f, Boolean((c as any).body_.close));
  return c.json({ follow: publicFollow(store.follow(f.id)!) });
});

app.post("/api/follows/:id/pause", async (c) => {
  const f = await authed(c);
  if (f instanceof Response) return f;
  store.updateFollow(f.id, { status: "paused" });
  return c.json({ follow: publicFollow(store.follow(f.id)!) });
});

app.post("/api/follows/:id/resume", async (c) => {
  const f = await authed(c);
  if (f instanceof Response) return f;
  store.updateFollow(f.id, { status: "waiting" });
  return c.json({ follow: publicFollow(await engine.check(store.follow(f.id)!)) });
});

app.get("/api/mirrors", (c) => c.json(store.mirrors(undefined, Math.min(200, Number(c.req.query("limit") ?? 50)))));

app.get("/api/markets", async (c) =>
  c.json([...(await loadMarkets()).values()].map((m) => ({ symbol: m.symbol, base: m.base, pool: m.pool }))),
);

// Live stream: mirrors as they land, and a throttled tape of every position change on dreamDEX.
const listeners = new Set<(event: string, data: unknown) => void>();
engine.on("mirror", (m: MirrorRecord) => listeners.forEach((l) => l("mirror", { ...m, txUrl: m.txHash ? txUrl(m.txHash) : undefined })));
let tapeBudget = 0;
setInterval(() => (tapeBudget = 0), 1000);
watcher.on("tape", async (t: TapeEvent) => {
  if (tapeBudget++ > 8 || listeners.size === 0) return;
  const m = (await loadMarkets()).get(t.pool.toLowerCase());
  const size = m ? Number(t.newSize) / 10 ** m.baseDecimals : 0;
  const pnl = Number(t.realizedPnl) / 1e18;
  const following = followedLeaders.has(t.account.toLowerCase());
  listeners.forEach((l) => l("tape", { ...t, symbol: m?.symbol ?? "?", base: m?.base ?? "?", size, pnl, following }));
});
// Leaders someone is following, so the tape can mark their frames.
const followedLeaders = new Set<string>();
setInterval(() => {
  followedLeaders.clear();
  for (const f of store.follows()) if (f.status !== "stopped") followedLeaders.add(f.leader.toLowerCase());
}, 5_000);
watcher.on("move", (m) => engine.onLeaderMove(m));

app.get("/api/stream", (c) =>
  streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => void stream.writeSSE({ event, data: JSON.stringify(data) });
    listeners.add(send);
    send("stats", stats());
    const tick = setInterval(() => send("stats", stats()), 5_000);
    stream.onAbort(() => {
      listeners.delete(send);
      clearInterval(tick);
    });
    while (!stream.aborted) await stream.sleep(30_000);
  }),
);

// The built front end, with client-side routing falling back to index.html.
const dist = "web/dist";
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: dist }));
  const index = readFileSync(`${dist}/index.html`, "utf8");
  app.get("*", (c) => c.html(index));
}

async function loops() {
  // Waiting follows: re-check prerequisites so a fresh link turns active within seconds.
  setInterval(() => {
    for (const f of store.follows()) {
      if (f.status === "waiting" && Date.now() - (f.lastCheckAt ?? 0) > 15_000) void engine.check(f).catch(() => undefined);
    }
  }, 5_000);
  // Active follows: reconcile against chain state every 2 minutes to heal anything missed.
  setInterval(() => {
    for (const f of store.follows()) if (f.status === "active") void engine.syncAll(f, "reconcile").catch(() => undefined);
  }, 120_000);
}

await loadMarkets();
await watcher.start();
void leaderboard().catch((e) => console.error("[leaders]", e.message));
await loops();
serve({ fetch: app.fetch, port: PORT });
console.log(`[server] tail-or-fade on :${PORT}, network ${net.name}, ${store.follows().length} follows loaded`);

// Render's free plan sleeps a service after 15 minutes without inbound requests, and the
// worker's own WebSocket to Somnia does not count. Calling our public URL every 10 minutes
// goes back in through Render's edge, which does count. Render sets RENDER_EXTERNAL_URL.
const selfUrl = process.env.RENDER_EXTERNAL_URL;
if (selfUrl) {
  setInterval(() => void fetch(`${selfUrl}/api/health`).catch(() => {}), 10 * 60_000);
  console.log(`[server] keep-awake ping to ${selfUrl}/api/health every 10 min`);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    store.flush();
    await watcher.stop();
    process.exit(0);
  });
}
