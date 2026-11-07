/**
 * eval-50: Publish Check's wikilink and relationship leak rules match the
 * strict player build. The build ships only notes that are player-visible and
 * not `atlas.publish: false`; a shipped note's wikilink to any other note is a
 * cross-ref leak (exit 8), and a player-visible relationship to a note that
 * doesn't ship, unknown ones included, is a relationship leak (exit 5).
 */
import { describe, it, expect } from "vitest";
import { validateProject } from "@/atlas/yaml/validateProject";
import type { AtlasProject, Entity } from "@/atlas/content/schema";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";

function entity(over: Partial<Entity> = {}): Entity {
  return {
    id: "e1",
    title: "E1",
    type: "settlement",
    visibility: "player",
    aliases: [],
    tags: [],
    summary: "x",
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "x.md",
    links: [],
    backlinks: [],
    ...over,
  };
}

const project = (entities: Entity[]): AtlasProject => ({
  version: "1.0.0",
  publishedAt: new Date().toISOString(),
  worlds: [{ id: "w1", name: "W" }],
  maps: [],
  entities,
  placements: [],
  assets: [],
});

const unpublished = { atlas: { publish: false } };

function linkTo(id: string, title = id) {
  return [{ target: title, resolvedId: id, display: title, broken: false }];
}

function rel(entityId: string, visibility: EntityRelationship["visibility"] = "player") {
  return [{ entity: entityId, type: "knows", visibility }];
}

function issues(entities: Entity[], code: string) {
  return validateProject({ project: project(entities), draftPlacements: [] }).issues.filter(
    (i) => i.code === code,
  );
}

describe("Publish Check wikilink leaks match the build (eval-50)", () => {
  it("blocks a rumor note that wikilinks a dm note", () => {
    const found = issues(
      [
        entity({ id: "boss", title: "Boss", visibility: "dm" }),
        entity({ id: "tale", visibility: "rumor", links: linkTo("boss", "Boss") }),
      ],
      "spoiler-leak-wikilink",
    );
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("blocking");
    expect(found[0].scope?.entityId).toBe("tale");
  });

  it("blocks a wikilink to a player note marked publish: false", () => {
    const found = issues(
      [
        entity({ id: "draft", visibility: "player", frontmatter: unpublished }),
        entity({ id: "town", links: linkTo("draft") }),
      ],
      "spoiler-leak-wikilink",
    );
    expect(found.map((i) => i.severity)).toEqual(["blocking"]);
  });

  it("blocks a wikilink to a folder-excluded note (resolved, but not an entity)", () => {
    const found = issues(
      [entity({ id: "town", links: linkTo("dm-folder-note") })],
      "spoiler-leak-wikilink",
    );
    expect(found.map((i) => i.severity)).toEqual(["blocking"]);
  });

  it("passes a wikilink to a shipped note, and ignores broken links", () => {
    const found = issues(
      [
        entity({ id: "inn", visibility: "rumor" }),
        entity({
          id: "town",
          links: [...linkTo("inn"), { target: "Nowhere", display: "Nowhere", broken: true }],
        }),
      ],
      "spoiler-leak-wikilink",
    );
    expect(found).toEqual([]);
  });

  it("does not check a dm note's own wikilinks", () => {
    const found = issues(
      [
        entity({ id: "boss", visibility: "dm" }),
        entity({ id: "lair", visibility: "hidden", links: linkTo("boss") }),
      ],
      "spoiler-leak-wikilink",
    );
    expect(found).toEqual([]);
  });
});

describe("Publish Check relationship leaks match the build (eval-50)", () => {
  it("blocks a player relationship to an unknown entity, and still warns it is unresolved", () => {
    const entities = [entity({ id: "guard", relationships: rel("ghost") })];
    expect(issues(entities, "spoiler-leak-relationship").map((i) => i.severity)).toEqual([
      "blocking",
    ]);
    expect(issues(entities, "relationship-unresolved")).toHaveLength(1);
  });

  it("blocks a player relationship to a note marked publish: false", () => {
    const found = issues(
      [
        entity({ id: "draft", visibility: "player", frontmatter: unpublished }),
        entity({ id: "guard", relationships: rel("draft", "rumor") }),
      ],
      "spoiler-leak-relationship",
    );
    expect(found.map((i) => i.severity)).toEqual(["blocking"]);
  });

  it("does not block a dm relationship to an unknown entity (the build drops it)", () => {
    const entities = [entity({ id: "guard", relationships: rel("ghost", "dm") })];
    expect(issues(entities, "spoiler-leak-relationship")).toEqual([]);
    expect(issues(entities, "relationship-unresolved")).toHaveLength(1);
  });
});

describe("Notes that don't ship are not judged (eval-50)", () => {
  it("a publish: false player note linking and relating to a dm note gets no spoiler-leak", () => {
    const entities = [
      entity({ id: "boss", title: "Boss", visibility: "dm" }),
      entity({
        id: "draft",
        visibility: "player",
        frontmatter: unpublished,
        links: linkTo("boss", "Boss"),
        relationships: rel("boss"),
      }),
    ];
    const r = validateProject({ project: project(entities), draftPlacements: [] });
    expect(r.issues.filter((i) => i.code.startsWith("spoiler-leak"))).toEqual([]);
  });
});
