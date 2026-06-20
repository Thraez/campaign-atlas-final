import { it, expect } from "vitest";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

it("player projection seals secrets (placeholder only, no plaintext)", () => {
  const e = {
    id: "c",
    title: "C",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "x {{secret:s}}",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "",
    links: [],
    backlinks: [],
    secrets: [{ id: "s", lockType: "character", salt: "Q", iv: "Q", ciphertext: "Q" }],
  } as Entity;
  const out = projectEntityForPlayer(e, buildProjectionContext(new Map([[e.id, e]])));
  expect(out.bodyHtml).toContain('data-secret-id="s"');
  expect(out.bodyHtml).not.toContain("{{secret:");
});
