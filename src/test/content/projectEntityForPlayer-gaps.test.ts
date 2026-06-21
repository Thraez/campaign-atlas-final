import { describe, it, expect } from "vitest";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id, title: p.title, type: p.type ?? "npc", visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [], tags: p.tags ?? [], images: p.images ?? [],
    body: p.body ?? "", bodyHtml: p.bodyHtml ?? "", frontmatter: p.frontmatter ?? {},
    sourcePath: p.sourcePath ?? "content/w/npcs/x.md", links: p.links ?? [],
    backlinks: p.backlinks ?? [], summary: p.summary, race: p.race,
    profile: p.profile, relationships: p.relationships, secrets: p.secrets,
  } as Entity;
}

describe("projectEntityForPlayer — branch gaps (N34)", () => {
  it("buildProjectionContext: alias-based [[Alias]] wikilink to a secret entity is redacted", () => {
    // The alias path in buildProjectionContext (nameIndex.set(a.toLowerCase(), e.id))
    // must wire into the secretIds check so [[AliasName]] is treated the same as [[Title]].
    const hidden = ent({ id: "soreth", title: "Soreth", visibility: "dm", aliases: ["The Shadow"] });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "Edric fears [[The Shadow]]." });
    const all = new Map([[hidden.id, hidden], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.body).not.toContain("[[The Shadow]]");
    expect(p.body).toContain("…");
    expect(p.bodyHtml).not.toContain("Shadow");
  });

  it("rumor-visibility entity is NOT in secretIds — wikilink to it is preserved (security invariant)", () => {
    // PLAYER_VISIBLE = { "player", "rumor" }; rumor entities must not be redacted.
    const rumor = ent({ id: "ghost", title: "The Ghost", visibility: "rumor" });
    const pub = ent({ id: "npc", title: "NPC", visibility: "player",
      body: "Seen near [[The Ghost]]." });
    const all = new Map([[rumor.id, rumor], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.body).not.toContain("…");
    expect(p.bodyHtml).toContain("The Ghost");
  });

  it("all relationships filtered out → relationships is undefined, not empty array", () => {
    // kept.length > 0 ? kept : undefined — the undefined branch is only hit when ALL
    // relationships are dropped; the existing test always keeps at least one.
    const hidden = ent({ id: "secret", title: "Secret", visibility: "dm" });
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      relationships: [
        { type: "ally", entity: "secret", label: "hidden backer", visibility: "player" },
      ] as Entity["relationships"] });
    const all = new Map([[hidden.id, hidden], [e.id, e]]);
    const p = projectEntityForPlayer(e, buildProjectionContext(all));
    expect(p.relationships).toBeUndefined();
  });

  it("%%dm%% content in a relationship label is stripped", () => {
    // r.label = stripDmFromShippingString(r.label) ?? r.label at line 141.
    const ally = ent({ id: "ally", title: "Ally", visibility: "player" });
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      relationships: [
        { type: "ally", entity: "ally", label: "%%secret motive%% public ally", visibility: "player" },
      ] as Entity["relationships"] });
    const all = new Map([[ally.id, ally], [e.id, e]]);
    const p = projectEntityForPlayer(e, buildProjectionContext(all));
    const rel = p.relationships?.[0];
    expect(rel?.label).not.toContain("%%");
    expect(rel?.label).not.toContain("secret motive");
  });

  it("%%dm%% content in entity.summary is stripped", () => {
    // strip(entity.summary) at line 169.
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      summary: "%%hidden detail%% brave warrior" });
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(p.summary).not.toContain("%%");
    expect(p.summary).not.toContain("hidden detail");
    expect(p.summary).toContain("brave warrior");
  });

  it("%%dm%% content in entity.race is stripped", () => {
    // strip(entity.race) at line 170.
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      race: "%%secretly a vampire%% Human" });
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(p.race).not.toContain("%%");
    expect(p.race).not.toContain("secretly a vampire");
  });

  it('secret id containing a double-quote is html-escaped in the data-secret-id attribute (XSS guard)', () => {
    // id.replace(/"/g, "&quot;") at line 95 — an unescaped " in the id would break
    // the attribute boundary and create an XSS injection vector.
    const e: Entity = {
      id: "npc", title: "NPC", type: "npc", visibility: "player",
      aliases: [], tags: [], images: [], body: '{{secret:sig"xss}}',
      bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [],
      secrets: [{ id: 'sig"xss', lockType: "character", salt: "s", iv: "iv", ciphertext: "ct" }],
    } as Entity;
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(p.bodyHtml).toContain('data-secret-id="sig&quot;xss"');
    expect(p.bodyHtml).not.toContain('data-secret-id="sig"xss"');
  });
});
