// The film's narration, in order. `text` is what the captions show; `say` (when set) is what the
// voice reads, spelled for the ear. scripts/voice.ts turns each entry into public/vo/<id>.wav and
// records its timing in public/vo/manifest.json.
//
// The teaser's trader count comes from GET /api/leaders. Refresh it, and re-voice t-down, before a
// final render.

export interface Line {
  id: string;
  text: string;
  say?: string;
  /** Seconds of picture before the narrator starts. */
  lead?: number;
  /** Seconds of picture after the narrator stops. */
  tail?: number;
  /** The scene is never shorter than this, voice or not. */
  minSeconds?: number;
  /** Speeds the take up without changing its pitch. */
  tempo?: number;
}

export const TRADERS = { down: 733, total: 1074 };

/** Shown on the proof card. `events` is GET /api/stats eventsSeen, rounded down. */
export const PROOF = { events: "5,000+", linkTx: "0xfe55…c8f8" };

/** The teaser is cut to its music, so these lines sit at fixed places in scenes/Teaser.tsx. */
export const TEASER: Line[] = [
  { id: "t-sides", text: "Every trade on dreamDEX has two sides.", say: "Every trade on dream dex has two sides.", tempo: 1.08 },
  {
    id: "t-down",
    text: `This week, ${TRADERS.down} of ${TRADERS.total.toLocaleString("en-US")} traders are down.`,
    say: "This week, seven hundred and thirty three of one thousand and seventy four traders are down.",
    tempo: 1.1,
  },
  { id: "t-copy", text: "Copy-trading lets you follow the winners.", tempo: 1.08 },
  { id: "t-other", text: "Nobody lets you bet against the rest.", tempo: 1.08 },
  { id: "t-name", text: "Tail or Fade." },
];

/** The demo, one line per scene. The first five are filmed on the real app. */
export const DEMO: Line[] = [
  {
    id: "hero",
    text: "This is the real app, live on dreamDEX's testnet. Tap a trader, or paste any address, and you see their actual week, read from the chain.",
    say: "This is the real app, live on dream dex's testnet. Tap a trader, or paste any address, and you see their actual week, read from the chain.",
    lead: 0.6,
    tail: 0.6,
  },
  {
    id: "flip",
    text: "Flip to Fade, and the same week runs backwards. Their wins become your losses. So fade someone who keeps losing instead.",
    lead: 0.4,
    tail: 1.2,
  },
  {
    id: "tape",
    text: "Underneath, Somnia Reactivity pushes every position change on dreamDEX to the app the moment it lands. No polling.",
    say: "Underneath, Somnia Reactivity pushes every position change on dream dex to the app the moment it lands. No polling.",
    lead: 0.4,
    tail: 0.8,
  },
  {
    id: "setup",
    text: "Choose your side, how hard to follow, and a cap per market. Copies are sized to your equity, not theirs, so a small account can follow a whale.",
    lead: 0.6,
    tail: 0.6,
  },
  {
    id: "bot",
    text: "Each follow gets its own bot key. It can place and cancel orders for you, but it can never withdraw. This checklist reads the chain and turns green by itself.",
    lead: 0.5,
    tail: 0.8,
  },
  {
    id: "how",
    text: "When a leader's position changes, Reactivity pushes it to us as the block lands. We work out where you should be, flip it if you're fading, cap it, and send one order from your bot key. We copy positions, not orders, so a missed event heals on the next one.",
    lead: 0.5,
    tail: 0.8,
  },
  {
    id: "loop",
    text: "Every leader trade becomes one order per follower. Fifty followers, fifty orders. And every trader page has a share button, so good traders bring their own crowd.",
    lead: 0.4,
    tail: 0.8,
  },
  {
    id: "proof",
    text: "It all runs on Somnia's Tokyo testnet today: thousands of position changes through Reactivity, a bot linked on chain, and six bug reports sent back to the dreamDEX team. When perps reach mainnet, the same worker points at it.",
    say: "It all runs on Somnia's Tokyo testnet today: thousands of position changes through Reactivity, a bot linked on chain, and six bug reports sent back to the dream dex team. When perps reach mainnet, the same worker points at it.",
    lead: 0.5,
    tail: 0.8,
  },
  {
    id: "close",
    text: "Pick a trader. Back them, or bet against them.",
    lead: 0.8,
    tail: 2.6,
  },
];

export const SCRIPT: Line[] = [...TEASER, ...DEMO];
