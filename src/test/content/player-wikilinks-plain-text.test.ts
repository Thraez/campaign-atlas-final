// @vitest-environment node
/**
 * Q-01: in the player view a wikilink either opens (`#/entity/<id>` to a
 * shipped note) or is plain text. Never a dead "Planned link", never an id,
 * href or title for a note the player cannot see.
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { buildAtlas } from "../../../scripts/build-atlas";
import {
  projectEntityForPlayer,
  buildProjectionContext,
} from "@/atlas/content/projectEntityForPlayer";
import type { AtlasProject, Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id, title: p.title, type: "npc", visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [], tags: [], images: [], body: p.body ?? "", bodyHtml: "",
    frontmatter: {}, sourcePath: "content/w/x.md", links: [], backlinks: [],
  } as unknown as Entity;
}

function playerHtml(source: Entity, others: Entity[]): string {
  const all = new Map([source, ...others].map((e) => [e.id, e]));
  return projectEntityForPlayer(source, buildProjectionContext(all)).bodyHtml;
}

describe("player wikilinks (unit)", () => {
  const mayor = ent({ id: "mayor", title: "Mayor", aliases: ["Her Honour"] });
  const khal = ent({ id: "khal-azum", title: "Khal Azum", visibility: "dm" });

  it("a link to a player note is an anchor to #/entity/<id>", () => {
    const html = playerHtml(ent({ id: "a", title: "A", body: "See [[Mayor]]." }), [mayor]);
    expect(html).toContain('href="#/entity/mayor"');
    expect(html).toContain(">Mayor</a>");
  });

  it("a link by alias resolves to the same anchor", () => {
    const html = playerHtml(ent({ id: "a", title: "A", body: "See [[Her Honour]]." }), [mayor]);
    expect(html).toContain('href="#/entity/mayor"');
  });

  it("a link to a note that does not exist is plain text", () => {
    const html = playerHtml(ent({ id: "a", title: "A", body: "See [[The Old Keep]]." }), [mayor]);
    expect(html.trim()).toBe("<p>See The Old Keep.</p>");
  });

  it("a link to a DM-only note is plain text with no id, href or title", () => {
    const html = playerHtml(ent({ id: "a", title: "A", body: "Fear [[Khal Azum]]." }), [khal]);
    expect(html).not.toMatch(/<a |<span|href|title=|data-entity-id|khal-azum/i);
    expect(html).not.toContain("Khal Azum");
  });
});

describe("player wikilinks (sample content)", () => {
  let player: AtlasProject;

  beforeAll(async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    player = (await buildAtlas(repoRoot, { player: true, strict: false })).project;
  });

  it("no player body says 'Planned link' or carries a planned-link class", () => {
    expect(player.entities.length).toBeGreaterThan(0);
    for (const e of player.entities) {
      expect(e.bodyHtml, e.id).not.toMatch(/planned[- ]link/i);
    }
  });

  it("every #/entity/<id> link points at an entity in the player atlas", () => {
    const ids = new Set(player.entities.map((e) => e.id));
    let anchors = 0;
    for (const e of player.entities) {
      for (const m of e.bodyHtml.matchAll(/href="#\/entity\/([^"]+)"/g)) {
        anchors++;
        expect(ids.has(decodeURIComponent(m[1])), `${e.id} -> ${m[1]}`).toBe(true);
      }
    }
    expect(anchors).toBeGreaterThan(0);
  });
});
