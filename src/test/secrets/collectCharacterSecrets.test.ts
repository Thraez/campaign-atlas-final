import { it, expect } from "vitest";
import { encryptSecret } from "@/atlas/secrets/secretCrypto";
import { collectCharacterSecrets } from "@/atlas/secrets/collectCharacterSecrets";
import type { Entity } from "@/atlas/content/schema";

function makeEntity(over: Partial<Entity> = {}): Entity {
  return {
    id: "e1",
    title: "Entity",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/w/npcs/e1.md",
    links: [],
    backlinks: [],
    ...over,
  };
}

it("returns only the secrets the key decrypts", async () => {
  const mine = await encryptSecret("you buried it at the keep", "vesper-key");
  const theirs = await encryptSecret("not yours", "other-key");
  const entities: Entity[] = [
    makeEntity({
      id: "keep",
      title: "The Keep",
      secrets: [{ id: "a", lockType: "character", ...mine }],
    }),
    makeEntity({ id: "x", title: "X", secrets: [{ id: "b", lockType: "character", ...theirs }] }),
  ];
  const found = await collectCharacterSecrets(entities, "vesper-key");
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ entityId: "keep", entityTitle: "The Keep" });
  expect(found[0].html).toContain("buried");
});

it("returns empty when no entities have character secrets", async () => {
  const entities: Entity[] = [makeEntity({ id: "place", title: "Place", secrets: [] })];
  const found = await collectCharacterSecrets(entities, "any-key");
  expect(found).toHaveLength(0);
});

it("handles entities with no secrets field (undefined)", async () => {
  const entities: Entity[] = [makeEntity({ id: "place", title: "Place" })];
  const found = await collectCharacterSecrets(entities, "any-key");
  expect(found).toHaveLength(0);
});

it("skips password-lock secrets", async () => {
  const blob = await encryptSecret("password guarded", "vesper-key");
  const entities: Entity[] = [
    makeEntity({ id: "e", title: "E", secrets: [{ id: "p", lockType: "password", ...blob }] }),
  ];
  const found = await collectCharacterSecrets(entities, "vesper-key");
  expect(found).toHaveLength(0);
});
