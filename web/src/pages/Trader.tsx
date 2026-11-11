import { useState, type FormEvent } from "react";
import { ago, api, saveFollow, short, txLink, useFetch, usd, type Mode, type TraderProfile } from "../api";
import { A, Blob, ModeSwitch, navigate, Spark } from "../ui";

const MULTS = [0.25, 0.5, 1, 2];
const CAPS = [50, 100, 250, 500];

export function Trader({ address, initialMode }: { address: string; initialMode: Mode }) {
  const [mode, setModeState] = useState<Mode>(initialMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    history.replaceState(null, "", `/t/${address}?mode=${m}`);
  };
  const { data: p, error } = useFetch(() => api.trader(address), [address], 20_000);

  return (
    <main className="page" data-mode={mode}>
      <div className="wrap">
        <A href="/#traders" className="back">
          ← All traders
        </A>
        <div className="pagehead">
          <h1>
            {mode === "tail" ? "Tail" : "Fade"} <span className="mono" style={{ fontSize: ".62em", letterSpacing: 0 }}>{short(address)}</span>
          </h1>
          <p>
            {p
              ? `${usd(p.equityUsd)} in their perps account. ${p.followers.tail} tailing, ${p.followers.fade} fading through Tail or Fade.`
              : error
                ? error
                : "Reading their account and their week…"}
          </p>
        </div>
        <div className="split">
          <Profile p={p} mode={mode} />
          <Setup leader={address} mode={mode} setMode={setMode} p={p} />
        </div>
      </div>
    </main>
  );
}

function Profile({ p, mode }: { p?: TraderProfile; mode: Mode }) {
  if (!p) return <div className="card"><p className="empty">Loading…</p></div>;
  const s = p.stats;
  const pnl = (s?.pnl7d ?? 0) * (mode === "fade" ? -1 : 1);
  return (
    <div className="card">
      <div className="cardhead">
        <h3>{mode === "tail" ? "Their last 7 days" : "Fading their last 7 days"}</h3>
        <span className="faint" style={{ fontSize: 13 }}>{s ? `last trade ${ago(s.lastActive)}` : "no closes this week"}</span>
      </div>
      {s ? (
        <>
          <div className={`${pnl >= 0 ? "gain" : "loss"}`} style={{ fontFamily: "var(--display)", fontSize: "clamp(44px,6vw,60px)", letterSpacing: "-.04em", lineHeight: 1 }}>
            {usd(pnl, true)}
          </div>
          <Spark points={s.spark} mode={mode} height={90} />
          <dl className="kv">
            <div className="stat"><dt>Trades closed</dt><dd>{s.closes}</dd></div>
            <div className="stat"><dt>Won</dt><dd>{Math.round(s.winRate * 100)}%</dd></div>
            <div className="stat"><dt>Best</dt><dd>{s.best > 0 ? usd(s.best, true) : "none"}</dd></div>
            <div className="stat"><dt>Worst</dt><dd>{s.worst < 0 ? usd(s.worst, true) : "none"}</dd></div>
          </dl>
        </>
      ) : (
        <p className="empty">No closed trades in the last 7 days. You can still follow them: we mirror their next move.</p>
      )}

      <p className="subhead">Open right now</p>
      {p.positions.length ? (
        <ul className="rows">
          {p.positions.map((o) => (
            <li key={o.pool}>
              <span>
                <b className={o.side === "long" ? "gain" : "loss"}>{o.side === "long" ? "Long" : "Short"}</b> {o.symbol}
              </span>
              <span className="soft">
                {o.size.toPrecision(4)} {o.base} · {usd(o.notionalUsd)}
                {p.equityUsd > 0 ? ` · ${(o.notionalUsd / p.equityUsd).toFixed(1)}x` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Flat. Nothing open.</p>
      )}
      {mode === "fade" && p.positions.length > 0 && (
        <p className="hint">Fading starts you on the other side of each of these.</p>
      )}

      <p className="subhead">Recent closes</p>
      {p.closes.length ? (
        <ul className="rows">
          {p.closes.slice(0, 12).map((c, i) => (
            <li key={i}>
              <span>
                {c.symbol} <span className="faint">{ago(c.at)}</span>
              </span>
              <a href={txLink(c.txHash)} target="_blank" rel="noreferrer" className={c.pnl >= 0 ? "gain" : "loss"}>
                {usd(c.pnl, true)}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">None this week.</p>
      )}
    </div>
  );
}

function Setup({ leader, mode, setMode, p }: { leader: string; mode: Mode; setMode: (m: Mode) => void; p?: TraderProfile }) {
  const [follower, setFollower] = useState("");
  const [mult, setMult] = useState(1);
  const [cap, setCap] = useState(250);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(undefined);
    const f = follower.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(f)) return setErr("Paste the full 0x address of your dreamDEX account.");
    if (f.toLowerCase() === leader.toLowerCase()) return setErr("That's the trader's own account.");
    setBusy(true);
    try {
      const r = await api.createFollow({ leader, follower: f, mode, multiplier: mult, maxNotional: cap });
      saveFollow({ id: r.follow.id, token: r.manageToken, leader, mode, createdAt: Date.now() });
      navigate(`/f/${r.follow.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <Blob mode={mode} />
      <form className="glass" onSubmit={submit}>
        <h2>{mode === "tail" ? "Copy every move" : "Take the other side"}</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          {mode === "tail"
            ? "When they open, add or close a position, the same thing happens in your account."
            : "When they go long, you go short. When they close, you close."}
        </p>
        <div className="field">
          <span>Mode</span>
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
        <label className="field">
          <span>Your dreamDEX account</span>
          <input className="input" value={follower} onChange={(e) => setFollower(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
        </label>
        <div className="field">
          <span>Size compared to them</span>
          <div className="pills">
            {MULTS.map((m) => (
              <button type="button" key={m} aria-pressed={mult === m} onClick={() => setMult(m)}>
                {m}x
              </button>
            ))}
          </div>
          <p className="hint">
            {mult === 1 ? "1x copies their leverage exactly." : `${mult}x of their leverage.`} We size by leverage, not dollars, so a $500 account
            can follow a $50,000 one.
          </p>
        </div>
        <div className="field">
          <span>Most per market</span>
          <div className="pills">
            {CAPS.map((c) => (
              <button type="button" key={c} aria-pressed={cap === c} onClick={() => setCap(c)}>
                ${c}
              </button>
            ))}
          </div>
          <p className="hint">No single position of yours grows past ${cap}, whatever they do.</p>
        </div>
        {err && <p className="formerr">{err}</p>}
        <div className="cta" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22, alignItems: "center" }}>
          <button className="btn grad" disabled={busy}>
            {busy ? "Making your bot key…" : mode === "tail" ? "Start tailing" : "Start fading"}
          </button>
          <a className="btn quiet" href={shareUrl(leader, mode, p)} target="_blank" rel="noreferrer">
            Share on X
          </a>
        </div>
        <p className="hint">Next you'll link a fresh bot key in dreamDEX and give it a little STT for gas. Nothing trades until you do.</p>
      </form>
    </div>
  );
}

function shareUrl(leader: string, mode: Mode, p?: TraderProfile) {
  const s = p?.stats;
  const who = short(leader);
  const text =
    mode === "tail"
      ? `I'm tailing ${who} on @DreamDEXSomnia perps.${s ? ` ${usd(s.pnl7d, true)} this week, ${Math.round(s.winRate * 100)}% of trades won.` : ""} Every move they make lands in my account too.`
      : `I'm fading ${who} on @DreamDEXSomnia perps.${s ? ` They're ${usd(s.pnl7d, true)} this week and right ${Math.round(s.winRate * 100)}% of the time.` : ""} Every trade they make, I take the other side.`;
  const url = `${location.origin}/t/${leader}?mode=${mode}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
