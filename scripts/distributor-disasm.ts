// Where in the VoucherDistributor (or its implementation) does revert selector 0x3e31dcc2 come from,
// and what does the code check just before it? Prints the opcodes around each occurrence.
// Run: npx tsx scripts/distributor-disasm.ts [address]

import { getAddress, type Hex } from "viem";
import { rpc } from "../src/chain.js";

const SEL = "3e31dcc2";
let addr = getAddress(process.argv[2] ?? "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4");

// Follow an EIP-1967 proxy to its implementation if there is one.
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const impl = await rpc.getStorageAt({ address: addr, slot: IMPL_SLOT });
if (impl && BigInt(impl) !== 0n) {
  addr = getAddress(`0x${impl.slice(-40)}`);
  console.log("proxy -> implementation", addr);
}
const code = (await rpc.getCode({ address: addr })) as Hex;
const bytes = Buffer.from(code.slice(2), "hex");
console.log(`code ${bytes.length} bytes`);

const NAMES: Record<number, string> = {
  0x00: "STOP", 0x01: "ADD", 0x02: "MUL", 0x03: "SUB", 0x04: "DIV", 0x10: "LT", 0x11: "GT", 0x14: "EQ", 0x15: "ISZERO",
  0x16: "AND", 0x17: "OR", 0x19: "NOT", 0x1b: "SHL", 0x1c: "SHR", 0x20: "KECCAK256", 0x30: "ADDRESS", 0x31: "BALANCE",
  0x32: "ORIGIN", 0x33: "CALLER", 0x34: "CALLVALUE", 0x35: "CALLDATALOAD", 0x3b: "EXTCODESIZE", 0x3f: "EXTCODEHASH",
  0x42: "TIMESTAMP", 0x50: "POP", 0x51: "MLOAD", 0x52: "MSTORE", 0x54: "SLOAD", 0x55: "SSTORE", 0x56: "JUMP",
  0x57: "JUMPI", 0x5b: "JUMPDEST", 0x5f: "PUSH0", 0xf1: "CALL", 0xfa: "STATICCALL", 0xfd: "REVERT", 0xf3: "RETURN",
};
function disasm(from: number, to: number) {
  const out: string[] = [];
  let i = from;
  while (i < to && i < bytes.length) {
    const op = bytes[i]!;
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f;
      out.push(`${i}: PUSH${n} 0x${bytes.subarray(i + 1, i + 1 + n).toString("hex")}`);
      i += 1 + n;
    } else if (op >= 0x80 && op <= 0x8f) { out.push(`${i}: DUP${op - 0x7f}`); i++; }
    else if (op >= 0x90 && op <= 0x9f) { out.push(`${i}: SWAP${op - 0x8f}`); i++; }
    else { out.push(`${i}: ${NAMES[op] ?? `0x${op.toString(16)}`}`); i++; }
  }
  return out;
}

const hex = bytes.toString("hex");
// PUSH4 sel, or PUSH32 sel000... (how solc often emits custom errors).
let at = hex.search(new RegExp(`(63|7f)${SEL}`));
if (at < 0) console.log("selector not found as PUSH4 or PUSH32 in this code");
while (at >= 0) {
  if (at % 2 === 0) {
    const pos = at / 2;
    console.log(`\n--- push of 0x${SEL} at byte ${pos} ---`);
    console.log(disasm(Math.max(0, pos - 120), pos + 40).join("\n"));
  }
  const next = hex.slice(at + 2).search(new RegExp(`(63|7f)${SEL}`));
  at = next < 0 ? -1 : at + 2 + next;
}
process.exit(0);
