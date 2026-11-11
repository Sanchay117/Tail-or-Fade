// Network config. Hideki (the Tokyo testnet) is where dreamDEX perps live today.
// Mainnet is listed so the switch is one env var once perps launch there.

import "dotenv/config";
import { defineChain, getAddress, type Address, type Chain } from "viem";

export type NetworkName = "hideki" | "mainnet";

export interface Network {
  name: NetworkName;
  chain: Chain;
  rpcUrl: string;
  wsUrl: string;
  indexerUrl: string;
  explorer: string;
  marginBank: Address;
  operatorRegistry: Address;
}

const HIDEKI: Network = {
  name: "hideki",
  chain: defineChain({
    id: 50383,
    name: "Somnia Tokyo testnet",
    nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
    rpcUrls: {
      default: {
        http: ["https://api.hideki2.infra.testnet.somnia.network"],
        webSocket: ["wss://api.hideki2.infra.testnet.somnia.network/ws"],
      },
    },
  }),
  rpcUrl: "https://api.hideki2.infra.testnet.somnia.network",
  wsUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  explorer: "https://explorer.testnet.somnia.network/tokyo",
  marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
  operatorRegistry: "0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a",
};

export function network(): Network {
  const name = (process.env.NETWORK ?? "hideki").trim().toLowerCase();
  if (name === "hideki") return HIDEKI;
  throw new Error(`NETWORK=${name}: dreamDEX perps are only live on hideki (the Tokyo testnet) for now.`);
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. Add it to .env (see .env.example).`);
  return v;
}

export function optionalAddress(name: string): Address | undefined {
  const v = process.env[name]?.trim();
  return v ? getAddress(v) : undefined;
}

export const txUrl = (hash: string) => `${network().explorer}/tx/${hash}`;
export const addressUrl = (a: string) => `${network().explorer}/address/${a}`;
