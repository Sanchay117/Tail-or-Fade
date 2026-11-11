// Films the real app with Chrome's screencast, resampled to a constant 30 fps and encoded by
// ffmpeg. Writes public/capture/site.mp4 and public/capture/site.json (the second offsets the film
// cuts on). Each scene holds for as long as its narration, so voice first.
//
// Needs the API and web dev servers running (npm run dev in the repo root). Nothing here signs or
// sends a transaction: the setup form is filled but never submitted, and the follow page shown is
// an existing follow, read only.
//
//   node scripts/capture.ts [--url http://localhost:5195] [--follow 963038ba20dd]

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Locator } from "playwright-core";
import { DEMO } from "../src/script.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "capture");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = flag("--url", "http://localhost:5195");
const followId = flag("--follow", "963038ba20dd");
const FOLLOWER = "0x52a9C6D1E461dFa02919f2ee98380EFDF7034Cd4";

const FPS = 30;
const VIEW = { width: 1600, height: 900 };
const SCALE = 1.2; // 1920 x 1080 frames

const manifest = JSON.parse(readFileSync(join(root, "public", "vo", "manifest.json"), "utf8"));
const line = (id: string) => DEMO.find((l) => l.id === id)!;
const need = (id: string) => (line(id).lead ?? 0.5) + manifest.lines[id].seconds + (line(id).tail ?? 0.8);
/** Seconds into a scene at which the narrator says `word`. */
function spoken(id: string, word: string, nth = 0) {
  const hits = manifest.lines[id].words.filter((w: { text: string }) => w.text.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(word));
  return (line(id).lead ?? 0.5) + (hits[nth]?.start ?? 0);
}

const ffmpeg = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
   "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
   join(outDir, "site.mp4")],
  { stdio: ["pipe", "inherit", "inherit"] },
);

// Constant-rate resampling: the screencast only sends a frame when the page changes, so each frame
// is repeated until the next one's timestamp.
let t0 = 0;
let clockOffset = 0;
let written = 0;
let last: Buffer | null = null;
const fill = (until: number) => {
  const target = Math.floor((until - t0) * FPS);
  while (last && written < target) {
    ffmpeg.stdin.write(last);
    written++;
  }
};

const marks: Record<string, number> = {};
const mark = (name: string) => {
  marks[name] = Math.round((Date.now() / 1000 - clockOffset - t0) * 100) / 100;
  console.log(`${marks[name].toFixed(2).padStart(7)}s  ${name}`);
};
const hold = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs on every page load, so the cursor and the eased scroll survive navigation.
const helpers = `
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = \`
      html { scrollbar-width: none; scroll-behavior: auto !important; } ::-webkit-scrollbar { display: none; }
      #film-cursor { position: fixed; z-index: 10000; left: 0; top: 0; width: 26px; height: 26px; pointer-events: none;
        transition: transform 0.8s cubic-bezier(.65,0,.35,1); filter: drop-shadow(0 3px 4px rgba(13,27,36,.35)); }
      #film-cursor.press svg { transform: scale(.82); } #film-cursor svg { transition: transform .12s; }
      /* The filming browser holds no manage link, so hide the notice that says so. */
      .split .card:has(> .notice) { display: none; }
    \`;
    document.head.appendChild(style);
    const c = document.createElement("div");
    c.id = "film-cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4L16 20l-2.6 1.3-3.6-7.3L4 18.6z" fill="#0d1b24" stroke="#f8fbfa" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    c.style.transform = "translate(" + innerWidth * 0.7 + "px, " + innerHeight * 0.8 + "px)";
    document.body.appendChild(c);
  });
  window.__glide = (y, ms) => new Promise((done) => {
    const y0 = scrollY;
    const goal = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, y));
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      scrollTo({ top: y0 + (goal - y0) * e, behavior: "instant" });
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  // The hero's chips rotate every 5.2 s. Note when each new set arrives, so a click never lands mid-swap.
  window.__chipsAt = performance.now();
  addEventListener("DOMContentLoaded", () => {
    let seen = null;
    new MutationObserver(() => {
      const now = document.querySelector(".chips");
      if (now && now !== seen) { seen = now; window.__chipsAt = performance.now(); }
    }).observe(document.body, { childList: true, subtree: true });
  });
`;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, colorScheme: "light" });
const page = await context.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.addInitScript(helpers);
const cdp = await context.newCDPSession(page);

cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const ts = metadata.timestamp ?? Date.now() / 1000;
  if (!t0) {
    t0 = ts;
    clockOffset = Date.now() / 1000 - ts;
  }
  fill(ts);
  last = Buffer.from(data, "base64");
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const screencast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: VIEW.width * SCALE, maxHeight: VIEW.height * SCALE, everyNthFrame: 1 });

await page.goto(url, { waitUntil: "load" });
await page.waitForSelector(".chips .chip", { timeout: 60_000 });
await page.waitForFunction(() => document.querySelectorAll(".tape li .mkt").length >= 4, null, { timeout: 90_000 });
await page.evaluate(() => document.fonts.ready);
await hold(2500);

await screencast();
await hold(500);

/** Scrolls so the element's top sits `offset` px below the top of the viewport. */
async function glideTo(selector: string, ms = 1400, offset = 24) {
  await page.evaluate(
    async ([sel, dur, off]) => {
      const el = document.querySelector(sel as string)!;
      const y = el.getBoundingClientRect().top + scrollY - (off as number);
      await (window as unknown as { __glide: (y: number, ms: number) => Promise<void> }).__glide(y, dur as number);
    },
    [selector, ms, offset] as const,
  );
}

/** Moves the film cursor onto the element, presses, and clicks it. */
async function press(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to click");
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.55;
  await page.evaluate(([px, py]) => {
    document.getElementById("film-cursor")!.style.transform = `translate(${px}px, ${py}px)`;
  }, [x, y] as const);
  await hold(900);
  await page.evaluate(() => document.getElementById("film-cursor")!.classList.add("press"));
  await page.mouse.click(x, y);
  await hold(160);
  await page.evaluate(() => document.getElementById("film-cursor")!.classList.remove("press"));
}

/** Clicks a hero chip of the given kind, waiting for a fresh set if this one is about to rotate. */
async function pressChip(kind: "tail" | "fade") {
  const sel = `.chips .chip:has(.dot${kind === "fade" ? ".fade" : ":not(.fade)"})`;
  await page.waitForFunction(
    (s) => performance.now() - (window as unknown as { __chipsAt: number }).__chipsAt < 3400 && !!document.querySelector(s),
    sel,
    { timeout: 30_000, polling: 50 },
  );
  await press(page.locator(sel).first());
}

const started: Record<string, number> = {};
function begin(id: string) {
  mark(id);
  started[id] = Date.now();
}
async function until(id: string, seconds: number) {
  const left = seconds * 1000 - (Date.now() - started[id]);
  if (left > 0) await hold(left);
}

try {
  begin("hero");
  await until("hero", spoken("hero", "tap") - 0.7);
  await pressChip("tail");
  mark("tapped");
  await page.waitForSelector(".answer .big", { timeout: 30_000 });
  mark("answer");
  await until("hero", need("hero"));

  begin("flip");
  await until("flip", spoken("flip", "flip") - 0.4);
  await press(page.locator(".composer button", { hasText: "Fade" }));
  mark("flipped");
  await until("flip", spoken("flip", "so") - 0.9);
  await pressChip("fade");
  mark("faded");
  await page.waitForFunction(() => document.querySelector(".answer .big.gain") !== null, null, { timeout: 30_000 });
  mark("fadeAnswer");
  await until("flip", need("flip"));

  begin("tape");
  await glideTo("#live", 1600, 40);
  mark("taped");
  await until("tape", need("tape"));

  begin("setup");
  await glideTo(".answer", 1300, 180);
  await press(page.locator(".answer .cta a.btn"));
  await page.waitForSelector(".setup form", { timeout: 30_000 });
  mark("trader");
  await hold(1600);
  await glideTo(".setup", 1400, 110);
  mark("form");
  await press(page.locator(".setup input.input"));
  await page.keyboard.type(FOLLOWER, { delay: 22 });
  await hold(300);
  await press(page.locator(".setup .pills button", { hasText: "0.5x" }));
  await hold(300);
  await press(page.locator(".setup .pills button", { hasText: "$100" }));
  mark("filled");
  await until("setup", need("setup"));
  mark("leave");

  await page.goto(`${url}/f/${followId}`, { waitUntil: "load" });
  await screencast().catch(() => undefined);
  await page.waitForSelector(".checklist li", { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll(".checklist > li.done").length >= 1, null, { timeout: 60_000 });
  await hold(900);
  begin("bot");
  await until("bot", need("bot"));
  mark("end");
} finally {
  await cdp.send("Page.stopScreencast").catch(() => {});
  fill(Date.now() / 1000 - clockOffset);
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on("close", r));
  await browser.close();
  writeFileSync(
    join(outDir, "site.json"),
    JSON.stringify({ fps: FPS, width: VIEW.width * SCALE, height: VIEW.height * SCALE, seconds: written / FPS, marks }, null, 2) + "\n",
  );
  console.log(`\n${(written / FPS).toFixed(1)}s of footage`);
}
