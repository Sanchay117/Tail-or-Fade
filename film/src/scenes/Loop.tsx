import { interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fade, fonts, ink, tail } from "../theme.ts";
import { Blob, clamp, Glass, GradText, Ground, Label, ramp, spring } from "../ui/kit.tsx";
import { Sfx } from "../ui/Sfx.tsx";

const N = 50;
const LEADER = { x: 330, y: 470 };

/** Followers on a loose arc to the right of the leader. */
const SPOTS = Array.from({ length: N }, (_, i) => {
  const col = i % 10;
  const rowI = Math.floor(i / 10);
  return { x: 760 + col * 66 + (rowI % 2) * 33, y: 300 + rowI * 86 };
});

export function Loop({ shot }: SceneProps) {
  const frame = useCurrentFrame();
  const start = cue(shot, "every");
  const fifty = cue(shot, "fifty");
  const share = cue(shot, "share");
  const shareIn = ramp(frame, share - 6, 20, spring);
  const sent = Math.round(interpolate(frame, [fifty - 6, fifty + 40], [0, N], clamp));
  const dim = 1 - 0.55 * shareIn;
  return (
    <Ground>
      <Blob x={70} y={52} size={900} warmth={0} alpha={0.28 * (1 - shareIn) + 0.55 * shareIn} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 110, textAlign: "center", fontFamily: fonts.display, fontSize: 66, letterSpacing: -2, color: ink.ink, opacity: ramp(frame, 0, 16) }}>
        One trade in, <GradText>{sent || 1} {sent > 1 ? "orders" : "order"}</GradText> out
      </div>
      <div style={{ opacity: dim }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {SPOTS.map((s, i) => {
            const p = ramp(frame, fifty - 6 + i * 0.8, 10);
            return <line key={i} x1={LEADER.x + 50} y1={LEADER.y} x2={LEADER.x + 50 + (s.x - LEADER.x - 50) * p} y2={LEADER.y + (s.y - LEADER.y) * p} stroke={tail[1]} strokeOpacity={0.28} strokeWidth={2} />;
          })}
        </svg>
        <div style={{ position: "absolute", left: LEADER.x - 50, top: LEADER.y - 50, width: 100, height: 100, borderRadius: 50, background: ink.ink, opacity: ramp(frame, start - 4, 12) }} />
        <Label size={16} style={{ position: "absolute", left: LEADER.x - 70, top: LEADER.y + 66, width: 140, textAlign: "center" }}>
          leader
        </Label>
        {SPOTS.map((s, i) => {
          const on = i < sent;
          const p = ramp(frame, start + 4 + i * 0.4, 10);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: s.x - 17,
                top: s.y - 17,
                width: 34,
                height: 34,
                borderRadius: 17,
                background: on ? (i % 3 === 0 ? fade[0] : tail[i % 3]) : "#c5d3d0",
                opacity: p,
                transform: `scale(${on ? 1.12 : 0.8 + 0.2 * p})`,
              }}
            />
          );
        })}
        <Label size={16} style={{ position: "absolute", left: 760, top: 300 + 5 * 86 - 20 }}>
          50 followers, tailing and fading
        </Label>
      </div>
      <div style={{ position: "absolute", left: 960 - 380, top: 330, width: 760, opacity: shareIn, transform: `translateY(${(1 - shareIn) * 40}px)` }}>
        <Glass style={{ padding: "30px 34px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: ink.ink }} />
            <div>
              <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 24 }}>A Tail or Fade user</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, color: ink.inkSoft }}>post from the share button</div>
            </div>
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 30, lineHeight: 1.4, color: ink.ink }}>
            I'm fading 0x0C56…44f2 on <span style={{ color: tail[2] }}>@DreamDEXSomnia</span> perps. They're −$7,871 this week and right 0% of the time. Every trade they make, I take the other side.
          </div>
        </Glass>
      </div>
      <Sfx name="whoosh" at={fifty - 8} volume={0.16} />
      <Sfx name="chime" at={share} volume={0.22} />
    </Ground>
  );
}
