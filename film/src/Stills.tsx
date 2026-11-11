import { AbsoluteFill } from "remotion";
import { fade, fonts, ink, tail } from "./theme.ts";
import { Blob, GradText, Label } from "./ui/kit.tsx";

/** The app's mark (web/public/mark.svg): a rise and a fall crossing on ink. */
export function Mark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="mk-t" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={tail[0]} />
          <stop offset="1" stopColor={tail[2]} />
        </linearGradient>
        <linearGradient id="mk-f" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={fade[2]} />
          <stop offset="1" stopColor={fade[1]} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={ink.ink} />
      <path d="M12 42 L24 30 L32 36 L52 16" fill="none" stroke="url(#mk-t)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 22 L24 34 L32 28 L52 48" fill="none" stroke="url(#mk-f)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
    </svg>
  );
}

/** Title and promise, large enough to read as a small thumbnail. */
export function Thumbnail() {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, ${ink.white}, ${ink.mist} 60%, #dfe9e7)`, overflow: "hidden", fontFamily: fonts.body, color: ink.ink }}>
      <Blob x={30} y={62} size={1000} warmth={0} alpha={0.75} />
      <Blob x={74} y={58} size={1000} warmth={1} alpha={0.75} />
      <div style={{ position: "absolute", left: 120, top: 110, display: "flex", alignItems: "center", gap: 24 }}>
        <Mark size={96} />
        <Label size={30} color={ink.ink}>dreamDEX perps · Somnia</Label>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center", fontFamily: fonts.display, fontWeight: 500, fontSize: 250, letterSpacing: -10, lineHeight: 1 }}>
        <GradText>Tail</GradText> or <GradText warmth={1}>Fade</GradText>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontFamily: fonts.display, fontSize: 84, letterSpacing: -2.5, lineHeight: 1.1 }}>
        Back any trader,
        <br />
        or bet against them.
      </div>
    </AbsoluteFill>
  );
}

/** Square mark for submission forms. */
export function Logo() {
  return (
    <AbsoluteFill style={{ background: ink.mist, display: "grid", placeItems: "center" }}>
      <Mark size={640} />
    </AbsoluteFill>
  );
}
