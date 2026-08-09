import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, type SecretBlob } from "@/atlas/secrets/secretCrypto";

describe("secretCrypto", () => {
  it("round-trips plaintext through encrypt/decrypt", async () => {
    const plain = "the ward answers";
    const pw = "the tide";
    const blob = await encryptSecret(plain, pw);
    const fakeBlob: SecretBlob = { id: "test", lockType: "password", ...blob };
    expect(await decryptSecret(fakeBlob, pw)).toBe(plain);
  });

  it("returns null on wrong passphrase", async () => {
    const blob = await encryptSecret("hello", "correct");
    const fakeBlob: SecretBlob = { id: "test", lockType: "password", ...blob };
    expect(await decryptSecret(fakeBlob, "wrong")).toBeNull();
  });

  it("produces different ciphertext on each call (random salt/iv)", async () => {
    const b1 = await encryptSecret("same", "key");
    const b2 = await encryptSecret("same", "key");
    expect(b1.salt).not.toBe(b2.salt);
    expect(b1.ciphertext).not.toBe(b2.ciphertext);
  });

  it("output salt decodes to 16 bytes and iv decodes to 12 bytes", async () => {
    const blob = await encryptSecret("test", "pass");
    expect(Buffer.from(blob.salt, "base64").length).toBe(16);
    expect(Buffer.from(blob.iv, "base64").length).toBe(12);
  });

  it("round-trips empty string plaintext", async () => {
    const blob = await encryptSecret("", "passphrase");
    const fakeBlob: SecretBlob = { id: "empty", lockType: "password", ...blob };
    expect(await decryptSecret(fakeBlob, "passphrase")).toBe("");
  });

  it("round-trips unicode / multi-byte plaintext", async () => {
    const plain = "Ëlfhëim 🗡️ — the ward holds";
    const blob = await encryptSecret(plain, "unicode-key");
    const fakeBlob: SecretBlob = { id: "uni", lockType: "character", ...blob };
    expect(await decryptSecret(fakeBlob, "unicode-key")).toBe(plain);
  });

  // Regression: base64 used to go through Node's `Buffer`, which does not exist
  // in a browser and which Vite does not polyfill. decryptSecret swallows every
  // throw as "wrong passphrase", so players saw correct keys silently rejected
  // while these Node-hosted tests stayed green.
  //
  // Deleting globalThis.Buffer to reproduce the browser here does work, but it
  // also breaks Vitest's own internals (~2,300 unhandled "Buffer is not defined"
  // errors from the reporter). The invariant is enforced statically instead —
  // see src/test/browser-safe-globals.test.ts.
  it("encodes base64 without touching Node's Buffer", async () => {
    const blob = await encryptSecret("round trip", "k");
    const fakeBlob: SecretBlob = { id: "b64", lockType: "password", ...blob };
    // atob/btoa produce standard base64: decodable by an independent decoder.
    expect(Buffer.from(blob.salt, "base64").toString("base64")).toBe(blob.salt);
    expect(await decryptSecret(fakeBlob, "k")).toBe("round trip");
  });
});
