import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { FPS, type Plan, type Shot } from "../plan.ts";
import { fonts, grad, ink, tail } from "../theme.ts";
import { Blob, BrowserFrame, clamp, easeInOut, Ground, Label } from "../ui/kit.tsx";
import { Sfx } from "../ui/Sfx.tsx";

interface Move {
  t: number;
  dur: number;
  z: number;
  x: number;
  y: number;
}

/** The camera over the whole take, in capture seconds, so scenes that share a take always agree. */
function moves(m: Record<string, number>): Move[] {
  return [
    // Home: the whole hero, then in on the composer, chips and answer once it lands. The window
    // starts below the headline, so no line of it is cut in half.
    { t: m.answer + 0.2, dur: 1.3, z: 1.75, x: 0.5, y: 0.715 },
    // The live tape, once the page has arrived: the tape and the first stats, below the intro.
    { t: m.tape - 0.1, dur: 1.1, z: 1, x: 0.5, y: 0.5 },
    { t: m.taped + 0.3, dur: 1.3, z: 1.5, x: 0.42, y: 0.665 },
    // Setup: out for the trip to the trader page, then in on the form.
    { t: m.setup, dur: 1, z: 1, x: 0.5, y: 0.5 },
    { t: m.form + 0.2, dur: 1.3, z: 1.4, x: 0.69, y: 0.47 },
    // The follow: the headline and the checklist.
    { t: m.bot, dur: 0, z: 1, x: 0.5, y: 0.5 },
    { t: m.bot + 1.4, dur: 1.4, z: 1.18, x: 0.42, y: 0.575 },
  ];
}

function camera(seconds: number, list: Move[]) {
  let z = 1;
  let x = 0.5;
  let y = 0.5;
  for (const move of list) {
    const t = move.dur ? interpolate(seconds, [move.t, move.t + move.dur], [0, 1], { ...clamp, easing: easeInOut }) : seconds >= move.t ? 1 : 0;
    z += (move.z - z) * t;
    x += (move.x - x) * t;
    y += (move.y - y) * t;
  }
  const half = 0.5 / z;
  x = Math.min(1 - half, Math.max(half, x));
  y = Math.min(1 - half, Math.max(half, y));
  return `scale(${z}) translate(${(0.5 - x) * 100}%, ${(0.5 - y) * 100}%)`;
}

const STEPS: [string, string][] = [
  ["hero", "Pick"],
  ["flip", "Flip"],
  ["tape", "Live tape"],
  ["setup", "Set up"],
  ["bot", "Bot key"],
];

/** The stops on the walk through the app, in the margin beside the window. */
function Rail({ active }: { active: string }) {
  return (
    <div style={{ position: "absolute", left: 40, top: 30, height: 850, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 }}>
      {STEPS.map(([id, name]) => (
        <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, opacity: id === active ? 1 : 0.4 }}>
          <span style={{ width: 18, height: 4, borderRadius: 2, background: id === active ? grad(tail) : ink.inkSoft }} />
          <Label color={ink.ink} size={15} style={{ letterSpacing: 1.6, whiteSpace: "nowrap" }}>
            {name}
          </Label>
        </div>
      ))}
    </div>
  );
}

/** One plain fact about what is on screen, in the right margin. */
function Note({ children, at = 20 }: { children: ReactNode; at?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 16], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", right: 34, top: 360, width: 176, opacity: o, transform: `translateY(${(1 - o) * 12}px)`, fontFamily: fonts.body, fontSize: 19, lineHeight: 1.4, color: ink.inkSoft }}>
      {children}
    </div>
  );
}

function Filmed({ plan, shot, children }: { plan: Plan; shot: Shot; children?: ReactNode }) {
  const frame = useCurrentFrame();
  const m = plan.capture.marks;
  const start = m[shot.id];
  return (
    <AbsoluteFill>
      <Ground>
        <Blob x={50} y={46} size={1500} alpha={0.16} />
      </Ground>
      <Rail active={shot.id} />
      <BrowserFrame>
        <div style={{ position: "absolute", inset: 0, transform: camera(start + frame / FPS, moves(m)) }}>
          <OffthreadVideo src={staticFile("capture/site.mp4")} trimBefore={Math.round(start * FPS)} muted style={{ display: "block", width: "100%", height: "100%" }} />
        </div>
      </BrowserFrame>
      {children}
    </AbsoluteFill>
  );
}

/** Frame of the scene at which the footage reaches a capture mark. */
const atMark = (plan: Plan, shot: Shot, mark: string) => (plan.capture.marks[mark] - plan.capture.marks[shot.id]) * FPS;

export function Hero({ shot, plan }: SceneProps) {
  return (
    <Filmed plan={plan} shot={shot}>
      <Note at={atMark(plan, shot, "answer")}>Every chip is a real account from this week, written from live stats.</Note>
      <Sfx name="tick" at={atMark(plan, shot, "tapped") - 2} volume={0.35} />
    </Filmed>
  );
}

export function Flip({ shot, plan }: SceneProps) {
  return (
    <Filmed plan={plan} shot={shot}>
      <Note at={atMark(plan, shot, "fadeAnswer")}>Fade shows their week from the other side, at 1x.</Note>
      <Sfx name="tick" at={atMark(plan, shot, "flipped") - 2} volume={0.35} />
      <Sfx name="tick" at={atMark(plan, shot, "faded") - 2} volume={0.35} />
    </Filmed>
  );
}

export function Tape({ shot, plan }: SceneProps) {
  return (
    <Filmed plan={plan} shot={shot}>
      <Note at={atMark(plan, shot, "taped") + 10}>
        One <span style={{ fontFamily: fonts.mono, fontSize: 16 }}>somnia_watch</span> subscription on MarginBank PositionUpdated.
      </Note>
    </Filmed>
  );
}

export function Setup({ shot, plan }: SceneProps) {
  return (
    <Filmed plan={plan} shot={shot}>
      <Note at={atMark(plan, shot, "form") + 20}>Filled in for the film, not submitted.</Note>
      <Sfx name="tick" at={atMark(plan, shot, "trader") - 26} volume={0.3} />
    </Filmed>
  );
}

export function Bot({ shot, plan }: SceneProps) {
  return (
    <Filmed plan={plan} shot={shot}>
      <Note at={60}>Gas, link and margin are read from the chain every few seconds.</Note>
    </Filmed>
  );
}
