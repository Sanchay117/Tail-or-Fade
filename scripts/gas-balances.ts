// Native gas balances of the addresses in the Link a Bot report, on the Tokyo testnet and on mainnet.
// Usage: npx tsx scripts/gas-balances.ts <address> [address...]
import { createPublicClient, formatEther, http, type Address } from "viem";

const nets = {
  "tokyo testnet (STT)": "https://api.hideki2.infra.testnet.somnia.network",
  "mainnet (SOMI)": "https://api.infra.mainnet.somnia.network",
};

const addrs = process.argv.slice(2) as Address[];
for (const [name, url] of Object.entries(nets)) {
  const client = createPublicClient({ transport: http(url) });
  for (const a of addrs) {
    try {
      const [bal, nonce, code] = await Promise.all([
        client.getBalance({ address: a }),
        client.getTransactionCount({ address: a }),
        client.getCode({ address: a }),
      ]);
      console.log(`${name}  ${a}  ${formatEther(bal)}  nonce=${nonce}  code=${code ? (code.length - 2) / 2 : 0}B`);
    } catch (e) {
      console.log(`${name}  ${a}  error: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}
