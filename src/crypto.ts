// Per-follow bot keys are encrypted at rest with MASTER_KEY (AES-256-GCM).
// Manage tokens are stored as SHA-256 hashes; the plaintext only ever lives in the follower's browser.

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./config.js";

function masterKey(): Buffer {
  const raw = requireEnv("MASTER_KEY");
  const key = Buffer.from(raw.replace(/^0x/, ""), "hex");
  if (key.length !== 32) throw new Error("MASTER_KEY must be 32 bytes of hex (64 hex characters).");
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, body] = sealed.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
