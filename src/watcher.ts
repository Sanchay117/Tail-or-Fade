// Off-chain Somnia Reactivity: one somnia_watch subscription on MarginBank PositionUpdated.
// The node runs Multicall3.getBlockNumber() in the event's block and pushes the result with the
// log, so every move arrives already stamped with the block it landed in.

import { EventEmitter } from "node:events";
import { SDK } from "@somnia-chain/reactivity";
import { createPublicClient, decodeEventLog, decodeFunctionResult, encodeFunctionData, getAddress, webSocket, type Hex } from "viem";
import { MULTICALL3, multicallAbi, POSITION_UPDATED_TOPIC, positionUpdatedEvent } from "./abi.js";
import { network } from "./config.js";
import type { LeaderMove } from "./engine.js";

const net = network();
const blockCall = { to: MULTICALL3, data: encodeFunctionData({ abi: multicallAbi, functionName: "getBlockNumber" }) };

export interface TapeEvent {
  account: string;
  pool: string;
  newSize: string;
  realizedPnl: string;
  block?: number;
  at: number;
}

export class Watcher extends EventEmitter {
  private sub?: { unsubscribe: () => Promise<unknown> };
  private lastEventAt = 0;
  private timer?: NodeJS.Timeout;
  count = 0;

  async start() {
    await this.subscribe();
    // The testnet book trades every second or two. A minute of silence means the socket died.
    this.timer = setInterval(() => {
      if (Date.now() - this.lastEventAt > 60_000) {
        console.warn("[watcher] no events for 60s, resubscribing");
        void this.subscribe();
      }
    }, 15_000);
  }

  private async subscribe() {
    try {
      await this.sub?.unsubscribe().catch(() => undefined);
      const client = createPublicClient({ chain: net.chain, transport: webSocket(net.wsUrl, { keepAlive: { interval: 15_000 } }) });
      const sdk = new SDK({ public: client as never });
      const sub = await sdk.watch({
        eventContractSources: [net.marginBank],
        topicOverrides: [POSITION_UPDATED_TOPIC],
        ethCalls: [blockCall],
        onData: (data: any) => this.onData(data?.result ?? data),
        onError: (e: unknown) => console.error("[watcher] error", (e as Error)?.message ?? e),
      } as never);
      if (sub instanceof Error) throw sub;
      this.sub = sub as never;
      this.lastEventAt = Date.now();
      console.log("[watcher] subscribed to PositionUpdated via somnia_watch");
    } catch (err) {
      console.error("[watcher] subscribe failed:", (err as Error).message);
    }
  }

  private onData(r: { topics: Hex[]; data: Hex; simulationResults?: Hex[] }) {
    this.lastEventAt = Date.now();
    this.count++;
    let args: any;
    try {
      args = decodeEventLog({ abi: [positionUpdatedEvent], topics: r.topics as never, data: r.data }).args;
    } catch {
      return;
    }
    let block: bigint | undefined;
    const sim = r.simulationResults?.[0];
    if (sim && sim !== "0x") {
      try {
        block = decodeFunctionResult({ abi: multicallAbi, functionName: "getBlockNumber", data: sim }) as bigint;
      } catch {
        block = undefined;
      }
    }
    const move: LeaderMove = {
      leader: getAddress(args.account),
      pool: getAddress(args.perpPool),
      newSize: args.newSize as bigint,
      block,
      receivedAt: this.lastEventAt,
      source: "reactivity",
    };
    this.emit("move", move);
    const tape: TapeEvent = {
      account: move.leader,
      pool: move.pool,
      newSize: move.newSize.toString(),
      realizedPnl: (args.realizedPnl as bigint).toString(),
      block: block ? Number(block) : undefined,
      at: move.receivedAt,
    };
    this.emit("tape", tape);
  }

  async stop() {
    clearInterval(this.timer);
    await this.sub?.unsubscribe().catch(() => undefined);
  }
}
