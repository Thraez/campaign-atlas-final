import { describe, it, expect } from "vitest";
import { buildEntitySecrets } from "../../../scripts/atlas/buildSecrets";
import { decryptSecret } from "@/atlas/secrets/secretCrypto";
import type { AtlasSecretSpec } from "../../../scripts/atlas/parseFrontmatter";

describe("buildEntitySecrets", () => {
  const keys = new Map<string, string>([["vesper", "vesper-key-123"]]);

  it("encrypts a password secret; decrypts with correct password, not wrong one", async () => {
    const specs: AtlasSecretSpec[] = [
      { id: "ward", password: "the tide", reveal: "the ward answers", teaser: "hint" },
    ];
    const { secrets, warnings } = await buildEntitySecrets("corven", specs, keys);
    expect(warnings).toHaveLength(0);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ id: "ward", lockType: "password", teaser: "hint" });
    expect(JSON.stringify(secrets[0]).includes("the ward answers")).toBe(false);
    expect(await decryptSecret(secrets[0], "the tide")).toBe("the ward answers");
    expect(await decryptSecret(secrets[0], "wrong")).toBeNull();
  });

  it("encrypts a character secret under that character's key", async () => {
    const specs: AtlasSecretSpec[] = [{ id: "signet", for: "vesper", reveal: "you know the ring" }];
    const { secrets } = await buildEntitySecrets("corven", specs, keys);
    expect(secrets[0].lockType).toBe("character");
    expect(secrets[0].teaser).toBeUndefined();
    expect(await decryptSecret(secrets[0], "vesper-key-123")).toBe("you know the ring");
  });

  it("warns and skips a character secret whose key is missing", async () => {
    const specs: AtlasSecretSpec[] = [{ id: "x", for: "nobody", reveal: "r" }];
    const { secrets, warnings } = await buildEntitySecrets("corven", specs, keys);
    expect(secrets).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/no character key for "nobody"/);
  });

  it("does not include reveal, password, or for in output blobs", async () => {
    const specs: AtlasSecretSpec[] = [{ id: "w", password: "pw", reveal: "secret text" }];
    const { secrets } = await buildEntitySecrets("e", specs, keys);
    const raw = JSON.stringify(secrets[0]);
    expect(raw.includes("secret text")).toBe(false);
    expect(raw.includes("pw")).toBe(false);
  });
});
