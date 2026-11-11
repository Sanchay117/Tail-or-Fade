// What real perps transactions cost on the Tokyo testnet: fee of recent txs that emitted
// MarginBank.PositionUpdated. Usage: npx tsx scripts/perp-tx-costs.ts [blocks=900] [maxTx=60]
import { createPublicClient, formatEther, formatGwei, http, type Hash } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const MARGIN_BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const POSITION_UPDATED = "0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de";

const span = BigInt(process.argv[2] ?? 900);
const maxTx = Number(process.argv[3] ?? 60);
const client = createPublicClient({ transport: http(RPC) });

const head = await client.getBlockNumber();
const logs = await client.request({
  method: "eth_getLogs",
  params: [{ address: MARGIN_BANK, topics: [POSITION_UPDATED], fromBlock: `0x${(head - span).toString(16)}`, toBlock: `0x${head.toString(16)}` }],
});
const hashes = [...new Set((logs as { transactionHash: Hash }[]).map((l) => l.transactionHash))].slice(-maxTx);
console.log(`blocks ${head - span}..${head}: ${logs.length} PositionUpdated logs in ${hashes.length} txs (sampled)`);

const rows: { hash: Hash; gas: bigint; price: bigint; fee: bigint; selector: string; limit: bigint }[] = [];
for (const hash of hashes) {
  const [r, t] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash })]);
  rows.push({ hash, gas: r.gasUsed, price: r.effectiveGasPrice, fee: r.gasUsed * r.effectiveGasPrice, selector: t.input.slice(0, 10), limit: t.gas });
}
rows.sort((a, b) => (a.fee < b.fee ? -1 : a.fee > b.fee ? 1 : 0));
const pick = (q: number) => rows[Math.min(rows.length - 1, Math.floor(q * rows.length))]!;
for (const [label, r] of [["min", rows[0]!], ["p25", pick(0.25)], ["median", pick(0.5)], ["p75", pick(0.75)], ["max", rows[rows.length - 1]!]] as const) {
  console.log(`${label.padEnd(6)} fee ${formatEther(r.fee)} STT  gasUsed ${r.gas}  price ${formatGwei(r.price)} gwei  limit ${r.limit}  ${r.selector}  ${r.hash}`);
}
const bySel = new Map<string, bigint[]>();
for (const r of rows) bySel.set(r.selector, [...(bySel.get(r.selector) ?? []), r.fee]);
for (const [sel, fees] of bySel) {
  fees.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  console.log(`selector ${sel}: n=${fees.length} min ${formatEther(fees[0]!)} median ${formatEther(fees[Math.floor(fees.length / 2)]!)} max ${formatEther(fees[fees.length - 1]!)} STT`);
}
const under = rows.filter((r) => r.fee <= 3_000_000_000_000_000n).length;
console.log(`${under}/${rows.length} at or under the documented 0.003 STT`);
