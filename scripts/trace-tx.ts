// Call tree of a transaction (debug_traceTransaction with callTracer), to see which contract reverted.
// Run: npx tsx scripts/trace-tx.ts <txHash>

import { rpc } from "../src/chain.js";

interface Frame { type: string; from: string; to: string; input: string; value?: string; output?: string; error?: string; revertReason?: string; calls?: Frame[] }

const hash = process.argv[2] as `0x${string}`;
const tx = await rpc.getTransaction({ hash });
const trace = (await rpc.request({
  method: "debug_traceTransaction" as never,
  params: [hash, { tracer: "callTracer" }] as never,
})) as Frame;

function show(f: Frame, depth = 0) {
  const pad = "  ".repeat(depth);
  const value = f.value && BigInt(f.value) > 0n ? ` value ${Number(BigInt(f.value)) / 1e18} STT` : "";
  console.log(`${pad}${f.type} ${f.from.slice(0, 10)} -> ${f.to} sel ${f.input.slice(0, 10)}${value}${f.error ? `  ERROR ${f.error}` : ""}${f.output && f.error ? ` out ${f.output.slice(0, 74)}` : ""}`);
  for (const c of f.calls ?? []) show(c, depth + 1);
}
console.log(`from ${tx.from} to ${tx.to} block ${tx.blockNumber}`);
show(trace);
process.exit(0);
