import { useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Blob, GradText, Ground, Middle, ramp, spring } from "../ui/kit.tsx";
import { Mark } from "../Stills.tsx";

export function Close({ shot, site, repo }: SceneProps & { site: string; repo: string }) {
  const frame = useCurrentFrame();
  const mark = ramp(frame, 2, 16, spring);
  const a = ramp(frame, cue(shot, "pick") - 4, 16, spring);
  const b = ramp(frame, cue(shot, "back") - 4, 16, spring);
  const links = ramp(frame, cue(shot, "against") + 20, 18);
  return (
    <Ground>
      <Blob x={50} y={50} size={1100} warmth={0.5 + 0.5 * Math.sin(frame / 40)} alpha={0.7} />
      <Middle>
        <div style={{ opacity: mark, transform: `translateY(${(1 - mark) * 20}px)`, display: "flex", alignItems: "center", gap: 22, marginBottom: 34 }}>
          <Mark size={84} />
          <span style={{ fontFamily: fonts.display, fontSize: 64, letterSpacing: -2 }}>Tail or Fade</span>
        </div>
        <div style={{ fontFamily: fonts.display, fontSize: 112, letterSpacing: -4, lineHeight: 1.05, color: ink.ink }}>
          <div style={{ opacity: a }}>Pick a trader.</div>
          <div style={{ opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>
            <GradText>Back them</GradText> or <GradText warmth={1}>bet against them.</GradText>
          </div>
        </div>
        <div style={{ marginTop: 50, opacity: links, fontFamily: fonts.mono, fontSize: 30, color: ink.ink, display: "flex", flexDirection: "column", gap: 12 }}>
          {site && <span>{site}</span>}
          {repo && <span style={{ color: ink.inkSoft }}>{repo}</span>}
          <span style={{ color: ink.inkSoft, fontSize: 24 }}>built on dreamDEX perps and Somnia Reactivity</span>
        </div>
      </Middle>
    </Ground>
  );
}
