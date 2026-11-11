import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ago, short, txLink, usd, type Mirror, type Mode } from "./api";
import { FADE, mountBlob, TAIL, type BlobHandle } from "./blob";

/* ---------- a tiny pushState router ---------- */

export function navigate(to: string) {
  const url = new URL(to, location.origin);
  history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (url.hash) requestAnimationFrame(() => document.querySelector(url.hash)?.scrollIntoView());
  else window.scrollTo(0, 0);
}

export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search });
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return loc;
}

export function A({ href, children, ...rest }: { href: string; children: ReactNode; className?: string; "aria-current"?: "page" }) {
  const external = /^https?:/.test(href);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (external || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(href, location.origin);
    if (url.pathname === location.pathname && url.hash) return; // same-page anchor: let the browser scroll
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...rest}>
      {children}
    </a>
  );
}

/* ---------- the blob ---------- */

export function Blob({ mode }: { mode: Mode }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<BlobHandle | undefined>(undefined);
  useEffect(() => {
    handle.current = mountBlob(host.current!, mode === "fade" ? FADE : TAIL);
    return () => handle.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => handle.current?.setPalette(mode === "fade" ? FADE : TAIL), [mode]);
  return <div className="blob" ref={host} aria-hidden="true" />;
}

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="switch" role="group" aria-label="Tail or fade">
      <span className="knob" aria-hidden="true" />
      <button type="button" aria-pressed={mode === "tail"} onClick={() => onChange("tail")}>
        Tail
      </button>
      <button type="button" aria-pressed={mode === "fade"} onClick={() => onChange("fade")}>
        Fade
      </button>
    </div>
  );
}

/** Cumulative realized PnL as one line, flipped for a fade: fading earns the mirror image. */
export function Spark({ points, mode = "tail", height }: { points: number[]; mode?: Mode; height?: number }) {
  const id = useId().replace(/:/g, "");
  const pts = mode === "fade" ? points.map((p) => -p) : points;
  if (pts.length < 2) return <svg className="spark" style={height ? { height } : undefined} aria-hidden="true" />;
  const min = Math.min(0, ...pts);
  const max = Math.max(0, ...pts);
  const span = max - min || 1;
  const y = (v: number) => 37 - ((v - min) / span) * 34;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 100).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  return (
    <svg className="spark" style={height ? { height } : undefined} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" stopColor="var(--g1)" />
          <stop offset=".6" stopColor="var(--g2)" />
          <stop offset="1" stopColor="var(--g3)" />
        </linearGradient>
      </defs>
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeOpacity=".18" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copyrow">
      <code>{text}</code>
      <button
        type="button"
        className="btn quiet small"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          })
        }
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function MirrorLog({ mirrors, empty }: { mirrors: Mirror[]; empty: string }) {
  if (!mirrors.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="log">
      {mirrors.map((m) => (
        <li key={m.id}>
          <span className="l1">
            {m.mode === "fade" ? "Faded" : "Tailed"} {short(m.leader)} · {m.symbol}
            {m.side && m.quantity ? ` · ${m.side === "buy" ? "bought" : "sold"} ${trim(m.quantity)}` : ""}
          </span>
          <span className={`st ${m.status}`}>{m.status === "skipped" ? "skipped" : m.status}</span>
          <span className="l2">
            {ago(m.at / 1000)}
            {m.notionalUsd ? ` · ${usd(m.notionalUsd)}` : ""}
            {typeof m.blocksBehind === "number" ? ` · ${m.blocksBehind} blocks behind` : ""}
            {m.reason ? ` · ${m.reason}` : ""}
            {m.txHash && (
              <>
                {" · "}
                <a href={txLink(m.txHash)} target="_blank" rel="noreferrer" className="mono">
                  {m.txHash.slice(0, 10)}…
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const trim = (q: string) => {
  const n = Number(q);
  return n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(2);
};

export function Topbar({ path }: { path: string }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <A href="/" className="brand">
          <img src="/mark.svg" alt="" />
          Tail or Fade
        </A>
        <nav aria-label="Main">
          <A href="/#live" className="hide-sm">
            Live
          </A>
          <A href="/#traders" className="hide-sm">
            Traders
          </A>
          <A href="/me" {...(path === "/me" ? { "aria-current": "page" as const } : {})}>
            My follows
          </A>
        </nav>
        <span className="netpill">Testnet</span>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap cols">
        <div>
          <p>
            <b>Tail or Fade</b> runs on <A href="https://app.testnet.dreamdex.io">dreamDEX perps</A>, Somnia Tokyo testnet (chain 50383). Testnet money
            only, not financial advice.
          </p>
          <p>
            Trader stats come from the dreamDEX markets indexer. Live trades come from Somnia off-chain Reactivity on MarginBank{" "}
            <span className="mono">PositionUpdated</span>. Orders go through dreamDEX's Link a Bot operator permissions.
          </p>
        </div>
        <p>
          Built for the <A href="https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail">dreamDEX Perps Builder Bounty</A>.
        </p>
      </div>
    </footer>
  );
}
