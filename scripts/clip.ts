// Copy a deploy secret to the macOS clipboard without printing it, for pasting into a host's
// environment settings.
// Run: npx tsx scripts/clip.ts master   (MASTER_KEY from .env)
//      npx tsx scripts/clip.ts seed     (SEED_STATE_B64: base64 of data/state.json)
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const what = process.argv[2];
const value =
  what === "master" ? process.env.MASTER_KEY :
  what === "seed" ? readFileSync("data/state.json").toString("base64") :
  undefined;
if (!value) throw new Error("usage: clip.ts master|seed (and MASTER_KEY must be set in .env)");
execFileSync("pbcopy", { input: value });
console.log(`copied ${what === "master" ? "MASTER_KEY" : "SEED_STATE_B64"} (${value.length} characters) to the clipboard`);
