import { describe, it, expect } from "vitest";
import {
  ALLOWED_FOLDERS,
  inferTargetFolder,
  computeTargetPath,
  isAllowedTargetPath,
  buildStagingRow,
  buildStagingRows,
  updateStagingRow,
  type StagingRow,
} from "@/atlas/import/stagingState";

const WORLD = "astrath-deeprealm";

describe("inferTargetFolder", () => {
  it("maps settlement-like types to places/", () => {
    expect(inferTargetFolder("settlement")).toBe("places");
    expect(inferTargetFolder("ruin")).toBe("places");
    expect(inferTargetFolder("dungeon")).toBe("places");
    expect(inferTargetFolder("location")).toBe("places");
    expect(inferTargetFolder("map_note")).toBe("places");
  });
  it("maps people, factions, items, events, regions to their own folders", () => {
    expect(inferTargetFolder("npc")).toBe("people");
    expect(inferTargetFolder("faction")).toBe("factions");
    expect(inferTargetFolder("item")).toBe("items");
    expect(inferTargetFolder("event")).toBe("events");
    expect(inferTargetFolder("region")).toBe("regions");
  });
  it("falls back to imports/ for unknown or missing types", () => {
    expect(inferTargetFolder("")).toBe("imports");
    expect(inferTargetFolder("note")).toBe("imports");
    expect(inferTargetFolder("mystery-meat")).toBe("imports");
  });
});

describe("computeTargetPath", () => {
  it("joins worldId, folder, and slug into a content/.../<file>.md", () => {
    expect(computeTargetPath(WORLD, "places", "thornhold")).toBe(
      "content/astrath-deeprealm/places/thornhold.md",
    );
  });
  it("slugifies the stem (lowercases, replaces non-alnum, strips diacritics)", () => {
    expect(computeTargetPath(WORLD, "people", "Garron the Bold")).toBe(
      "content/astrath-deeprealm/people/garron-the-bold.md",
    );
    expect(computeTargetPath(WORLD, "places", "Côte D'Azur Stronghold")).toBe(
      "content/astrath-deeprealm/places/cote-dazur-stronghold.md",
    );
  });
});

describe("isAllowedTargetPath", () => {
  it("accepts paths in the seven allowlisted folders for the active world", () => {
    for (const folder of ALLOWED_FOLDERS) {
      expect(isAllowedTargetPath(WORLD, `content/${WORLD}/${folder}/x.md`)).toBe(true);
    }
  });
  it("rejects paths outside content/<world>/<allowed>/", () => {
    expect(isAllowedTargetPath(WORLD, "content/other-world/places/x.md")).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/_atlas/world.yaml`)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/secrets/x.md`)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/places/sub/x.md`)).toBe(false);
    expect(isAllowedTargetPath(WORLD, "x.md")).toBe(false);
    expect(isAllowedTargetPath(WORLD, "")).toBe(false);
  });
  it("rejects traversal and absolute paths", () => {
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/../escape.md`)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `/content/${WORLD}/places/x.md`)).toBe(false);
  });
  it("rejects non-md extensions", () => {
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/places/x.txt`)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/places/x.yaml`)).toBe(false);
  });
});

describe("buildStagingRow", () => {
  it("uses frontmatter atlas.type when present", () => {
    const row = buildStagingRow(
      {
        filename: "thornhold.md",
        raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\nbody\n",
      },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(row.inferredType).toBe("settlement");
    expect(row.targetPath).toBe("content/astrath-deeprealm/places/thornhold.md");
    expect(row.pathAllowed).toBe(true);
    expect(row.conflict).toBe(false);
    expect(row.included).toBe(true);
  });

  it("falls back to imports/ when no atlas.type and uses filename stem", () => {
    const row = buildStagingRow(
      { filename: "Garron Notes.md", raw: "no frontmatter here" },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(row.inferredType).toBe("imports");
    expect(row.targetPath).toBe("content/astrath-deeprealm/imports/garron-notes.md");
    expect(row.included).toBe(true);
  });

  it("IGNORES frontmatter `path` field — only exposes it as a suggestion", () => {
    const row = buildStagingRow(
      {
        filename: "notes.md",
        raw: "---\npath: content/other/_atlas/world.yaml\natlas:\n  type: npc\n  id: garron\n---\n",
      },
      { worldId: WORLD, existingPaths: new Set() },
    );
    // Target should be the *inferred* people/garron.md, NOT the frontmatter path.
    expect(row.targetPath).toBe("content/astrath-deeprealm/people/garron.md");
    expect(row.frontmatterPath).toBe("content/other/_atlas/world.yaml");
  });

  it("flags conflicts and defaults `included` to false on conflict", () => {
    const existing = new Set(["content/astrath-deeprealm/places/thornhold.md"]);
    const row = buildStagingRow(
      {
        filename: "thornhold.md",
        raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\n",
      },
      { worldId: WORLD, existingPaths: existing },
    );
    expect(row.conflict).toBe(true);
    expect(row.included).toBe(false);
  });

  it("flags disallowed paths (defensive: shouldn't happen on initial build but possible after edit) — initial build always lands inside allowlist", () => {
    const row = buildStagingRow(
      { filename: "n.md", raw: "---\natlas:\n  type: settlement\n  id: n\n---\n" },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(row.pathAllowed).toBe(true);
  });

  it("records frontmatter parse errors and disables the row", () => {
    const row = buildStagingRow(
      { filename: "broken.md", raw: "---\n: : not yaml :\n  - [unterminated\n---\nbody" },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(row.parseError).toBeTruthy();
    expect(row.included).toBe(false);
  });

  it("uses atlas.id when present, else slugified filename stem", () => {
    const row = buildStagingRow(
      {
        filename: "anything.md",
        raw: "---\natlas:\n  id: my-custom-id\n  type: npc\n---\n",
      },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(row.targetPath).toBe("content/astrath-deeprealm/people/my-custom-id.md");
  });
});

describe("buildStagingRows", () => {
  it("preserves input order and gives each row a unique id", () => {
    const rows = buildStagingRows(
      [
        { filename: "a.md", raw: "---\natlas: { type: npc, id: a }\n---\n" },
        { filename: "b.md", raw: "---\natlas: { type: npc, id: b }\n---\n" },
      ],
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[0].filename).toBe("a.md");
  });
});

describe("updateStagingRow", () => {
  const base = (): StagingRow =>
    buildStagingRow(
      { filename: "x.md", raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\n" },
      { worldId: WORLD, existingPaths: new Set() },
    );

  it("toggling include works", () => {
    const r0 = base();
    const r1 = updateStagingRow(r0, { included: false }, {
      worldId: WORLD,
      existingPaths: new Set(),
    });
    expect(r1.included).toBe(false);
  });

  it("changing inferredType recomputes the targetPath into the new folder", () => {
    const r0 = base();
    const r1 = updateStagingRow(r0, { inferredType: "npc" }, {
      worldId: WORLD,
      existingPaths: new Set(),
    });
    expect(r1.inferredType).toBe("npc");
    expect(r1.targetPath).toBe("content/astrath-deeprealm/people/thornhold.md");
  });

  it("changing the type re-evaluates conflict against existingPaths for the NEW path", () => {
    const existing = new Set(["content/astrath-deeprealm/people/thornhold.md"]);
    const r0 = base();
    expect(r0.conflict).toBe(false);
    const r1 = updateStagingRow(r0, { inferredType: "npc" }, {
      worldId: WORLD,
      existingPaths: existing,
    });
    expect(r1.conflict).toBe(true);
  });

  it("manually editing targetPath outside the allowlist flips pathAllowed=false and forces included=false", () => {
    const r0 = base();
    const r1 = updateStagingRow(
      r0,
      { targetPath: "content/astrath-deeprealm/_atlas/world.yaml" },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(r1.pathAllowed).toBe(false);
    expect(r1.included).toBe(false);
  });

  it("manually editing targetPath into the allowlist keeps included controllable", () => {
    const r0 = base();
    const r1 = updateStagingRow(
      r0,
      { targetPath: "content/astrath-deeprealm/people/custom-name.md" },
      { worldId: WORLD, existingPaths: new Set() },
    );
    expect(r1.pathAllowed).toBe(true);
    // Still included by default because no conflict, no error.
    expect(r1.included).toBe(true);
  });

  it("conflict on a manual path edit defaults included=false", () => {
    const existing = new Set(["content/astrath-deeprealm/people/already.md"]);
    const r0 = base();
    const r1 = updateStagingRow(
      r0,
      { targetPath: "content/astrath-deeprealm/people/already.md" },
      { worldId: WORLD, existingPaths: existing },
    );
    expect(r1.conflict).toBe(true);
    expect(r1.included).toBe(false);
  });

  it("DM re-checking a conflict row flips included=true (explicit override)", () => {
    const existing = new Set(["content/astrath-deeprealm/places/thornhold.md"]);
    const r0 = buildStagingRow(
      { filename: "thornhold.md", raw: "---\natlas: { type: settlement, id: thornhold }\n---\n" },
      { worldId: WORLD, existingPaths: existing },
    );
    expect(r0.included).toBe(false);
    const r1 = updateStagingRow(r0, { included: true }, {
      worldId: WORLD,
      existingPaths: existing,
    });
    expect(r1.included).toBe(true);
    expect(r1.conflict).toBe(true);
  });
});
