import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { fade as warm, fonts, grad, ink, tail as cool } from "../theme.ts";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const spring = Easing.bezier(0.34, 1.4, 0.64, 1);

/** 0 to 1 over `dur` frames starting at `at`, eased. */
export function ramp(frame: number, at: number, dur = 18, easing = easeOut) {
  return interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing });
}

/** Mixes two hex colours. */
export function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

/** The palette part way between Tail (0) and Fade (1). */
export const palette = (t: number) => cool.map((c, i) => mix(c, warm[i], t));

/**
 * The app's living blob, drawn with blurred gradients instead of WebGL so it renders the same on
 * every machine. `warmth` eases it from the Tail palette to the Fade one.
 */
export function Blob({ x = 50, y = 50, size = 900, warmth = 0, alpha = 1, style }: { x?: number; y?: number; size?: number; warmth?: number; alpha?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const c = palette(warmth);
  const t = frame / 30;
  const lobes = [
    { dx: Math.sin(t * 0.5) * 0.12, dy: Math.cos(t * 0.4) * 0.1, r: 0.5, col: c[0] },
    { dx: Math.cos(t * 0.37 + 1) * 0.16, dy: Math.sin(t * 0.45 + 2) * 0.12, r: 0.42, col: c[1] },
    { dx: Math.sin(t * 0.31 + 3) * 0.14, dy: Math.cos(t * 0.52 + 1) * 0.14, r: 0.38, col: c[2] },
    { dx: Math.cos(t * 0.43 + 4) * 0.18, dy: Math.sin(t * 0.36) * 0.1, r: 0.26, col: c[3] },
  ];
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, transform: "translate(-50%, -50%)", filter: `blur(${size * 0.07}px)`, opacity: alpha, pointerEvents: "none", ...style }}>
      {lobes.map((l, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${(0.5 + l.dx - l.r / 2) * 100}%`,
            top: `${(0.5 + l.dy - l.r / 2) * 100}%`,
            width: `${l.r * 100}%`,
            height: `${l.r * 100}%`,
            borderRadius: "50%",
            background: l.col,
            mixBlendMode: i ? "normal" : "normal",
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

/** The app's ground: cool mist with a faint grain. */
export function Ground({ children, dark = false, style }: { children?: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return (
    <AbsoluteFill
      style={{
        background: dark ? `radial-gradient(ellipse at 50% 40%, #16303d, ${ink.ink} 70%)` : `radial-gradient(ellipse at 50% 35%, ${ink.white}, ${ink.mist} 60%, ${ink.mistDeep})`,
        color: dark ? ink.mist : ink.ink,
        fontFamily: fonts.body,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** Gradient-filled display text, as the app's headline accent. */
export function GradText({ children, warmth = 0, style }: { children: ReactNode; warmth?: number; style?: CSSProperties }) {
  const c = palette(warmth);
  return (
    <span style={{ backgroundImage: grad(c), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", ...style }}>{children}</span>
  );
}

/** A frosted panel, only ever placed over the blob. */
export function Glass({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "rgba(248,251,250,0.62)",
        backdropFilter: "blur(22px) saturate(1.4)",
        border: "1px solid rgba(255,255,255,0.7)",
        boxShadow: "0 30px 60px -30px rgba(13,27,36,0.35)",
        borderRadius: 28,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small uppercase mono label. */
export function Label({ children, color = ink.inkSoft, size = 20, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: size, letterSpacing: size * 0.12, textTransform: "uppercase", color, ...style }}>{children}</div>;
}

/** Centres its children on the frame in a column. */
export function Middle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", ...style }}>{children}</AbsoluteFill>;
}

/** Rises a little and sharpens from a blur, starting from a visible state. */
export function Rise({ at, children, dur = 16, style }: { at: number; children: ReactNode; dur?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, dur);
  if (frame < at) return null;
  return <div style={{ opacity: 0.35 + 0.65 * p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 4}px)`, ...style }}>{children}</div>;
}

export const FRAME = { x: 240, y: 30, w: 1440, h: 810, bar: 40 };

/** A browser window with its page held in the 1440 x 810 area below the toolbar. */
export function BrowserFrame({ children, url = "localhost:5195" }: { children: ReactNode; url?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: FRAME.x,
        top: FRAME.y,
        width: FRAME.w,
        height: FRAME.bar + FRAME.h,
        borderRadius: 16,
        overflow: "hidden",
        background: ink.mist,
        boxShadow: "0 50px 90px -40px rgba(13,27,36,0.55), 0 0 0 1px rgba(13,27,36,0.12)",
      }}
    >
      <div style={{ height: FRAME.bar, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", background: ink.white, borderBottom: `1px solid ${ink.line}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <div style={{ marginLeft: 14, flex: 1, height: 26, borderRadius: 13, background: ink.mist, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", fontFamily: fonts.mono, fontSize: 15, color: ink.inkSoft }}>
          <span>{url}</span>
          <span style={{ color: cool[0] }}>live Somnia Tokyo testnet</span>
        </div>
      </div>
      <div style={{ position: "relative", width: FRAME.w, height: FRAME.h, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
