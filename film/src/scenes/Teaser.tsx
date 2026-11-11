import { AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { DROP, said } from "../plan.ts";
import { TRADERS } from "../script.ts";
import { fade, fonts, grad, ink, tail } from "../theme.ts";
import { Blob, clamp, easeInOut, easeOut, GradText, Ground, Label, Middle, mix, ramp, spring } from "../ui/kit.tsx";

// The whole teaser is one timeline on the score's grid: 120 BPM at 30 fps is a beat every 15 frames.
//   0-120     two sides: one line splits into a rise and a fall
//   120-288   the count: 1,074 traders, 733 of them turning red
//   288-378   copy-trading follows the winners
//   378-465   nobody bets against the rest
//   465-480   half a bar of nothing
//   480-600   the drop: Tail or Fade

const COLS = 48;
const ROWS = 23;
const GAP = 30;

/** A fixed shuffle, so the losing dots are scattered the same way on every render. */
const ORDER = (() => {
  const idx = Array.from({ length: TRADERS.total }, (_, i) => i);
  let s = 0x5eed;
  for (let i = idx.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const rank = new Array<number>(idx.length);
  idx.forEach((v, k) => (rank[v] = k));
  return rank;
})();

function Sides({ plan }: SceneProps) {
  const frame = useCurrentFrame();
  const draw = ramp(frame, 6, 40, easeInOut);
  const part = ramp(frame, said(plan, "t-sides", "two") - 6, 30, easeOut);
  const W = 1200;
  const H = 520;
  const mid = H / 2;
  const x0 = 0;
  const xs = W * 0.42;
  const path = (dir: 1 | -1) => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const x = x0 + (W * i) / 60;
      const wob = Math.sin(i * 0.9) * 10 + Math.sin(i * 0.37) * 14;
      const after = Math.max(0, x - xs) / (W - xs);
      const y = mid + wob * (1 - after * 0.6) - dir * part * Math.pow(after, 1.4) * 210;
      pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const textIn = ramp(frame, 18, 20);
  return (
    <Ground>
      <Blob x={70} y={55} size={760} warmth={interpolate(frame, [70, 110], [0, 0.5], clamp)} alpha={0.35 * part} />
      <Middle style={{ justifyContent: "flex-start", paddingTop: 120 }}>
        <div style={{ opacity: textIn, transform: `translateY(${(1 - textIn) * 16}px)`, fontFamily: fonts.display, fontWeight: 400, fontSize: 84, letterSpacing: -2.5, color: ink.ink }}>
          Every trade has <GradText warmth={part * 0.5}>two sides.</GradText>
        </div>
      </Middle>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: (1920 - W) / 2, top: 380 }}>
        <defs>
          {/* One ink line until it splits; the colours arrive with the split. */}
          <linearGradient id="up" x1="0" x2="1">
            <stop offset="0" stopColor={ink.ink} />
            <stop offset="0.42" stopColor={ink.ink} />
            <stop offset="0.6" stopColor={mix(ink.ink, tail[0], part)} />
            <stop offset="1" stopColor={mix(ink.ink, tail[2], part)} />
          </linearGradient>
          <linearGradient id="down" x1="0" x2="1">
            <stop offset="0" stopColor={ink.ink} />
            <stop offset="0.42" stopColor={ink.ink} />
            <stop offset="0.6" stopColor={mix(ink.ink, fade[2], part)} />
            <stop offset="1" stopColor={mix(ink.ink, fade[1], part)} />
          </linearGradient>
        </defs>
        {[1, -1].map((d) => (
          <path key={d} d={path(d as 1 | -1)} fill="none" stroke={`url(#${d === 1 ? "up" : "down"})`} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: 1460, top: 360, opacity: part }}>
        <Label color={tail[0]} size={26}>Long</Label>
      </div>
      <div style={{ position: "absolute", left: 1460, top: 860, opacity: part }}>
        <Label color={fade[1]} size={26}>Short</Label>
      </div>
    </Ground>
  );
}

function Count({ plan }: SceneProps) {
  const frame = useCurrentFrame();
  const from = 120;
  const grid = ramp(frame, from, 24);
  const turnAt = said(plan, "t-down", "733") - 4;
  const turned = interpolate(frame, [turnAt, turnAt + 54], [0, TRADERS.down], { ...clamp, easing: Easing.out(Easing.cubic) });
  // After the count: the winners light up for "follow the winners", then the losers for "bet against".
  const winners = ramp(frame, 288, 14);
  const losers = ramp(frame, 378, 14);
  const collapse = ramp(frame, 462, 16, Easing.in(Easing.cubic));
  const w = COLS * GAP;
  const h = ROWS * GAP;
  const shown = Math.round(turned);
  const line = frame < 288 ? 0 : frame < 378 ? 1 : 2;
  const lines = [
    <>
      <span style={{ fontFamily: fonts.display, fontSize: 132, letterSpacing: -4, fontWeight: 500 }}>
        <GradText warmth={1}>{shown}</GradText>
      </span>
      <span style={{ fontFamily: fonts.display, fontSize: 64, letterSpacing: -1.5, color: ink.inkSoft }}> of {TRADERS.total.toLocaleString("en-US")} traders are down this week.</span>
    </>,
    <span style={{ fontFamily: fonts.display, fontSize: 76, letterSpacing: -2 }}>
      Copy-trading follows the <GradText>winners.</GradText>
    </span>,
    <span style={{ fontFamily: fonts.display, fontSize: 76, letterSpacing: -2 }}>
      Nobody lets you bet against <GradText warmth={1}>the rest.</GradText>
    </span>,
  ];
  return (
    <Ground>
      <Blob x={50} y={58} size={1300} warmth={line === 1 ? 0 : 1} alpha={0.22 * grid * (1 - collapse)} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center", color: ink.ink, opacity: grid * (1 - collapse) }}>{lines[line]}</div>
      <div style={{ position: "absolute", left: (1920 - w) / 2, top: 330, width: w, height: h, transform: `scale(${1 - collapse * 0.9})`, opacity: 1 - collapse }}>
        {Array.from({ length: TRADERS.total }, (_, i) => {
          const down = ORDER[i] < TRADERS.down;
          const isTurned = ORDER[i] < shown;
          const appear = ramp(frame, from + ((i % COLS) + Math.floor(i / COLS)) * 0.35, 10);
          let color = mix("#b9c9c6", "#b9c9c6", 0);
          let alpha = 0.9;
          if (isTurned) color = [fade[0], fade[1], fade[2]][ORDER[i] % 3];
          if (line === 1) {
            if (down) alpha = 0.18;
            else color = [tail[0], tail[1], tail[2]][ORDER[i] % 3];
          }
          if (line === 2 && !down) alpha = 0.18;
          const glow = line === 1 ? winners : line === 2 ? losers : 1;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: (i % COLS) * GAP + 8,
                top: Math.floor(i / COLS) * GAP + 8,
                width: 14,
                height: 14,
                borderRadius: 7,
                background: color,
                opacity: appear * (line ? alpha * glow + (1 - glow) * 0.9 : alpha),
                transform: `scale(${0.4 + 0.6 * appear})`,
              }}
            />
          );
        })}
      </div>
    </Ground>
  );
}

function Title() {
  const frame = useCurrentFrame();
  const t = frame - DROP;
  const slam = interpolate(t, [0, 4], [1.5, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const settle = interpolate(t, [4, 7, 12], [1, 0.97, 1], clamp);
  const flash = interpolate(t, [0, 2, 10], [0, 0.85, 0], clamp);
  const sub = ramp(frame, DROP + 36, 18, spring);
  const warmth = 0.5 + 0.5 * Math.sin((t / 60) * Math.PI);
  return (
    <Ground>
      <Blob x={50} y={52} size={1100} warmth={warmth} alpha={0.75} />
      <Middle>
        <div style={{ fontFamily: fonts.display, fontWeight: 400, fontSize: 210, letterSpacing: -8, lineHeight: 1, transform: `scale(${t < 4 ? slam : settle})`, color: ink.ink }}>
          <GradText>Tail</GradText> or <GradText warmth={1}>Fade</GradText>
        </div>
        <div style={{ marginTop: 38, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)`, fontFamily: fonts.body, fontWeight: 500, fontSize: 46, color: ink.ink }}>
          Back any dreamDEX trader, or bet against them.
        </div>
      </Middle>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </Ground>
  );
}

export function Teaser(props: SceneProps) {
  const frame = useCurrentFrame();
  const gap = frame >= 465 && frame < DROP;
  return (
    <AbsoluteFill style={{ background: ink.mist }}>
      {frame < 126 && <Sides {...props} />}
      {frame >= 120 && frame < 465 && (
        <AbsoluteFill style={{ opacity: interpolate(frame, [120, 128], [0, 1], clamp) }}>
          <Count {...props} />
        </AbsoluteFill>
      )}
      {gap && <Ground />}
      {frame >= DROP && <Title />}
      <Sequence from={DROP - 2} durationInFrames={60} layout="none">
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.25} />
      </Sequence>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, textAlign: "center", opacity: frame < DROP ? 0.6 : 0 }}>
        <Label size={18} style={{ background: grad(tail), WebkitBackgroundClip: "text", color: "transparent" }}>
          live data from the dreamDEX perps testnet
        </Label>
      </div>
    </AbsoluteFill>
  );
}
