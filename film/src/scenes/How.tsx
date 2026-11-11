import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { fonts, grad, ink, tail, fade } from "../theme.ts";
import { Blob, Glass, GradText, Ground, Label, ramp, spring } from "../ui/kit.tsx";
import { Sfx } from "../ui/Sfx.tsx";

const Y = 300;
const W = 300;
const H = 250;
const XS = [70, 440, 810, 1180, 1550];

function Node({ i, at, title, children, glass = false }: { i: number; at: number; title: string; children: ReactNode; glass?: boolean }) {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, 18, spring);
  if (frame < at - 2) return null;
  const body = (
    <div style={{ padding: "24px 26px", height: H, boxSizing: "border-box" }}>
      <Label size={15} style={{ marginBottom: 14 }}>{title}</Label>
      <div style={{ fontFamily: fonts.body, fontSize: 25, lineHeight: 1.35, color: ink.ink }}>{children}</div>
    </div>
  );
  return (
    <div style={{ position: "absolute", left: XS[i], top: Y, width: W, opacity: 0.35 + 0.65 * p, transform: `translateY(${(1 - p) * 26}px) scale(${0.94 + 0.06 * p})` }}>
      {glass ? <Glass>{body}</Glass> : <div style={{ background: ink.white, borderRadius: 28, border: `1px solid ${ink.line}`, boxShadow: "0 24px 50px -30px rgba(13,27,36,.35)" }}>{body}</div>}
    </div>
  );
}

function Arrow({ i, at }: { i: number; at: number }) {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, 14);
  const x = XS[i] + W + 8;
  const len = XS[i + 1] - XS[i] - W - 16;
  return (
    <div style={{ position: "absolute", left: x, top: Y + H / 2 - 2, width: len * p, height: 4, borderRadius: 2, background: grad(tail, 90) }}>
      {p > 0.95 && <div style={{ position: "absolute", right: -2, top: -7, width: 0, height: 0, borderLeft: `12px solid ${tail[2]}`, borderTop: "9px solid transparent", borderBottom: "9px solid transparent" }} />}
    </div>
  );
}

const mono = { fontFamily: fonts.mono, fontSize: 20 } as const;

export function How({ shot }: SceneProps) {
  const frame = useCurrentFrame();
  const a = cue(shot, "when");
  const b = cue(shot, "reactivity");
  const c = cue(shot, "work");
  const d = cue(shot, "flip");
  const e = cue(shot, "cap");
  const f = cue(shot, "send");
  const g = cue(shot, "copy");
  const badge = ramp(frame, g, 18, spring);
  const row = (at: number, children: ReactNode) => <div style={{ opacity: 0.25 + 0.75 * ramp(frame, at, 12) }}>{children}</div>;
  return (
    <Ground>
      <Blob x={50.5} y={40} size={720} alpha={0.55 * ramp(frame, b - 6, 20)} warmth={ramp(frame, d, 20) * 0.6 * (1 - ramp(frame, e, 20))} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", fontFamily: fonts.display, fontSize: 68, letterSpacing: -2, color: ink.ink, opacity: ramp(frame, 0, 16) }}>
        One trade, <GradText>mirrored</GradText>
      </div>
      <Node i={0} at={a} title="Leader">
        Changes a position on dreamDEX perps.
        <div style={{ ...mono, marginTop: 10, color: ink.inkSoft }}>long 2 ETH</div>
      </Node>
      <Arrow i={0} at={a + 14} />
      <Node i={1} at={a + 18} title="MarginBank">
        Emits the new size.
        <div style={{ ...mono, fontSize: 17, marginTop: 10, color: ink.inkSoft }}>PositionUpdated(account, pool, newSize)</div>
      </Node>
      <Arrow i={1} at={b - 10} />
      <Node i={2} at={b - 4} title="Somnia Reactivity" glass>
        Pushed to us over one WebSocket as the block lands. No polling.
      </Node>
      <Arrow i={2} at={c - 10} />
      <Node i={3} at={c - 4} title="Mirror engine">
        {row(c, <>their leverage × your equity × your multiplier</>)}
        {row(d, <span style={{ color: fade[1] }}>× −1 if you fade</span>)}
        {row(e, <>capped per market</>)}
      </Node>
      <Arrow i={3} at={f - 10} />
      <Node i={4} at={f - 4} title="Your account">
        One order from your bot key.
        <div style={{ ...mono, marginTop: 10, color: ink.inkSoft }}>placeOrderFor</div>
      </Node>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 700,
          display: "flex",
          justifyContent: "center",
          opacity: badge,
          transform: `translateY(${(1 - badge) * 20}px)`,
        }}
      >
        <div style={{ padding: "18px 34px", borderRadius: 999, background: ink.ink, color: ink.mist, fontFamily: fonts.body, fontWeight: 500, fontSize: 30 }}>
          Copies <GradText>positions</GradText>, not orders. A missed event heals on the next one.
        </div>
      </div>
      <Sfx name="whoosh" at={b - 6} volume={0.18} />
      <Sfx name="tick" at={f} volume={0.3} />
    </Ground>
  );
}
