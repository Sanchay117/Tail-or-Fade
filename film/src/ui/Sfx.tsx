import { Audio, Sequence, staticFile } from "remotion";

export type SfxName = "press" | "thud" | "whoosh" | "tick" | "chime";

/** A one-shot sound effect from public/sfx (made by scripts/sfx.ts) at a scene frame. */
export function Sfx({ name, at, volume = 0.5 }: { name: SfxName; at: number; volume?: number }) {
  return (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={90} name={`sfx ${name}`} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}
