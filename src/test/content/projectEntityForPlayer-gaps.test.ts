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

  it("heading-anchor wikilink to a dm-only note is redacted from body, bodyHtml, and links (Q48)", () => {
    // [[SecretNote#Heading]] now resolves via the file part ("SecretNote") instead of
    // being left permanently broken — must still be caught by the same secretIds redaction
    // path so the DM-only note's name never leaks through the heading-anchor resolver seam.
    const hidden = ent({ id: "secretnote", title: "SecretNote", visibility: "dm" });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "See [[SecretNote#Heading]] for details." });
    const all = new Map([[hidden.id, hidden], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.body).not.toContain("SecretNote");
    expect(p.body).toContain("…");
    expect(p.bodyHtml).not.toContain("SecretNote");
    expect(p.links[0].target).toBe("");
    expect(p.links[0].resolvedId).toBeUndefined();
    expect(p.links[0].broken).toBe(true);
  });

  it("same-note anchor [[#Heading]] is never treated as a secret leak", () => {
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      body: "See [[#Backstory]] below." });
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(p.bodyHtml).toContain("atlas-wikilink-anchor");
    expect(p.bodyHtml).toContain("Backstory");
    expect(p.links[0].broken).toBe(false);
  });

  it("folder-path wikilink to a dm-only note is redacted from body, bodyHtml, and links (Q49)", () => {
    // [[Folder/SecretNote]] now rescues via the trailing basename ("SecretNote") when the
    // basename is unique — must still be caught by the same secretIds redaction path so the
    // DM-only note's name never leaks through the folder-path resolver seam.
    const hidden = ent({ id: "secretnote", title: "SecretNote", visibility: "dm" });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "See [[02_Regions/SecretNote]] for details." });
    const all = new Map([[hidden.id, hidden], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.body).not.toContain("SecretNote");
    expect(p.body).toContain("…");
    expect(p.bodyHtml).not.toContain("SecretNote");
    expect(p.links[0].target).toBe("");
    expect(p.links[0].resolvedId).toBeUndefined();
    expect(p.links[0].broken).toBe(true);
  });

  it("ambiguous folder-path basename (two entities share the same title) never resolves — stays broken", () => {
    // Two distinct entities both titled "Tidemarrow" in different folders: the basename
    // "Tidemarrow" is ambiguous, so buildProjectionContext's resolveByBasename must refuse
    // rather than silently picking whichever entity happened to register last.
    const a = ent({ id: "tidemarrow-a", title: "Tidemarrow", visibility: "player",
      sourcePath: "content/w/regions/tidemarrow.md" });
    const b = ent({ id: "tidemarrow-b", title: "Tidemarrow", visibility: "player",
      sourcePath: "content/w/drafts/tidemarrow.md" });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "Born in [[02_Regions/Tidemarrow]]." });
    const all = new Map([[a.id, a], [b.id, b], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.links[0].resolvedId).toBeUndefined();
    expect(p.links[0].broken).toBe(true);
  });

  it("unambiguous folder-path wikilink to a player-visible note resolves normally (no redaction)", () => {
    const target = ent({ id: "tidemarrow", title: "Tidemarrow", visibility: "player" });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "Born in [[02_Regions/Tidemarrow]]." });
    const all = new Map([[target.id, target], [pub.id, pub]]);
    const p = projectEntityForPlayer(pub, buildProjectionContext(all));
    expect(p.links[0].resolvedId).toBe("tidemarrow");
    expect(p.links[0].broken).toBe(false);
    expect(p.bodyHtml).toContain("Tidemarrow");
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

describe("projectEntityForPlayer — branch gaps (N89)", () => {
  it("orphan {{secret:id}} marker (id not in entity.secrets) is dropped from bodyHtml", () => {
    // The `if (!knownSecretIds.has(id)) return ""` branch drops markers whose id has
    // no matching entry in entity.secrets (e.g. a stale reference after a secret is deleted).
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      body: "{{secret:orphan-id}}\n\nPublic text.",
      secrets: [{ id: "other-id", lockType: "character", salt: "s", iv: "iv", ciphertext: "ct" }],
    });
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(p.bodyHtml).not.toContain("atlas-secret-block");
    expect(p.bodyHtml).not.toContain("orphan-id");
    expect(p.bodyHtml).toContain("Public text.");
  });

  it("{{secret:id}} markers are all dropped when entity.secrets is undefined", () => {
    // entity.secrets ?? [] yields an empty Set, so every marker is an orphan.
    // Guards both the null-coalescing and the orphan-drop branch together.
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      body: "{{secret:s1}}\n\nSome lore.",
      // secrets intentionally omitted → undefined
    });
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(p.bodyHtml).not.toContain("atlas-secret-block");
    expect(p.bodyHtml).not.toContain("s1");
    expect(p.bodyHtml).toContain("Some lore.");
  });

  it("empty relationships array is preserved as [] (filter block is skipped)", () => {
    // `if (relationships && relationships.length > 0)` is falsy for [], so the array
    // passes through unchanged — the output is [] not undefined.
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      relationships: [] as Entity["relationships"],
    });
    const ctx = buildProjectionContext(new Map([[e.id, e]]));
    const p = projectEntityForPlayer(e, ctx);
    expect(Array.isArray(p.relationships)).toBe(true);
    expect(p.relationships).toHaveLength(0);
  });

  it("%%dm%% content in a relationship description is stripped", () => {
    // `if (r.description) r.description = stripDmFromShippingString(r.description) ?? r.description`
    // r.label stripping is already tested (N34); r.description is a sibling branch not yet covered.
    const ally = ent({ id: "ally", title: "Ally", visibility: "player" });
    const e = ent({ id: "npc", title: "NPC", visibility: "player",
      relationships: [
        { type: "ally", entity: "ally", label: "public ally",
          description: "%%classified info%% old friends", visibility: "player" },
      ] as Entity["relationships"],
    });
    const all = new Map([[ally.id, ally], [e.id, e]]);
    const p = projectEntityForPlayer(e, buildProjectionContext(all));
    const rel = p.relationships?.[0];
    expect(rel?.description).not.toContain("%%");
    expect(rel?.description).not.toContain("classified info");
    expect(rel?.description).toContain("old friends");
  });
});
