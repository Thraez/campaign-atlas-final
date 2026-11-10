/**
 * R-11c: the old Publish Check reads what ships from the resolver. Orphan
 * `notes:` entries block, naming world and key; a project the resolver can't
 * take fails closed. The v1 adapter never writes `notes:` entries, so the
 * orphan case swaps in a resolver that reports one.
 */
import { describe, expect, it, vi } from "vitest";
import type { AtlasProject, Entity, MapDocument } from "@/atlas/content/schema";

const orphans = vi.hoisted(() => ({ list: [] as { world: string; entry: string }[] }));

vi.mock("@/atlas/content/resolveCampaign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/content/resolveCampaign")>();
  return {
    ...actual,
    resolveCampaign: (...args: Parameters<typeof actual.resolveCampaign>) => ({
      ...actual.resolveCampaign(...args),
      orphanEntries: orphans.list,
    }),
  };
});

import { validateProject } from "@/atlas/yaml/validateProject";

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

const map = (id: string): MapDocument => ({
  id,
  worldId: "w1",
  name: id,
  width: 100,
  height: 100,
  layers: [],
});

const project = (over: Partial<AtlasProject> = {}): AtlasProject => ({
  version: "1.0.0",
  publishedAt: "2026-11-08T00:00:00.000Z",
  worlds: [{ id: "w1", name: "W" }],
  maps: [map("m1")],
  entities: [],
  placements: [],
  assets: [],
  ...over,
});

describe("orphan notes: entries block the Publish Check (R-11c)", () => {
  it("one blocking issue per orphan entry, naming the world and the key", () => {
    orphans.list = [
      { world: "w1", entry: "Black Spire" },
      { world: "w1", entry: "old-keep" },
    ];
    const r = validateProject({ project: project(), draftPlacements: [] });
    const hits = r.issues.filter((i) => i.code === "orphan-notes-entry");
    expect(hits.map((i) => i.severity)).toEqual(["blocking", "blocking"]);
    expect(hits[0].message).toContain('world "w1"');
    expect(hits[0].message).toContain('"Black Spire"');
    expect(hits[1].message).toContain('"old-keep"');
    expect(r.passedChecks).not.toContain("No blocking issues");
  });

  it("no orphan entries, no issue", () => {
    orphans.list = [];
    const r = validateProject({ project: project(), draftPlacements: [] });
    expect(r.issues.filter((i) => i.code === "orphan-notes-entry")).toEqual([]);
  });
});

describe("a project the resolver can't take fails closed (R-11c)", () => {
  it("blocks, and treats every note as hidden", () => {
    orphans.list = [];
    const r = validateProject({
      project: project({
        maps: [map("m1"), map("m1")],
        entities: [
          entity({ id: "inn" }),
          entity({
            id: "town",
            links: [{ target: "Inn", resolvedId: "inn", display: "Inn", broken: false }],
          }),
        ],
      }),
      draftPlacements: [],
    });
    const codes = r.issues.filter((i) => i.severity === "blocking").map((i) => i.code);
    expect(codes).toContain("duplicate-map-id");
    expect(codes).toContain("visibility-unresolved");
    // Nothing is known to ship, so no "player-visible" leak verdicts are given.
    expect(codes).not.toContain("spoiler-leak-wikilink");
  });
});
