import type { ComponentType, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { DROP, FPS, OVERLAP, TEASER_FRAMES, type Plan, type Shot } from "./plan.ts";
import { Close } from "./scenes/Close.tsx";
import { Bot, Flip, Hero, Setup, Tape } from "./scenes/Footage.tsx";
import { How } from "./scenes/How.tsx";
import { Loop } from "./scenes/Loop.tsx";
import { Proof } from "./scenes/Proof.tsx";
import { Teaser } from "./scenes/Teaser.tsx";
import { ink } from "./theme.ts";
import { Captions } from "./ui/Captions.tsx";

export interface SceneProps {
  shot: Shot;
  plan: Plan;
}

export interface FilmProps extends Record<string, unknown> {
  captions: boolean;
  music: boolean;
  /** Public repository URL for the closing card; hidden when empty. */
  repo: string;
  /** Live app URL for the closing card; hidden when empty. */
  site: string;
  plan?: Plan;
}

const SCENES: Record<string, { component: ComponentType<SceneProps & { repo: string; site: string }>; quiet?: boolean }> = {
  teaser: { component: Teaser, quiet: true },
  hero: { component: Hero },
  flip: { component: Flip },
  tape: { component: Tape },
  setup: { component: Setup },
  bot: { component: Bot },
  how: { component: How },
  loop: { component: Loop },
  proof: { component: Proof },
  close: { component: Close, quiet: true },
};

/** Fades a scene in over the overlap with the one before it. */
function CrossFade({ children, first }: { children: ReactNode; first: boolean }) {
  const frame = useCurrentFrame();
  const o = first ? 1 : interpolate(frame, [0, OVERLAP], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

export function Film({ captions, music, repo, site, plan }: FilmProps) {
  if (!plan) return null;
  return (
    <AbsoluteFill style={{ background: ink.mist }}>
      {plan.shots.map((shot, i) => {
        const scene = SCENES[shot.id];
        const Scene = scene.component;
        return (
          <Sequence key={shot.id} from={shot.from} durationInFrames={shot.frames} name={shot.id}>
            <CrossFade first={i === 0}>
              <Scene shot={shot} plan={plan} repo={repo} site={site} />
              {captions && !scene.quiet && <Captions shot={shot} />}
            </CrossFade>
          </Sequence>
        );
      })}
      {plan.voices.map((voice) => (
        <Sequence key={voice.id} from={voice.from} durationInFrames={voice.frames} name={`vo ${voice.id}`}>
          <Audio src={staticFile(voice.file)} volume={voice.from < TEASER_FRAMES ? TEASER_VOICE : 1} />
        </Sequence>
      ))}
      {music && <Score plan={plan} />}
    </AbsoluteFill>
  );
}

const fade = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The narrator sits a little forward in the teaser, where the words compete with a full score. */
const TEASER_VOICE = 1.35;
/** One pass of sfx/bed.wav. A looped Audio restarts its volume frame each pass, so passes are laid out by hand. */
const BED = 64 * FPS;
/** The teaser score runs 24 s and rings out under the first demo scene. */
const SCORE = 24 * FPS;

/** The teaser's score, then a quiet bed under the demo. Under a line the score falls away so the words stay on top. */
function Score({ plan }: { plan: Plan }) {
  const lines = plan.voices.filter((v) => v.from < TEASER_FRAMES);
  const hit = (frame: number) => interpolate(frame, [DROP - 2, DROP, DROP + 4, DROP + 14], [0, 1, 1, 0], fade);
  const ducked = (frame: number) => {
    const under = lines.reduce((most, v) => Math.max(most, interpolate(frame, [v.from - 5, v.from + 1, v.from + v.frames - 3, v.from + v.frames + 5], [0, 1, 1, 0], fade)), 0);
    return 1 - 0.62 * under * (1 - hit(frame));
  };
  const level = (frame: number) => interpolate(frame, [0, 300, 470, 480, 560, 600, 720], [0.45, 0.55, 0.7, 0.9, 0.85, 0.55, 0], fade);
  const bed = (frame: number) => {
    const left = plan.total - frame;
    return interpolate(frame - TEASER_FRAMES, [0, 120], [0, 0.13], fade) * interpolate(left, [0, 100], [0, 1], fade);
  };
  const passes = Math.ceil((plan.total - TEASER_FRAMES) / BED);
  return (
    <>
      <Sequence from={0} durationInFrames={SCORE} name="score" layout="none">
        <Audio src={staticFile("sfx/teaser.wav")} volume={(f) => level(f) * ducked(f)} />
      </Sequence>
      {Array.from({ length: passes }, (_, pass) => {
        const from = TEASER_FRAMES + pass * BED;
        return (
          <Sequence key={pass} from={from} durationInFrames={BED} name={`bed ${pass + 1}`} layout="none">
            <Audio src={staticFile("sfx/bed.wav")} volume={(f) => bed(from + f)} />
          </Sequence>
        );
      })}
    </>
  );
}
