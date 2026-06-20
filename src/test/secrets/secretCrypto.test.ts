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
});
