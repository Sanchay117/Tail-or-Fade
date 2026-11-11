import { useEffect, useState } from "react";
import { addrLink, api, FAUCET, saveFollow, savedFollows, short, tokenFor, useFetch, usd, type FollowDetail } from "../api";
import { A, Copy, MirrorLog } from "../ui";

export function FollowPage({ id }: { id: string }) {
  // A manage link (#k=...) carries the token to another browser. The hash never reaches the server.
  useEffect(() => {
    const k = new URLSearchParams(location.hash.slice(1)).get("k");
    if (k && !tokenFor(id)) saveFollow({ id, token: k, leader: "", mode: "tail", createdAt: Date.now() });
    if (k) history.replaceState(null, "", location.pathname);
  }, [id]);

  const { data: d, error, reload } = useFetch(() => api.follow(id), [id], 4_000);

  if (error && !d) {
    return (
      <main className="page">
        <div className="wrap">
          <A href="/me" className="back">← My follows</A>
          <div className="pagehead"><h1>Can't find that follow.</h1><p>{error}</p></div>
        </div>
      </main>
    );
  }
  if (!d) return <main className="page"><div className="wrap"><p className="empty">Loading…</p></div></main>;
  const f = d.follow;

  return (
    <main className="page" data-mode={f.mode}>
      <div className="wrap">
        <A href="/me" className="back">← My follows</A>
        <div className="pagehead">
          <h1>{headline(d)}</h1>
          <p>
            {f.mode === "tail" ? "Tailing" : "Fading"} <A href={`/t/${f.leader}?mode=${f.mode}`} className="mono">{short(f.leader)}</A> into{" "}
            <span className="mono">{short(f.follower)}</span> at {f.multiplierBps / 10_000}x their leverage, up to {usd(f.maxNotional)} per market.
          </p>
        </div>
        <div className="split">
          <div className="card">
            {f.status === "stopped" ? (
              <p className="empty">This follow is stopped. The bot key is no longer used; unlink it in dreamDEX whenever you like.</p>
            ) : (
              <Checklist d={d} />
            )}
          </div>
          <div style={{ display: "grid", gap: 20 }}>
            <Controls d={d} onChange={reload} />
            <div className="card">
              <div className="cardhead">
                <h3>Mirrored orders</h3>
                <span className={`statusline ${f.status}`}>{f.status}</span>
              </div>
              <MirrorLog
                mirrors={d.mirrors}
                empty={
                  f.status === "active"
                    ? "Live and in sync. The next time they trade, your order shows up here with its transaction."
                    : "Nothing yet. Orders start once the three steps are done."
                }
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function headline(d: FollowDetail) {
  const left = [d.ready.gas, d.ready.linked, d.ready.margin].filter((x) => !x).length;
  switch (d.follow.status) {
    case "active": return "Live.";
    case "paused": return "Paused.";
    case "stopped": return "Stopped.";
    default: return left === 0 ? "Going live…" : `${left} step${left > 1 ? "s" : ""} to go.`;
  }
}

function Checklist({ d }: { d: FollowDetail }) {
  const f = d.follow;
  return (
    <ol className="checklist">
      <li className={d.ready.gas ? "done" : undefined}>
        <span className="tick">{d.ready.gas ? "✓" : "1"}</span>
        <div>
          <h3>Give the bot key some gas</h3>
          <p>
            This key places your orders and pays its own gas in testnet STT, about 0.002 to 0.03 STT an order. It has{" "}
            <b>{d.botGasStt.toFixed(4)} STT</b>.
          </p>
          <Copy text={f.bot} />
          <p style={{ marginTop: 10 }}>
            <a href={FAUCET} target="_blank" rel="noreferrer">Claim 1 STT for it from the Tokyo faucet</a>, send it some yourself, or use the send
            option on dreamDEX's Link a Bot screen. <a href={addrLink(f.bot)} target="_blank" rel="noreferrer">See it on the explorer</a>.
          </p>
        </div>
      </li>
      <li className={d.ready.linked ? "done" : undefined}>
        <span className="tick">{d.ready.linked ? "✓" : "2"}</span>
        <div>
          <h3>Link it in dreamDEX</h3>
          <ol>
            <li>
              Open <a href="https://app.testnet.dreamdex.io" target="_blank" rel="noreferrer">app.testnet.dreamdex.io</a> with{" "}
              <span className="mono">{short(f.follower)}</span>.
            </li>
            <li>Open your wallet and choose <b>Link a bot</b>.</li>
            <li>Paste the bot address above, keep <b>Perps</b> ticked, press <b>Add bot</b>.</li>
          </ol>
          <p>It can place, cancel and reduce orders for you. It cannot withdraw. This page ticks itself when the link lands on chain.</p>
        </div>
      </li>
      <li className={d.ready.margin ? "done" : undefined}>
        <span className="tick">{d.ready.margin ? "✓" : "3"}</span>
        <div>
          <h3>Have margin in your perps account</h3>
          <p>
            On the perps page open <b>Perps ⇆ Spot</b> and move USDso into your Perps account. Right now it holds{" "}
            <b>{usd(d.equityUsd)}</b>.
          </p>
        </div>
      </li>
    </ol>
  );
}

function Controls({ d, onChange }: { d: FollowDetail; onChange: () => void }) {
  const f = d.follow;
  const token = tokenFor(f.id);
  const [close, setClose] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  if (f.status === "stopped") return null;
  if (!token) {
    return (
      <div className="card">
        <p className="notice" style={{ margin: 0 }}>
          This follow was set up in another browser. Open its manage link there, or here, to pause or stop it.
        </p>
      </div>
    );
  }
  const act = async (a: "pause" | "resume" | "stop") => {
    setBusy(true);
    setErr(undefined);
    try {
      await api.act(f.id, a, token, close);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const manage = `${location.origin}/f/${f.id}#k=${token}`;
  const known = savedFollows().some((s) => s.id === f.id);
  return (
    <div className="card">
      <div className="cardhead">
        <h3>Controls</h3>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {f.status === "paused" ? (
          <button className="btn small" disabled={busy} onClick={() => act("resume")}>Resume</button>
        ) : (
          <button className="btn quiet small" disabled={busy} onClick={() => act("pause")}>Pause</button>
        )}
        <button className="btn quiet small" disabled={busy} onClick={() => act("stop")}>Stop</button>
        <label className="hint" style={{ margin: 0, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> and close what it opened
        </label>
      </div>
      {err && <p className="formerr">{err}</p>}
      {known && (
        <>
          <p className="hint" style={{ marginTop: 16 }}>Manage link. Anyone with it can pause or stop this follow, so keep it to yourself.</p>
          <Copy text={manage} />
        </>
      )}
    </div>
  );
}
