# Tail or Fade

**Pick any dreamDEX perps trader. Back them or bet against them.**

Tail a trader and your dreamDEX account copies their position changes. Fade them and it takes the other side of every move. Somnia Reactivity pushes each change to us as it lands on chain, and a bot key that only you can revoke places the matching order in your own account.

- Live app: https://tail-or-fade.onrender.com (free plan: if it has been asleep, the first load takes about a minute)
- Demo video: https://youtu.be/CzdpEgY47DU
- Code: https://github.com/Sanchay117/Tail-or-Fade
- Network: Somnia Tokyo testnet (Hideki, chain 50383), where dreamDEX perps run today

Built for the dreamDEX Perps Builder Bounty (MVP track).

## Who it is for

- **Traders who don't want to read charts all day.** Find someone who is up this week and ride along at the leverage you pick.
- **Traders who think the crowd is wrong.** 733 of the 1,074 accounts that traded dreamDEX perps this week are down. Fade one and their losing streak becomes your trade.
- **Leaders and their crowd.** Every trader page has a share-to-X button that posts who you are tailing or fading, with their week, so each follow can bring in the next one. Every follower adds orders to the book.

Each leader trade becomes one order per follower. That is the loop: more follows mean more perps orders on dreamDEX from the same number of decisions.

## What you do

1. Paste a trader's address on the home page, or tap one from the Worth tailing / Worth fading lists. You see their week, flipped if you chose Fade.
2. Pick Tail or Fade, a leverage multiplier (0.25x to 2x), and a cap per market ($50 to $500). Enter your dreamDEX account and start.
3. The app makes a fresh bot key for this follow and shows a three-step checklist that turns green by itself:
   - send the bot a little STT for gas (Tokyo faucet link included)
   - link the bot to your account with Link a Bot in dreamDEX, Perps ticked
   - have margin in your perps account
4. When all three are green the follow goes Live and syncs to where the leader is right now. After that, every move they make is mirrored.
5. Your manage link (saved in your browser) pauses, resumes or stops the follow. Stop can also close the mirrored positions.

## How it works

```
leader trades on dreamDEX
        |
MarginBank emits PositionUpdated(account, pool, newSize, ...)
        |
Somnia off-chain Reactivity (somnia_watch over WebSocket) pushes the log to us,
with an eth_call result attached that stamps the block it landed in
        |
mirror engine: for each active follow of that leader, in that market
  target = leader's leverage x your equity x multiplier   (sign flipped for Fade)
  capped at your per-market limit, snapped to the market's lot size
        |
one IOC order for (target - your current size), simulated first, then sent with
placeOrderFor from that follow's own bot key
        |
receipt -> live tape and mirror log in the app (Server-Sent Events)
```

Design choices that matter:

- **Copy leverage, not size.** A whale's 40 ETH long on $200k of equity is 0.7x. A follower with $1,000 tailing at 1x goes 0.7x too, about $700 of ETH. Fade flips the sign. Pure bigint math in `src/sizing.ts`, unit tested.
- **Mirror state, not orders.** We copy where the leader is, not the order they sent. Bursts of fills collapse into one follower order, and a missed event heals on the next one. A reconcile pass also catches anything the socket dropped.
- **One bot key per follow.** Keys are generated server side, encrypted at rest with AES-256-GCM under `MASTER_KEY`, and only ever hold gas. The bot can place and cancel orders for your account and nothing else: it cannot withdraw. You revoke it in dreamDEX at any time.
- **Brakes.** Per-market notional cap, `MAX_ORDERS_PER_HOUR` per follow (default 60), `SLIPPAGE_BPS` around the live mark (default 75), every order simulated before it is sent so a doomed order costs nothing, and one transaction at a time per bot key so nonces never collide.
- **Readiness from chain, not from the user.** The checklist reads the bot's STT balance, `isLinked` on the operator registry, and your perps equity. Nobody has to click "I did it".

## Evidence

Everything below can be checked on the Tokyo explorer, https://explorer.testnet.somnia.network/tokyo.

| What | Proof |
| --- | --- |
| Reactivity feed | The live tape on the home page; `GET /api/stats` reports `eventsSeen` (3,500+ PositionUpdated events in one session) |
| Bot linked as operator | From a plain EOA: [0xfe55721f…](https://explorer.testnet.somnia.network/tokyo/tx/0xfe55721fb572b5f9d8a8ed988ff3e51f1726b1c349f409bbc919e163ceb3c8f8) (`setOperatorApprovalGlobal` for bot 0x5DF364268Ce5EcAe7B0f09d70a72a2E61A51d76B). From a dreamDEX app wallet with Link a Bot: [0x0d2ad10a…](https://explorer.testnet.somnia.network/tokyo/tx/0x0d2ad10a0dcbb965998cc2d046c6c3c1a2cb6c0738522be2d89825943cc56c5c) and [0x1136c19b…](https://explorer.testnet.somnia.network/tokyo/tx/0x1136c19b25d93a124098fdedbe44c9df809cb4b72d9db5ff2d3449eddaa51770) |
| Follower margin | 500 USDso minted on the Global testnet, bridged to Tokyo ([0xfb01a172…](https://explorer.testnet.somnia.network/tx/0xfb01a172accfdda6687de4c22269ed1370cade384b3cf28d842ae6f7f64bcb77)) and deposited into the MarginBank ([0x8c7b4c81…](https://explorer.testnet.somnia.network/tokyo/tx/0x8c7b4c81deebda01d8318f2eb56ea73bba34ca25ffb135ac8a05510b1076a0fa)) with `scripts/bridge-usdso.ts` |
| Mirrored orders | First mirror, Nov 11: the leader 0x3F6bD081CE0a9DF28575BeA049a4f0B2F105d05f is short 296.76 SOL, so the follow synced into a short of its own, 2.98 SOL-PERP filled at $83.86 (about $250, the follow's cap), sent by the bot with `placeOrderFor`: [0x32010b55…](https://explorer.testnet.somnia.network/tokyo/tx/0x32010b552c6e711fd73dccb4d8a64190882ab4e1ec0bc0713e870d605d8b6518). Every later mirror is listed by `GET /api/mirrors`. |

## Run it

Needs Node 22 or newer.

```bash
npm install
cp .env.example .env    # then set MASTER_KEY: openssl rand -hex 32
npm run dev             # API, Reactivity watcher and worker on :8790, web on :5195
```

Open http://localhost:5195.

Production is one process that serves the built web app too:

```bash
npm run build
npm start
```

There is a `Dockerfile` for a one-container deploy, with `render.yaml` (Render, free plan) and `railway.toml` (Railway) ready to use. Set `MASTER_KEY` as a secret. Follows live in `DATA_DIR/state.json`: mount a volume there, or on a host without a disk set `SEED_STATE_B64` (base64 of a `state.json`) so every boot starts from the same follows. Run exactly one instance.

Tests and types:

```bash
npm test
npm run typecheck
```

### Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `NETWORK` | `hideki` | dreamDEX perps are on the Tokyo testnet today |
| `MASTER_KEY` | none, required | 32 bytes hex, encrypts bot keys at rest |
| `DATA_DIR` | `data` | where follows and mirror records are kept |
| `SLIPPAGE_BPS` | `75` | how far past the mark a mirror order may fill |
| `MAX_ORDERS_PER_HOUR` | `60` | brake per follow against a hyperactive leader |
| `PORT` | `8790` | API port |

### API

| Route | |
| --- | --- |
| `GET /api/leaders` | Worth tailing and Worth fading lists, plus how many traders are down this week |
| `GET /api/traders/:address` | one trader's week: PnL, win rate, open positions, recent closes |
| `POST /api/follows` | start a follow; returns its bot address and a manage token |
| `GET /api/follows/:id` | status, checklist and mirror history |
| `POST /api/follows/:id/pause`, `/resume`, `/stop` | manage token required; stop can close positions |
| `GET /api/mirrors` | recent mirrored orders across all follows |
| `GET /api/stream` | Server-Sent Events: the Reactivity tape and mirror results |

## Layout

```
src/        server (Hono), Reactivity watcher, mirror engine, executor, sizing
web/        front end (Vite + React)
scripts/    ops and probes: link a bot from an EOA, account checks, gas costs
feedback/   feedback-track reports, one file per issue
```

`scripts/link-bot.ts` links a bot from a plain EOA account by calling the operator registry directly, for accounts that are not app wallets.

`scripts/bridge-usdso.ts` gets testnet margin for an EOA follower: it mints USDso on the Global testnet, bridges it to Tokyo over Somnia's test bridge, and deposits it into the MarginBank (`--send`, then `--deposit`; a dry run without flags). The account needs 1 STT on the Global testnet for gas, from https://explorer.testnet.somnia.network/faucet.

## Mainnet

The network is one config switch (`src/config.ts`). When dreamDEX perps launch on Somnia mainnet, the plan is the same worker with a mainnet entry, builder fees on mirrored orders, and the hosted app pointed at it.

## Feedback track

Six reports from building this, in `feedback/`:

1. Perps voucher claim reverts with an undecoded error while `getPerpVoucherEligibility` says eligible
2. Link a Bot blocks on "the app's key has no SOMI" but never shows that key or how to fund it
3. "Get test funds" never mentions the Tokyo faucet or the bridge, so a new builder ends up with no gas and no margin
4. Base-decimals table in the docs leaves out ADLT
5. The SDK's exported chains do not type-check as a viem `Chain` on viem 2.57
6. Docs say a perps transaction costs 0.0003 to 0.003 STT; bot orders cost a median of 0.0175 STT

## X posts

- [Every dreamDEX perps trader is now a button](https://x.com/eepy_engineer/status/2120496616151138393)
- _link to post 2 goes here_
- _link to post 3 goes here_

## Known limits

- Testnet only, because that is where dreamDEX perps are.
- One worker process. Running two against the same data would place every order twice.
- The hosted demo runs on Render's free plan, which has no disk. Each restart reloads the follows from `SEED_STATE_B64`, so a follow started on the hosted site lasts until the next restart. Because the worker mirrors positions rather than orders, a restart never doubles an order: it re-syncs each follower to where its leader is now.
- A linked bot can place, cancel and reduce, but cannot arm stop orders or change leverage, so followers inherit the account's existing leverage settings.

## License

MIT
