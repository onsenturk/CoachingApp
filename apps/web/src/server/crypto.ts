/**
 * Server-side libsodium helpers — duplicate of worker/src/crypto.ts so the web
 * app can encrypt at sign-in without importing from another deployable.
 */

import sodium from "libsodium-wrappers";

let ready: Promise<void> | null = null;

async function ensureReady() {
  if (!ready) ready = sodium.ready;
  await ready;
}

function getKey(): Uint8Array {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("TOKEN_ENCRYPTION_KEY env var is not set.");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be 32 bytes (got ${key.length}).`);
  }
  return new Uint8Array(key);
}

export async function encryptToken(plaintext: string): Promise<Buffer> {
  await ensureReady();
  const key = getKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);
  const out = Buffer.alloc(nonce.length + cipher.length);
  out.set(nonce, 0);
  out.set(cipher, nonce.length);
  return out;
}
