import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue } from "../plan.ts";
import { PROOF } from "../script.ts";
import { fonts, ink } from "../theme.ts";
import { GradText, Ground, Label, ramp, spring } from "../ui/kit.tsx";
import { Sfx } from "../ui/Sfx.tsx";

function Row({ at, big, children, warm = false }: { at: number; big: string; children: ReactNode; warm?: boolean }) {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, 16, spring);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", alignItems: "baseline", gap: 30, padding: "22px 0", borderTop: `1px solid ${ink.line}`, opacity: 0.2 + 0.8 * p, transform: `translateX(${(1 - p) * 24}px)` }}>
      <div style={{ fontFamily: fonts.display, fontSize: 62, letterSpacing: -2, lineHeight: 1 }}>
        <GradText warmth={warm ? 1 : 0}>{big}</GradText>
      </div>
      <div style={{ fontFamily: fonts.body, fontSize: 30, lineHeight: 1.35, color: ink.ink }}>{children}</div>
    </div>
  );
}

export function Proof({ shot }: SceneProps) {
  const frame = useCurrentFrame();
  const rows = [cue(shot, "thousands"), cue(shot, "bot"), cue(shot, "six"), cue(shot, "when")];
  return (
    <Ground>
      <div style={{ position: "absolute", left: 300, right: 300, top: 120 }}>
        <Label size={20} style={{ opacity: ramp(frame, 0, 14) }}>Somnia Tokyo testnet, checked on chain</Label>
        <div style={{ fontFamily: fonts.display, fontSize: 72, letterSpacing: -2.4, margin: "16px 0 34px", opacity: ramp(frame, 4, 16) }}>
          What is <GradText>already real</GradText>
        </div>
        <Row at={rows[0] - 4} big={PROOF.events}>position changes received through Somnia Reactivity</Row>
        <Row at={rows[1] - 4} big={PROOF.linkTx}>
          bot linked as an operator on dreamDEX's registry, <span style={{ fontFamily: fonts.mono, fontSize: 24 }}>setOperatorApprovalGlobal</span>
        </Row>
        <Row at={rows[2] - 4} big="6" warm>
          bug reports for the dreamDEX team: voucher claims, Link a Bot, docs and the SDK
        </Row>
        <Row at={rows[3] - 4} big="1 worker">
          the same code points at mainnet when dreamDEX perps launch there
        </Row>
      </div>
      {rows.map((r, i) => (
        <Sfx key={i} name="tick" at={r - 4} volume={0.25} />
      ))}
    </Ground>
  );
}
