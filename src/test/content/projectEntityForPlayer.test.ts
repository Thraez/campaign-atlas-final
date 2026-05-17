import { describe, it, expect } from "vitest";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id, title: p.title, type: p.type ?? "npc", visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [], tags: p.tags ?? [], images: p.images ?? [],
    body: p.body ?? "", bodyHtml: p.bodyHtml ?? "", frontmatter: p.frontmatter ?? { secret: 1 },
    sourcePath: p.sourcePath ?? "content/w/npcs/x.md", links: p.links ?? [],
    backlinks: p.backlinks ?? [], summary: p.summary, race: p.race,
    profile: p.profile, relationships: p.relationships, canon: p.canon, world: p.world,
  } as Entity;
}

describe("projectEntityForPlayer", () => {
  it("strips %%dm%% from body, clears frontmatter and sourcePath", () => {
    const corven = ent({ id: "corven", title: "Corven", visibility: "dm",
      body: "Public line.\n\n%%\nsecret plan\n%%\n\nMore public." });
    const all = new Map([[corven.id, corven]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(corven, ctx);
    expect(p.body).not.toContain("secret plan");
    expect(p.bodyHtml).not.toContain("secret plan");
    expect(p.bodyHtml).toContain("Public line.");
    expect(p.frontmatter).toEqual({});
    expect(p.sourcePath).toBe("");
  });
  it("redacts a wikilink that points at a hidden entity to the build marker", () => {
    const hidden = ent({ id: "soreth", title: "Soreth", visibility: "dm" });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "Edric fears [[Soreth]] greatly." });
    const all = new Map([[hidden.id, hidden], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.body).not.toContain("[[Soreth]]");
    expect(p.body).toContain("…");
    expect(p.bodyHtml).not.toContain("Soreth");
  });
  it("scrubs meta tags and dedups the title-alias, drops dm relationships", () => {
    const hidden = ent({ id: "soreth", title: "Soreth", visibility: "dm" });
    const e = ent({ id: "edric", title: "Edric", visibility: "player",
      tags: ["npc", "smuggler", "Edric"], aliases: ["Edric", "The Knife"],
      relationships: [
        { type: "ally", entity: "soreth", label: "secret backer", visibility: "player" },
        { type: "rival", entity: "edric2", label: "open rival", visibility: "player" },
      ] });
    const e2 = ent({ id: "edric2", title: "Edric Two", visibility: "player" });
    const all = new Map([[hidden.id, hidden], [e.id, e], [e2.id, e2]]);
    const p = projectEntityForPlayer(e, buildProjectionContext(all));
    expect(p.tags).not.toContain("npc");          // META tag scrubbed
    expect(p.tags).toContain("smuggler");
    expect(p.aliases).not.toContain("Edric");     // title-alias deduped
    expect((p.relationships ?? []).some((r) => r.entity === "soreth")).toBe(false);
    expect((p.relationships ?? []).some((r) => r.entity === "edric2")).toBe(true);
  });
});
