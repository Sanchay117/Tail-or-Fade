// Does the hosted app stay awake on its own? Waits until the build that reports upMinutes is live,
// then sends nothing for `quiet` minutes and checks once: upMinutes at least that long means the
// process never slept (a wake-up would restart it and reset the counter).
// Run: npx tsx scripts/check-awake.ts [url=https://tail-or-fade.onrender.com] [quiet=30]
const url = process.argv[2] ?? "https://tail-or-fade.onrender.com";
const quiet = Number(process.argv[3] ?? 30);
const health = async () => (await fetch(`${url}/api/health`)).json() as Promise<{ upMinutes?: number; eventsSeen?: number }>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; ; i++) {
  const h = await health().catch(() => ({}) as { upMinutes?: number });
  if (typeof h.upMinutes === "number") {
    console.log(`${new Date().toISOString().slice(11, 19)} new build live, upMinutes ${h.upMinutes}`);
    break;
  }
  if (i > 30) throw new Error("new build not live after 30 minutes");
  await wait(60_000);
}
await wait(quiet * 60_000);
const h = await health();
console.log(`${new Date().toISOString().slice(11, 19)} after ${quiet} quiet minutes: upMinutes ${h.upMinutes}, eventsSeen ${h.eventsSeen}`);
console.log((h.upMinutes ?? 0) >= quiet ? "stayed awake" : "it slept and restarted");
