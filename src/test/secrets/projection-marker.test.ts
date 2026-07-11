import { describe, it, expect } from "vitest";
import {
  projectEntityForPlayer,
  buildProjectionContext,
} from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

function entity(body: string, secrets: Entity["secrets"]): Entity {
  return {
    id: "corven",
    title: "Corven",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body,
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "",
    links: [],
    backlinks: [],
    secrets,
  } as Entity;
}

describe("projectEntityForPlayer secret marker substitution", () => {
  it("replaces a {{secret:id}} marker with a placeholder span carrying the id", () => {
    const e = entity("Ledgers. {{secret:signet}} Done.", [
      { id: "signet", lockType: "character", salt: "Q", iv: "Q", ciphertext: "Q" },
    ]);
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const out = projectEntityForPlayer(e, ctx);
    expect(out.bodyHtml).toContain('data-secret-id="signet"');
    expect(out.bodyHtml).not.toContain("{{secret:");
  });

  it("drops orphan markers whose id has no matching secret blob", () => {
    const e = entity("Text {{secret:orphan}} here.", []);
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const out = projectEntityForPlayer(e, ctx);
    expect(out.bodyHtml).not.toContain("{{secret:");
    expect(out.bodyHtml).not.toContain("orphan");
  });

  it("handles multiple distinct markers in one body", () => {
    const e = entity("A {{secret:s1}} B {{secret:s2}} C", [
      { id: "s1", lockType: "password", salt: "Q", iv: "Q", ciphertext: "Q" },
      { id: "s2", lockType: "character", salt: "Q", iv: "Q", ciphertext: "Q" },
    ]);
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const out = projectEntityForPlayer(e, ctx);
    expect(out.bodyHtml).toContain('data-secret-id="s1"');
    expect(out.bodyHtml).toContain('data-secret-id="s2"');
    expect(out.bodyHtml).not.toContain("{{secret:");
  });
});
