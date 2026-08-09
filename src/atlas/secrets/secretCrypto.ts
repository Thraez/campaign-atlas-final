/**
 * Shared AES-256-GCM encrypt/decrypt module.
 * Uses the Web Crypto API (crypto.subtle) — available in both Node 20+ and modern browsers.
 * Build-time: encrypt. Browser-time: decrypt. One file, no polyfill needed.
 *
 * Key derivation: PBKDF2-SHA-256, 600k iterations. The salt and IV are random
 * per secret, stored alongside the ciphertext in the player atlas.json as base64.
 * Plaintext, passphrase, and character keys never appear in any output blob.
 */

export interface SecretBlob {
  id: string;
  lockType: "password" | "character";
  teaser?: string;
  salt: string; // base64, 16 random bytes
  iv: string; // base64, 12 random bytes
  ciphertext: string; // base64( AES-GCM output || 16-byte auth tag )
}

const PBKDF2_ITERATIONS = 600_000;

// Base64 via atob/btoa, NOT Node's Buffer. Both encrypt (build-time, Node) and
// decrypt (runtime, browser) share this file, and `Buffer` is a Node global that
// Vite does not polyfill — it survived into the player bundle as a bare
// reference, threw ReferenceError inside decryptSecret's try, and got swallowed
// by the `catch { return null }` below. Every correct passphrase read as wrong.
// The unit tests missed it because Vitest runs in Node, where Buffer exists.
// atob/btoa are global in browsers and in Node 16+, so one implementation
// covers both. src/test/browser-safe-globals.test.ts keeps it that way.
function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  plaintext: string,
  passphrase: string,
): Promise<{ salt: string; iv: string; ciphertext: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ct)),
  };
}

export async function decryptSecret(blob: SecretBlob, passphrase: string): Promise<string | null> {
  try {
    const key = await deriveKey(passphrase, b64ToBytes(blob.salt));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(blob.iv) },
      key,
      b64ToBytes(blob.ciphertext),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
