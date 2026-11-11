import { staticFile } from "remotion";
import { DEMO, TEASER } from "./script.ts";

export const FPS = 30;
/** Frames by which each scene overlaps the one before it (a crossfade). */
export const OVERLAP = 12;
/** The teaser runs on the score's grid (120 BPM, a bar every 60 frames), not on the narration's. */
export const TEASER_FRAMES = 20 * FPS;
/** The drop, where the title lands: bar 8. */
export const DROP = 16 * FPS;

/** Where each teaser line starts, in seconds. scenes/Teaser.tsx cuts around these. */
export const TEASER_AT: Record<string, number> = {
  "t-sides": 0.5,
  "t-down": 4.1,
  "t-copy": 9.6,
  "t-other": 12.6,
  "t-name": 16.15,
};

export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface Take {
  file: string;
  seconds: number;
  words: Word[];
}
export interface Capture {
  fps: number;
  width: number;
  height: number;
  seconds: number;
  marks: Record<string, number>;
}

export interface Shot {
  id: string;
  /** First frame of the scene in the film. */
  from: number;
  frames: number;
  /** Frame, relative to the scene, where the narrator starts. */
  voiceAt: number;
  take?: Take;
  text: string;
}

export interface Voice {
  id: string;
  from: number;
  frames: number;
  file: string;
}

export interface Plan {
  shots: Shot[];
  voices: Voice[];
  teaser: Record<string, Take>;
  capture: Capture;
  total: number;
}

async function load<T>(path: string): Promise<T | undefined> {
  try {
    const res = await fetch(staticFile(path));
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Seconds of footage each filmed scene runs for, and whether the same take carries on into the next. */
function filmed(c: Capture): Record<string, { seconds: number; linked: boolean }> {
  const m = c.marks;
  return {
    hero: { seconds: m.flip - m.hero, linked: true },
    flip: { seconds: m.tape - m.flip, linked: true },
    tape: { seconds: m.setup - m.tape, linked: true },
    setup: { seconds: m.leave - m.setup, linked: false },
    bot: { seconds: m.end - m.bot, linked: false },
  };
}

export async function makePlan(): Promise<Plan> {
  const manifest = await load<{ voice: string; lines: Record<string, Take> }>("vo/manifest.json");
  const capture = await load<Capture>("capture/site.json");
  if (!manifest || !capture) throw new Error("Run npm run voice and npm run capture first.");

  const scenes = filmed(capture);
  const teaser: Record<string, Take> = {};
  const voices: Voice[] = [];
  for (const line of TEASER) {
    const take = manifest.lines[line.id];
    teaser[line.id] = take;
    voices.push({ id: line.id, from: Math.round(TEASER_AT[line.id] * FPS), frames: Math.ceil(take.seconds * FPS) + 2, file: take.file });
  }

  const shots: Shot[] = [{ id: "teaser", from: 0, frames: TEASER_FRAMES, voiceAt: 0, text: "" }];
  let at = TEASER_FRAMES - OVERLAP;
  for (const line of DEMO) {
    const take = manifest.lines[line.id];
    const lead = line.lead ?? 0.5;
    const tail = line.tail ?? 0.8;
    const scene = scenes[line.id];
    const seconds = Math.max(lead + take.seconds + tail, line.minSeconds ?? 0, scene?.seconds ?? 0);
    const frames = Math.round(seconds * FPS);
    const running = frames + (scene?.linked ? OVERLAP : 0);
    shots.push({ id: line.id, from: at, frames: running, voiceAt: Math.round(lead * FPS), take, text: line.text });
    voices.push({ id: line.id, from: at + Math.round(lead * FPS), frames: Math.ceil(take.seconds * FPS) + 2, file: take.file });
    at += running - OVERLAP;
  }
  return { shots, voices, teaser, capture, total: at + OVERLAP };
}

const bare = (text: string) => text.toLowerCase().replace(/[^a-z0-9$]/g, "");

/** Frame, relative to the scene, at which the narrator starts the `nth` word beginning with `word`. */
export function cue(shot: Shot, word: string, nth = 0): number {
  const hits = shot.take?.words.filter((w) => bare(w.text).startsWith(word)) ?? [];
  const hit = hits[nth];
  if (!hit) throw new Error(`"${word}" is not in the ${shot.id} narration`);
  return shot.voiceAt + Math.round(hit.start * FPS);
}

/** Film frame at which a teaser line reaches `word`. */
export function said(plan: Plan, id: string, word: string, nth = 0): number {
  const hits = plan.teaser[id].words.filter((w) => bare(w.text).startsWith(word));
  const hit = hits[nth];
  if (!hit) throw new Error(`"${word}" is not in the ${id} narration`);
  return Math.round((TEASER_AT[id] + hit.start) * FPS);
}
