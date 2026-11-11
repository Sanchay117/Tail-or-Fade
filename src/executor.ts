// Sends one follower order through that follow's own bot key: simulate (free, gives the named
// revert), then send with the 10M gas limit the pools need, then wait for the receipt.

import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { BaseError, ContractFunctionRevertedError, createWalletClient, formatEther, webSocket, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { operatorAbi } from "./abi.js";
import { network } from "./config.js";
import { ws } from "./chain.js";
import { decrypt } from "./crypto.js";

const net = network();
const ORDER_GAS = 10_000_000n;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const wallets = new Map<string, ReturnType<typeof createWalletClient>>();
const queues = new Map<string, Promise<unknown>>();

function walletFor(sealedKey: string) {
  let w = wallets.get(sealedKey);
  if (!w) {
    const account = privateKeyToAccount(decrypt(sealedKey) as Hex);
    w = createWalletClient({ account, chain: net.chain, transport: webSocket(net.wsUrl) });
    wallets.set(sealedKey, w);
  }
  return w;
}

/** One bot key sends one transaction at a time, so nonces never collide. */
function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  queues.set(key, next);
  return next;
}

export interface OrderRequest {
  sealedKey: string;
  owner: Address;
  pool: Address;
  isBid: boolean;
  price: bigint;
  quantity: bigint;
}

export type OrderOutcome =
  | { ok: true; hash: Hex; block: bigint; gasCostStt: number }
  | { ok: false; reason: string; noFill?: boolean; hash?: Hex };

/** The revert's name when the pool gave one, else viem's short message. */
export function revertName(err: unknown): string {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.data?.errorName) return r.data.errorName;
    if (r?.signature) return `custom error ${r.signature}`;
    return err.shortMessage;
  }
  return String(err).slice(0, 160);
}

export function placeFor(req: OrderRequest): Promise<OrderOutcome> {
  return serial(req.sealedKey, async () => {
    const wallet = walletFor(req.sealedKey);
    const args = [
      req.owner,
      req.isBid,
      0n,
      req.price,
      req.quantity,
      BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n,
      ORDER_TYPE.MARKET, // immediate-or-cancel: a mirror never rests on the book
      0,
      ZERO,
      0n,
    ] as const;
    try {
      const { request } = await ws.simulateContract({
        address: req.pool,
        abi: operatorAbi,
        functionName: "placeOrderFor",
        args,
        account: wallet.account!,
        gas: ORDER_GAS,
      });
      const hash = await wallet.writeContract(request as never);
      const receipt = await ws.waitForTransactionReceipt({ hash, timeout: 30_000 });
      if (receipt.status !== "success") return { ok: false, reason: "reverted on-chain", hash };
      return {
        ok: true,
        hash,
        block: receipt.blockNumber,
        gasCostStt: Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)),
      };
    } catch (err) {
      const reason = revertName(err);
      return { ok: false, reason, noFill: reason === "ImmediateOrCancelNoFill" };
    }
  });
}
