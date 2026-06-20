import { it, expect } from "vitest";
import { encryptSecret } from "@/atlas/secrets/secretCrypto";
import { collectCharacterSecrets } from "@/atlas/secrets/collectCharacterSecrets";
import type { Entity } from "@/atlas/content/schema";

it("returns only the secrets the key decrypts", async () => {
  const mine = await encryptSecret("you buried it at the keep", "vesper-key");
  const theirs = await encryptSecret("not yours", "other-key");
  const entities: Entity[] = [
    { id: "keep", title: "The Keep", secrets: [{ id: "a", lockType: "character", ...mine }] } as Entity,
    { id: "x", title: "X", secrets: [{ id: "b", lockType: "character", ...theirs }] } as Entity,
  ];
  const found = await collectCharacterSecrets(entities, "vesper-key");
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ entityId: "keep", entityTitle: "The Keep" });
  expect(found[0].html).toContain("buried");
});

it("returns empty when no entities have character secrets", async () => {
  const entities: Entity[] = [
    { id: "place", title: "Place", secrets: [] } as Entity,
  ];
  const found = await collectCharacterSecrets(entities, "any-key");
  expect(found).toHaveLength(0);
});

it("skips password-lock secrets", async () => {
  const blob = await encryptSecret("password guarded", "vesper-key");
  const entities: Entity[] = [
    { id: "e", title: "E", secrets: [{ id: "p", lockType: "password", ...blob }] } as Entity,
  ];
  const found = await collectCharacterSecrets(entities, "vesper-key");
  expect(found).toHaveLength(0);
});
