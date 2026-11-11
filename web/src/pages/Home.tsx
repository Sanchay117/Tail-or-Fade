import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { api, short, useFetch, usd, type Leaderboard, type Mirror, type Mode, type Stats, type Tape, type TraderProfile, type TraderStats } from "../api";
import { A, Blob, MirrorLog, ModeSwitch, navigate, Spark } from "../ui";

interface Stream { tape: Tape[]; mirrors: Mirror[]; stats?: Stats; connected: boolean }
interface Chip { label: string; address: string; mode: Mode }

export function Home({ stream }: { stream: Stream }) {
  const board = useFetch(api.leaders, []);
  const [mode, setMode] = useState<Mode>("tail");

  useEffect(() => {
    if (board.data && location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, [board.data]);

  return (
    <main data-mode={mode}>
      <Hero board={board.data} mode={mode} setMode={setMode} />
      <Live stream={stream} />
      <Capabilities board={board.data} error={board.error} />
    </main>
  );
}

/* ---------- 1. the product, working ---------- */

function Hero({ board, mode, setMode }: { board?: Leaderboard; mode: Mode; setMode: (m: Mode) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [answer, setAnswer] = useState<TraderProfile>();
  const sets = useMemo(() => chipSets(board), [board]);
  const [set, setSet] = useState(0);

  useEffect(() => {
    if (sets.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setSet((s) => (s + 1) % sets.length), 5200);
    return () => clearInterval(t);
  }, [sets.length]);

  async function look(addr: string) {
    const a = addr.trim();
    setErr(undefined);
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      setErr("That isn't a wallet address. Paste the full 0x address of a dreamDEX trader, or tap one below.");
      return;
    }
    setBusy(true);
    try {
      setAnswer(await api.trader(a));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void look(input);
  };

  return (
    <section className="hero">
      <div className="wrap">
        <h1>
          Pick a trader.<span className="accent">Back them or bet against them.</span>
        </h1>
        <div className="stage">
          <Blob mode={mode} />
          <form className="composer glass" onSubmit={submit}>
            <ModeSwitch mode={mode} onChange={setMode} />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a trader's 0x address"
              aria-label="dreamDEX trader address"
              spellCheck={false}
              autoComplete="off"
            />
            <button className="go" aria-label="Look them up" disabled={busy}>
              {busy ? "…" : "→"}
            </button>
          </form>
          {err && <p className="formerr">{err}</p>}
          <p className="trylabel">Real traders from this week on dreamDEX</p>
          <div className="chips" key={set}>
            {(sets[set] ?? []).map((c, i) => (
              <button
                key={c.address}
                type="button"
                className="chip glass"
                style={{ "--i": i } as CSSProperties}
                onClick={() => {
                  setInput(c.address);
                  setMode(c.mode);
                  void look(c.address);
                }}
              >
                <span className={`dot${c.mode === "fade" ? " fade" : ""}`} aria-hidden="true" />
                {c.label}
              </button>
            ))}
            {!board && <span className="trylabel">reading the week from the dreamDEX indexer…</span>}
          </div>
          {busy && !answer && <div className="answer glass"><p className="sub">Reading their week from the dreamDEX indexer…</p></div>}
          {answer && <Answer p={answer} mode={mode} />}
          <p className="trust glass">
            Testnet only. Orders go through a bot key you link in dreamDEX. It can trade for you. It can never withdraw.
          </p>
        </div>
      </div>
    </section>
  );
}

function Answer({ p, mode }: { p: TraderProfile; mode: Mode }) {
  const s = p.stats;
  const sign = mode === "fade" ? -1 : 1;
  const pnl = (s?.pnl7d ?? 0) * sign;
  const pct = p.equityUsd > 0 && s ? (pnl / p.equityUsd) * 100 : undefined;
  return (
    <div className="answer glass" key={p.address}>
      <div className="who">
        <span className="mono">{short(p.address)}</span>
        <span>last 7 days</span>
      </div>
      {s ? (
        <>
          <div className={`big ${pnl >= 0 ? "gain" : "loss"}`}>{usd(pnl, true)}</div>
          <p className="sub">
            {mode === "tail" ? "What they made this week." : "The other side of their week."}
            {pct !== undefined && Math.abs(pct) < 1000 && (
              <>
                {" "}
                {mode === "tail" ? "Tailing" : "Fading"} them at 1x, that is about <b>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</b> on your account.
              </>
            )}
          </p>
          <Spark points={s.spark} mode={mode} />
          <div className="row">
            <span><b>{s.closes}</b> closed trades</span>
            <span><b>{Math.round(s.winRate * 100)}%</b> won</span>
            <span>best <b>{usd(s.best, true)}</b></span>
            <span>{s.markets.slice(0, 4).join(", ")}</span>
          </div>
        </>
      ) : (
        <p className="sub" style={{ marginTop: 12 }}>No closed trades in the last 7 days. You can still {mode} them: we mirror their next move.</p>
      )}
      {p.positions.length > 0 && (
        <div className="open" aria-label="Open right now">
          {p.positions.slice(0, 6).map((o) => (
            <span key={o.pool} className={`tag ${o.side}`}>
              {o.side === "long" ? "Long" : "Short"} {o.base} {usd(o.notionalUsd)}
            </span>
          ))}
        </div>
      )}
      <div className="cta">
        <A href={`/t/${p.address}?mode=${mode}`} className="btn grad">
          {mode === "tail" ? "Tail this trader" : "Fade this trader"} →
        </A>
        <span className="hint">Takes about two minutes. You need a dreamDEX account and a little testnet STT.</span>
      </div>
    </div>
  );
}

/** Rotating examples, written from live stats so every chip is a real account. */
function chipSets(b?: Leaderboard): Chip[][] {
  if (!b) return [];
  const tail = b.tail.slice(0, 6).map((t): Chip => ({ address: t.address, mode: "tail", label: tailLabel(t) }));
  const fade = b.fade.slice(0, 6).map((t, i): Chip => ({ address: t.address, mode: "fade", label: fadeLabel(t, i) }));
  const mixed: Chip[] = [];
  for (let i = 0; i < 6; i++) {
    if (tail[i]) mixed.push(tail[i]!);
    if (fade[i]) mixed.push(fade[i]!);
  }
  const sets: Chip[][] = [];
  for (let i = 0; i + 3 <= mixed.length && sets.length < 4; i += 3) sets.push(mixed.slice(i, i + 3));
  return sets;
}

function tailLabel(t: TraderStats) {
  if (t.winRate === 1 && t.closes >= 5) return `Hasn't lost in ${t.closes} trades`;
  if (t.best > t.pnl7d * 0.8 && t.markets[0]) return `One ${t.markets[0]} trade made ${usd(t.best)}`;
  if (t.winRate >= 0.7) return `Wins ${Math.round(t.winRate * 100)}% of the time`;
  return `Up ${usd(t.pnl7d)} this week`;
}

/** Varied by position so a set of three never repeats a joke. */
function fadeLabel(t: TraderStats, i: number) {
  const lines = [
    t.wins === 0 ? `0 for ${t.closes} and still going` : `Won ${t.wins} of ${t.closes}. Bless them`,
    `Down ${usd(-t.pnl7d)} and still clicking`,
    `Right ${Math.round(t.winRate * 100)}% of the time`,
    t.wins === 0 ? `${t.closes} trades, not one winner` : `Lost ${t.closes - t.wins} of ${t.closes} this week`,
  ];
  return lines[i % lines.length]!;
}

/* ---------- 2. proof by use ---------- */

function Live({ stream }: { stream: Stream }) {
  const recent = useFetch(() => api.mirrors(20), []);
  const mirrors = useMemo(() => {
    const seen = new Set<string>();
    return [...stream.mirrors, ...(recent.data ?? [])].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).slice(0, 8);
  }, [stream.mirrors, recent.data]);
  const s = stream.stats;
  return (
    <section className="section" id="live">
      <div className="wrap">
        <h2>Every dreamDEX trade, the moment it lands.</h2>
        <p className="intro">
          Somnia Reactivity pushes each perps position change to us as it happens. Anyone on this tape can be tailed or faded. Followed traders get
          mirrored a block or two later, and every mirrored order is listed with its transaction.
        </p>
        <div className="live">
          <div className="card">
            <div className="cardhead">
              <h3>Live tape</h3>
              <span className={`pulse${stream.connected ? "" : " off"}`}>{stream.connected ? "live from Reactivity" : "reconnecting"}</span>
            </div>
            <ul className="tape" aria-live="off">
              {stream.tape.length === 0 && <li><span className="what">Waiting for the next trade on dreamDEX…</span></li>}
              {stream.tape.map((t) => (
                <TapeRow key={t.seq} t={t} />
              ))}
            </ul>
          </div>
          <div className="card">
            <dl className="stats">
              <div className="stat">
                <dt>Trades heard</dt>
                <dd>{s ? s.eventsSeen.toLocaleString("en-US") : "–"}</dd>
              </div>
              <div className="stat">
                <dt>Follows live</dt>
                <dd>{s ? s.active : "–"}</dd>
              </div>
              <div className="stat">
                <dt>Orders mirrored</dt>
                <dd>{s ? s.orders : "–"}</dd>
              </div>
              <div className="stat">
                <dt>Blocks behind leader</dt>
                <dd>{s?.medianBlocksBehind ?? "–"}</dd>
              </div>
            </dl>
            <div className="cardhead">
              <h3>Mirrored orders</h3>
            </div>
            <MirrorLog mirrors={mirrors} empty="No mirrored orders yet. The first one shows up here with its transaction hash." />
          </div>
        </div>
      </div>
    </section>
  );
}

function TapeRow({ t }: { t: Tape }) {
  const flat = t.size === 0;
  const what = flat
    ? `closed${t.pnl ? ` ${usd(t.pnl, true)}` : ""}`
    : `${t.size > 0 ? "long" : "short"} ${fmtSize(Math.abs(t.size))} ${t.base}${t.pnl ? `, booked ${usd(t.pnl, true)}` : ""}`;
  return (
    <li className={t.following ? "followed" : undefined}>
      <span className="mkt">{t.base}</span>
      <span className="what">
        {short(t.account)} · {what}
      </span>
      <span className="acts">
        <A href={`/t/${t.account}?mode=tail`}>Tail</A>
        <A href={`/t/${t.account}?mode=fade`}>Fade</A>
      </span>
    </li>
  );
}

function fmtSize(n: number) {
  if (n >= 1000) return Math.round(n).toLocaleString("en-US");
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(2);
}

/* ---------- 3. one panel ---------- */

const TABS = ["Worth tailing", "Worth fading", "How it sizes", "Your bot key", "Under the hood"] as const;

function Capabilities({ board, error }: { board?: Leaderboard; error?: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Worth tailing");
  return (
    <section className="section" id="traders">
      <div className="wrap">
        <h2>Who to follow, and how it works.</h2>
        <p className="intro">
          Ranked from every closed perps trade on dreamDEX in the last 7 days.
          {board
            ? ` ${board.losing.toLocaleString("en-US")} of ${board.traders.toLocaleString("en-US")} traders are down this week, which makes fading a real strategy.`
            : ""}
        </p>
        <div className="card panel">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="tabbody" key={tab} role="tabpanel">
            {tab === "Worth tailing" && <Board list={board?.tail} mode="tail" error={error} />}
            {tab === "Worth fading" && <Board list={board?.fade} mode="fade" error={error} />}
            {tab === "How it sizes" && (
              <ul className="points">
                <li><b>We copy leverage, not dollars.</b> If they put 3x their account into ETH, you put 3x yours.</li>
                <li><b>Your multiplier scales it.</b> 0.5x copies half their leverage, 2x doubles it.</li>
                <li><b>A cap per market</b> stops any single position growing past the dollar limit you set.</li>
                <li><b>Fade flips the side.</b> They go long, you go short, same proportion.</li>
                <li><b>When they close, you close.</b> Partial closes are mirrored as partial closes.</li>
                <li><b>Orders cross the book</b> as immediate-or-cancel with 0.75% slippage room, on each market's tick and lot grid.</li>
              </ul>
            )}
            {tab === "Your bot key" && (
              <ul className="points">
                <li><b>One fresh key per follow.</b> It never sees your wallet's own key.</li>
                <li><b>You link it in dreamDEX</b> under Link a Bot, with Perps ticked.</li>
                <li><b>It can place, cancel and reduce orders</b> for your account. It cannot withdraw or send funds.</li>
                <li><b>It pays its own gas</b> in testnet STT, roughly 0.002 to 0.03 STT per order.</li>
                <li><b>Unlink it in dreamDEX</b> and mirroring stops on the next order. Or stop it here and close what it opened.</li>
                <li><b>The key is stored encrypted</b> (AES-256-GCM) and only decrypted to sign your orders.</li>
              </ul>
            )}
            {tab === "Under the hood" && (
              <ul className="points">
                <li><b>Somnia off-chain Reactivity</b> pushes every MarginBank <span className="mono">PositionUpdated</span> event over one WebSocket.</li>
                <li><b>The push beats polling.</b> It arrives about 2.5 seconds before the public RPC shows the same log.</li>
                <li><b>Each push carries its block number</b> (an eth_call rides along), so every mirror records how many blocks it trailed.</li>
                <li><b>A reconcile pass every 2 minutes</b> heals anything missed against on-chain positions.</li>
                <li><b>Rate limited</b> to 60 orders per follow per hour, so a runaway leader can't drain your gas.</li>
                <li><b>Leaderboards</b> come from the dreamDEX markets indexer. Accounts with 400+ closes a week are treated as bots and left out.</li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Board({ list, mode, error }: { list?: TraderStats[]; mode: Mode; error?: string }) {
  if (error) return <p className="empty">The dreamDEX indexer isn't answering right now. {error}</p>;
  if (!list) return <p className="empty">Reading the week from the dreamDEX indexer…</p>;
  if (!list.length) return <p className="empty">Nobody qualifies right now.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="board">
        <thead>
          <tr>
            <th>Trader</th>
            <th className="num">{mode === "tail" ? "7 days" : "If faded"}</th>
            <th className="num hide-sm">Trades</th>
            <th className="num hide-sm">Won</th>
            <th className="sp"><span className="sr">Trend</span></th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => {
            const pnl = mode === "fade" ? -t.pnl7d : t.pnl7d;
            return (
              <tr key={t.address} onClick={() => navigate(`/t/${t.address}?mode=${mode}`)}>
                <td>
                  <A href={`/t/${t.address}?mode=${mode}`} className="mono">
                    {short(t.address)}
                  </A>
                </td>
                <td className={`num ${pnl >= 0 ? "gain" : "loss"}`}>{usd(pnl, true)}</td>
                <td className="num hide-sm">{t.closes}</td>
                <td className="num hide-sm">{Math.round(t.winRate * 100)}%</td>
                <td className="sp" data-mode={mode}>
                  <Spark points={t.spark} mode={mode} height={28} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
