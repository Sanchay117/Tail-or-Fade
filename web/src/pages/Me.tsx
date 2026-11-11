import { api, savedFollows, short, useFetch, usd, type FollowDetail } from "../api";
import { A } from "../ui";

export function Me() {
  const saved = savedFollows();
  const { data, error } = useFetch(
    () => Promise.all(saved.map((s) => api.follow(s.id).catch(() => undefined))).then((r) => r.filter((x): x is FollowDetail => !!x)),
    [],
    10_000,
  );
  return (
    <main className="page">
      <div className="wrap">
        <div className="pagehead">
          <h1>My follows</h1>
          <p>Follows set up in this browser. A follow keeps running on our worker when this tab is closed.</p>
        </div>
        {!saved.length && (
          <div className="card" style={{ padding: 22 }}>
            <p className="empty" style={{ paddingTop: 0 }}>You aren't following anyone yet.</p>
            <A href="/#traders" className="btn">Find a trader</A>
          </div>
        )}
        {error && <p className="formerr">{error}</p>}
        <div className="follows">
          {(data ?? []).map((d) => {
            const f = d.follow;
            const filled = d.mirrors.filter((m) => m.status === "filled" || m.status === "partial");
            return (
              <A key={f.id} href={`/f/${f.id}`} className="card">
                <span style={{ fontWeight: 600 }}>
                  {f.mode === "tail" ? "Tailing" : "Fading"} <span className="mono">{short(f.leader)}</span>
                </span>
                <span className={`statusline ${f.status}`}>{f.status}</span>
                <span className="hint" style={{ margin: 0 }}>
                  {filled.length} orders mirrored · {f.multiplierBps / 10_000}x · up to {usd(f.maxNotional)} per market
                  {f.blocker && f.status === "waiting" ? ` · ${f.blocker}` : ""}
                </span>
              </A>
            );
          })}
        </div>
      </div>
    </main>
  );
}
