// Prints a line whenever a follow's checklist, equity or status changes, and exits once it is Live.
// Polls the local API. Usage: npx tsx scripts/watch-follow.ts <followId> [seconds=20] [--until-margin]
// --until-margin exits as soon as margin shows up or the status leaves "waiting", and also after
// 15 minutes of the API being unreachable, so a background run ends on anything worth acting on.
const id = process.argv[2] ?? "963038ba20dd";
const every = Number(process.argv[3] ?? 20) * 1000;
const untilMargin = process.argv.includes("--until-margin");
let last = "";
let downSince = 0;
for (;;) {
  try {
    const d = await fetch(`http://localhost:8790/api/follows/${id}`).then((r) => r.json());
    downSince = 0;
    const now = `status=${d.follow.status} gas=${d.ready.gas} linked=${d.ready.linked} margin=${d.ready.margin} equity=$${Number(d.equityUsd).toFixed(2)} mirrors=${d.mirrors.length}`;
    if (now !== last) console.log(`${new Date().toISOString().slice(11, 19)} ${now}`);
    last = now;
    if (d.follow.status === "active" && d.mirrors.length > 0) process.exit(0);
    if (untilMargin && (d.ready.margin || d.follow.status !== "waiting")) process.exit(0);
  } catch (e) {
    const msg = `api unreachable: ${(e as Error).message}`;
    if (msg !== last) console.log(msg);
    last = msg;
    downSince ||= Date.now();
    if (untilMargin && Date.now() - downSince > 15 * 60_000) process.exit(2);
  }
  await new Promise((r) => setTimeout(r, every));
}
