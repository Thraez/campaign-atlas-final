import { describe, it, expect } from "vitest";
import {
  inferTargetFolder,
  computeTargetPath,
  isAllowedTargetPath,
  buildStagingRow,
  buildStagingRows,
  updateStagingRow,
  type StagingRow,
  type StagingContext,
} from "@/atlas/import/stagingState";
import type { ImportFolderConfig } from "@/atlas/content/schema";

const WORLD = "astrath-deeprealm";

/** Mirrors content/astrath-deeprealm/_atlas/world.yaml import block. */
const TEST_IMPORT_CONFIG: ImportFolderConfig = {
  folders: {
    npc: "npcs",
    settlement: "settlements",
    ruin: "ruins",
    dungeon: "ruins",
    location: "places",
    map_note: "places",
    faction: "factions",
    event: "events",
    region: "regions",
    item: "items",
  },
  defaultFolder: "imports",
};

const TEST_ALLOWED_FOLDERS: ReadonlySet<string> = new Set([
  ...Object.values(TEST_IMPORT_CONFIG.folders),
  TEST_IMPORT_CONFIG.defaultFolder,
]);

function makeCtx(overrides?: {
  existingById?: ReadonlyMap<string, string>;
  existingPaths?: ReadonlySet<string>;
}): StagingContext {
  return {
    worldId: WORLD,
    importConfig: TEST_IMPORT_CONFIG,
    allowedFolders: TEST_ALLOWED_FOLDERS,
    existingById: overrides?.existingById ?? new Map(),
    existingPaths: overrides?.existingPaths ?? new Set(),
  };
}

describe("inferTargetFolder", () => {
  it("maps settlement-like types to their configured folders", () => {
    expect(inferTargetFolder("settlement", TEST_IMPORT_CONFIG)).toBe("settlements");
    expect(inferTargetFolder("ruin", TEST_IMPORT_CONFIG)).toBe("ruins");
    expect(inferTargetFolder("dungeon", TEST_IMPORT_CONFIG)).toBe("ruins");
    expect(inferTargetFolder("location", TEST_IMPORT_CONFIG)).toBe("places");
    expect(inferTargetFolder("map_note", TEST_IMPORT_CONFIG)).toBe("places");
  });
  it("maps npc, faction, item, event, region to their configured folders", () => {
    expect(inferTargetFolder("npc", TEST_IMPORT_CONFIG)).toBe("npcs");
    expect(inferTargetFolder("faction", TEST_IMPORT_CONFIG)).toBe("factions");
    expect(inferTargetFolder("item", TEST_IMPORT_CONFIG)).toBe("items");
    expect(inferTargetFolder("event", TEST_IMPORT_CONFIG)).toBe("events");
    expect(inferTargetFolder("region", TEST_IMPORT_CONFIG)).toBe("regions");
  });
  it("falls back to defaultFolder for unknown or missing types", () => {
    expect(inferTargetFolder("", TEST_IMPORT_CONFIG)).toBe("imports");
    expect(inferTargetFolder("note", TEST_IMPORT_CONFIG)).toBe("imports");
    expect(inferTargetFolder("mystery-meat", TEST_IMPORT_CONFIG)).toBe("imports");
  });
});

describe("computeTargetPath", () => {
  it("joins worldId, folder, and slug into a content/.../<file>.md", () => {
    expect(computeTargetPath(WORLD, "settlements", "thornhold")).toBe(
      "content/astrath-deeprealm/settlements/thornhold.md",
    );
  });
  it("slugifies the stem (lowercases, replaces non-alnum, strips diacritics)", () => {
    expect(computeTargetPath(WORLD, "npcs", "Garron the Bold")).toBe(
      "content/astrath-deeprealm/npcs/garron-the-bold.md",
    );
    expect(computeTargetPath(WORLD, "places", "Côte D'Azur Stronghold")).toBe(
      "content/astrath-deeprealm/places/cote-dazur-stronghold.md",
    );
  });
});

describe("isAllowedTargetPath", () => {
  it("accepts paths in the configured folders for the active world", () => {
    for (const folder of TEST_ALLOWED_FOLDERS) {
      expect(
        isAllowedTargetPath(WORLD, `content/${WORLD}/${folder}/x.md`, TEST_ALLOWED_FOLDERS),
      ).toBe(true);
    }
  });
  it("rejects paths outside content/<world>/<allowed>/", () => {
    expect(isAllowedTargetPath(WORLD, "content/other-world/npcs/x.md", TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/_atlas/world.yaml`, TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/secrets/x.md`, TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/npcs/sub/x.md`, TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, "x.md", TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, "", TEST_ALLOWED_FOLDERS)).toBe(false);
  });
  it("rejects traversal and absolute paths", () => {
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/../escape.md`, TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `/content/${WORLD}/npcs/x.md`, TEST_ALLOWED_FOLDERS)).toBe(false);
  });
  it("rejects Windows-style backslash paths", () => {
    // path.includes("\\") guard — a Windows path must never slip through on
    // non-normalized input (e.g. drag-and-drop from File Explorer on Windows).
    expect(
      isAllowedTargetPath(WORLD, `content\\${WORLD}\\npcs\\x.md`, TEST_ALLOWED_FOLDERS),
    ).toBe(false);
  });
  it("rejects non-md extensions", () => {
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/npcs/x.txt`, TEST_ALLOWED_FOLDERS)).toBe(false);
    expect(isAllowedTargetPath(WORLD, `content/${WORLD}/npcs/x.yaml`, TEST_ALLOWED_FOLDERS)).toBe(false);
  });
});

describe("buildStagingRow", () => {
  it("uses frontmatter atlas.type when present", () => {
    const row = buildStagingRow(
      {
        filename: "thornhold.md",
        raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\nbody\n",
      },
      makeCtx(),
    );
    expect(row.inferredType).toBe("settlement");
    expect(row.targetPath).toBe("content/astrath-deeprealm/settlements/thornhold.md");
    expect(row.pathAllowed).toBe(true);
    expect(row.rowKind).toBe("create");
    expect(row.included).toBe(true);
  });

  it("falls back to lore → imports/ when no atlas.type and uses filename stem", () => {
    const row = buildStagingRow(
      { filename: "Garron Notes.md", raw: "no frontmatter here" },
      makeCtx(),
    );
    expect(row.inferredType).toBe("lore");
    expect(row.targetPath).toBe("content/astrath-deeprealm/imports/garron-notes.md");
    expect(row.included).toBe(true);
  });

  it("IGNORES frontmatter `path` field — only exposes it as a suggestion", () => {
    const row = buildStagingRow(
      {
        filename: "notes.md",
        raw: "---\npath: content/other/_atlas/world.yaml\natlas:\n  type: npc\n  id: garron\n---\n",
      },
      makeCtx(),
    );
    // Target should be the *inferred* npcs/garron.md, NOT the frontmatter path.
    expect(row.targetPath).toBe("content/astrath-deeprealm/npcs/garron.md");
    expect(row.frontmatterPath).toBe("content/other/_atlas/world.yaml");
  });

  it("flags path-collision and defaults `included` to false when target path is occupied by a different entity", () => {
    const existingPaths = new Set(["content/astrath-deeprealm/settlements/thornhold.md"]);
    const row = buildStagingRow(
      {
        filename: "thornhold.md",
        raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\n",
      },
      makeCtx({ existingPaths }),
    );
    expect(row.rowKind).toBe("path-collision");
    expect(row.included).toBe(false);
  });

  it("routes to existing entity's path and sets rowKind=update when resolvedId matches", () => {
    const existingById = new Map([["thornhold", "content/astrath-deeprealm/settlements/thornhold.md"]]);
    const existingPaths = new Set(existingById.values());
    const row = buildStagingRow(
      {
        filename: "thornhold.md",
        raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\n",
      },
      makeCtx({ existingById, existingPaths }),
    );
    expect(row.rowKind).toBe("update");
    expect(row.targetPath).toBe("content/astrath-deeprealm/settlements/thornhold.md");
    expect(row.included).toBe(true);
  });

  it("initial build into configured folder always lands inside allowlist", () => {
    const row = buildStagingRow(
      { filename: "n.md", raw: "---\natlas:\n  type: settlement\n  id: n\n---\n" },
      makeCtx(),
    );
    expect(row.pathAllowed).toBe(true);
  });

  it("records frontmatter parse errors and disables the row", () => {
    const row = buildStagingRow(
      { filename: "broken.md", raw: "---\n: : not yaml :\n  - [unterminated\n---\nbody" },
      makeCtx(),
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
      makeCtx(),
    );
    expect(row.targetPath).toBe("content/astrath-deeprealm/npcs/my-custom-id.md");
  });
});

describe("staging type precedence + resolved fields", () => {
  const ctx = {
    worldId: "w",
    importConfig: { folders: { npc: "npcs" }, defaultFolder: "imports" },
    allowedFolders: new Set(["npcs", "imports"]),
    existingById: new Map<string, string>(),
    existingPaths: new Set<string>(),
  } as const;

  it("infers npc from tags when atlas.type is absent and flags unconfirmed", () => {
    const raw = `---\ntags:\n  - npc\n  - smuggler\n---\n# Corven\n`;
    const row = buildStagingRow({ filename: "corven.md", raw }, ctx as never);
    expect(row.inferredType).toBe("npc");
    expect(row.typeWasExplicit).toBe(false);
    expect(row.resolvedId).toBe("corven");
    expect(row.resolvedVisibility).toBe("dm");
    expect(row.rawContent).toBe(raw);
  });
  it("explicit atlas.type wins and is marked explicit", () => {
    const raw = `---\natlas:\n  type: faction\n  visibility: player\ntags:\n  - npc\n---\n# X\n`;
    const row = buildStagingRow({ filename: "x.md", raw }, ctx as never);
    expect(row.inferredType).toBe("faction");
    expect(row.typeWasExplicit).toBe(true);
    expect(row.resolvedVisibility).toBe("player");
  });
  it("no signal → lore, unconfirmed", () => {
    const raw = `---\ntags:\n  - stub\n---\n# Y\n`;
    const row = buildStagingRow({ filename: "y.md", raw }, ctx as never);
    expect(row.inferredType).toBe("lore");
    expect(row.typeWasExplicit).toBe(false);
  });
});

describe("buildStagingRows", () => {
  it("preserves input order and gives each row a unique id", () => {
    const rows = buildStagingRows(
      [
        { filename: "a.md", raw: "---\natlas: { type: npc, id: a }\n---\n" },
        { filename: "b.md", raw: "---\natlas: { type: npc, id: b }\n---\n" },
      ],
      makeCtx(),
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
      makeCtx(),
    );

  it("toggling include works", () => {
    const r0 = base();
    const r1 = updateStagingRow(r0, { included: false }, makeCtx());
    expect(r1.included).toBe(false);
  });

  it("changing inferredType recomputes the targetPath into the new folder", () => {
    const r0 = base();
    const r1 = updateStagingRow(r0, { inferredType: "npc" }, makeCtx());
    expect(r1.inferredType).toBe("npc");
    expect(r1.targetPath).toBe("content/astrath-deeprealm/npcs/thornhold.md");
  });

  it("changing the type re-evaluates rowKind against existingPaths for the NEW path", () => {
    const existingPaths = new Set(["content/astrath-deeprealm/npcs/thornhold.md"]);
    const r0 = base();
    expect(r0.rowKind).toBe("create");
    const r1 = updateStagingRow(r0, { inferredType: "npc" }, makeCtx({ existingPaths }));
    expect(r1.rowKind).toBe("path-collision");
  });

  it("manually editing targetPath outside the allowlist flips pathAllowed=false and forces included=false", () => {
    const r0 = base();
    const r1 = updateStagingRow(
      r0,
      { targetPath: "content/astrath-deeprealm/_atlas/world.yaml" },
      makeCtx(),
    );
    expect(r1.pathAllowed).toBe(false);
    expect(r1.included).toBe(false);
  });

  it("manually editing targetPath into the allowlist keeps included controllable", () => {
    const r0 = base();
    const r1 = updateStagingRow(
      r0,
      { targetPath: "content/astrath-deeprealm/npcs/custom-name.md" },
      makeCtx(),
    );
    expect(r1.pathAllowed).toBe(true);
    expect(r1.included).toBe(true);
  });

  it("path-collision on a manual path edit defaults included=false", () => {
    const existingPaths = new Set(["content/astrath-deeprealm/npcs/already.md"]);
    const r0 = base();
    const r1 = updateStagingRow(
      r0,
      { targetPath: "content/astrath-deeprealm/npcs/already.md" },
      makeCtx({ existingPaths }),
    );
    expect(r1.rowKind).toBe("path-collision");
    expect(r1.included).toBe(false);
  });

  it("DM re-checking a path-collision row flips included=true (explicit override)", () => {
    const existingPaths = new Set(["content/astrath-deeprealm/settlements/thornhold.md"]);
    const ctx = makeCtx({ existingPaths });
    const r0 = buildStagingRow(
      { filename: "thornhold.md", raw: "---\natlas: { type: settlement, id: thornhold }\n---\n" },
      ctx,
    );
    expect(r0.included).toBe(false);
    const r1 = updateStagingRow(r0, { included: true }, ctx);
    expect(r1.included).toBe(true);
    expect(r1.rowKind).toBe("path-collision");
  });

  it("parseError row cannot be re-included even with explicit included:true patch", () => {
    // A row with a parse error must stay excluded regardless of DM intent — the
    // file's content is unparseable and should never be written.
    const r0 = buildStagingRow(
      { filename: "broken.md", raw: "---\n: : bad yaml :\n  - [unterminated\n---\nbody" },
      makeCtx(),
    );
    expect(r0.parseError).toBeTruthy();
    expect(r0.included).toBe(false);
    const r1 = updateStagingRow(r0, { included: true }, makeCtx());
    expect(r1.included).toBe(false);
  });

  it("update row with type change: path stays anchored, rowKind stays update", () => {
    // An entity that already exists in the atlas should always update in-place,
    // even if the DM changes the inferred type — the type dropdown must not reroute it.
    const existingById = new Map([["thornhold", "content/astrath-deeprealm/settlements/thornhold.md"]]);
    const existingPaths = new Set(existingById.values());
    const ctx = makeCtx({ existingById, existingPaths });
    const r0 = buildStagingRow(
      { filename: "thornhold.md", raw: "---\natlas:\n  type: settlement\n  id: thornhold\n---\n" },
      ctx,
    );
    expect(r0.rowKind).toBe("update");
    const r1 = updateStagingRow(r0, { inferredType: "ruin" }, ctx);
    expect(r1.inferredType).toBe("ruin");
    // Path must NOT change — update rows are anchored
    expect(r1.targetPath).toBe("content/astrath-deeprealm/settlements/thornhold.md");
    expect(r1.rowKind).toBe("update");
    expect(r1.included).toBe(true);
  });

  it("empty patch preserves all mutable fields unchanged", () => {
    const r0 = base();
    const r1 = updateStagingRow(r0, {}, makeCtx());
    expect(r1.inferredType).toBe(r0.inferredType);
    expect(r1.targetPath).toBe(r0.targetPath);
    expect(r1.rowKind).toBe(r0.rowKind);
    expect(r1.included).toBe(r0.included);
    expect(r1.resolvedVisibility).toBe(r0.resolvedVisibility);
  });

  it("resolvedVisibility patch is applied", () => {
    const r0 = base();
    expect(r0.resolvedVisibility).toBe("dm");
    const r1 = updateStagingRow(r0, { resolvedVisibility: "player" }, makeCtx());
    expect(r1.resolvedVisibility).toBe("player");
  });
});

// F1 — "Categorize imported notes": typeWasGuessed distinguishes a silent lore
// fallback from notes that have a genuine explicit, tag, or folder signal.
describe("typeWasGuessed flag (F1: categorize imported notes)", () => {
  const ctx = makeCtx();

  it("false when atlas.type is explicit", () => {
    const row = buildStagingRow(
      { filename: "hero.md", raw: "---\natlas:\n  type: npc\n  id: hero\n---\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(false);
    expect(row.typeWasExplicit).toBe(true);
    expect(row.inferredType).toBe("npc");
  });

  it("false when type comes from a recognized tag (confident inference)", () => {
    const row = buildStagingRow(
      { filename: "garron.md", raw: "---\ntags:\n  - npc\n---\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(false);
    expect(row.typeWasExplicit).toBe(false);
    expect(row.inferredType).toBe("npc");
  });

  it("false when type comes from a mapped folder (confident folder inference)", () => {
    // "npcs/" is in FOLDER_TYPE_MAP → inferTypeFromPath returns "npc", not "note"
    const row = buildStagingRow(
      { filename: "npcs/garron.md", raw: "---\n---\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(false);
    expect(row.inferredType).toBe("npc");
  });

  it("false for a note explicitly typed as lore (deliberate, not guessed)", () => {
    const row = buildStagingRow(
      { filename: "ancient-lore.md", raw: "---\natlas:\n  type: lore\n---\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(false);
    expect(row.typeWasExplicit).toBe(true);
    expect(row.inferredType).toBe("lore");
  });

  it("true for a note in an unmapped folder with no explicit type or tags", () => {
    // "imports/" is not in FOLDER_TYPE_MAP → inferTypeFromPath returns "note"
    const row = buildStagingRow(
      { filename: "imports/mystery-npc.md", raw: "---\ntitle: The Dark Lord\n---\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(true);
    expect(row.typeWasExplicit).toBe(false);
    // Data default stays "lore" — marking it guessed doesn't change the stored type
    expect(row.inferredType).toBe("lore");
  });

  it("true for a bare file with no frontmatter signal at all", () => {
    const row = buildStagingRow(
      { filename: "mystery-note.md", raw: "# Just a heading\nSome body text.\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(true);
    expect(row.inferredType).toBe("lore");
  });

  it("false for a parse-error row (errors are not categorization guesses)", () => {
    const row = buildStagingRow(
      { filename: "bad.md", raw: "---\n: broken: yaml: [\n---\n" },
      ctx,
    );
    expect(row.typeWasGuessed).toBe(false);
    expect(!!row.parseError).toBe(true);
  });

  it("changing type on a guessed row routes to the correct folder after updateStagingRow", () => {
    const rows = buildStagingRows(
      [{ filename: "the-npc.md", raw: "---\n---\n" }],
      ctx,
    );
    const [row] = rows;
    expect(row.typeWasGuessed).toBe(true);
    expect(row.inferredType).toBe("lore");
    expect(row.targetPath).toContain("/imports/"); // default folder (lore not in TEST_IMPORT_CONFIG.folders)

    const updated = updateStagingRow(row, { inferredType: "npc" }, ctx);
    expect(updated.inferredType).toBe("npc");
    expect(updated.targetPath).toContain("/npcs/");
  });
});
