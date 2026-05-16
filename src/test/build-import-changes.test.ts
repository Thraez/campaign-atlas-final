import { describe, it, expect, vi } from "vitest";
import { buildImportChanges, ImportCommitError } from "@/atlas/import/buildImportChanges";
import { parseFrontmatter } from "@/atlas/import/frontmatter";
import {
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

function fakeReadFetch(map: Record<string, string>): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = typeof url === "string" ? url : url.toString();
    const m = u.match(/\/__atlas\/read\?path=(.+)$/);
    if (!m) throw new Error(`unexpected url: ${u}`);
    const path = decodeURIComponent(m[1]);
    if (!(path in map)) {
      return new Response("not found", { status: 404 }) as Response;
    }
    return new Response(JSON.stringify({ path, contents: map[path] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as Response;
  }) as unknown as typeof fetch;
}

describe("buildImportChanges", () => {
  it("skips uncommittable rows (blocked, excluded, parse-error)", async () => {
    const rows = buildStagingRows(
      [
        { filename: "ok.md", raw: "---\natlas: { type: npc, id: ok }\n---\nbody\n" },
        { filename: "bad.md", raw: "---\n: : not yaml\n---\n" }, // parseError → excluded
        { filename: "skipped.md", raw: "---\natlas: { type: npc, id: skipped }\n---\n" },
      ],
      makeCtx(),
    );
    // DM unchecks the third
    const adjusted: StagingRow[] = [
      rows[0],
      rows[1],
      updateStagingRow(rows[2], { included: false }, makeCtx()),
    ];
    const changes = await buildImportChanges(adjusted, { fetchFn: fakeReadFetch({}) });
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("content/astrath-deeprealm/npcs/ok.md");
    expect(changes[0].kind).toBe("entity-md");
    expect(changes[0].baseHash).toBeNull();
    expect(changes[0].content).toContain("body");
  });

  it("captures baseHash for path-collision rows by reading via /__atlas/read", async () => {
    const existingPaths = new Set(["content/astrath-deeprealm/settlements/thornhold.md"]);
    const ctx = makeCtx({ existingPaths });
    const onDisk = "---\natlas: { type: settlement, id: thornhold }\n---\nold body\n";
    const rows = buildStagingRows(
      [
        {
          filename: "thornhold.md",
          raw: "---\natlas: { type: settlement, id: thornhold }\n---\nnew body\n",
        },
      ],
      ctx,
    );
    // rows[0].rowKind === "path-collision", included === false — DM explicitly opts in.
    const opted = updateStagingRow(rows[0], { included: true }, ctx);
    const changes = await buildImportChanges([opted], {
      fetchFn: fakeReadFetch({
        "content/astrath-deeprealm/settlements/thornhold.md": onDisk,
      }),
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].baseHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(changes[0].content).toContain("new body");
  });

  it("throws ImportCommitError when no rows would be committed", async () => {
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      makeCtx(),
    );
    const off = updateStagingRow(rows[0], { included: false }, makeCtx());
    await expect(
      buildImportChanges([off], { fetchFn: fakeReadFetch({}) }),
    ).rejects.toBeInstanceOf(ImportCommitError);
  });

  it("wraps a failed read of a path-collision file into ImportCommitError", async () => {
    const existingPaths = new Set(["content/astrath-deeprealm/npcs/x.md"]);
    const ctx = makeCtx({ existingPaths });
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      ctx,
    );
    const opted = updateStagingRow(rows[0], { included: true }, ctx);
    // fetch map empty → read returns 404.
    const fetchFn = vi.fn(fakeReadFetch({}));
    await expect(
      buildImportChanges([opted], { fetchFn }),
    ).rejects.toBeInstanceOf(ImportCommitError);
  });
});

describe("buildImportChanges persists inferred atlas fields", () => {
  it("rewrites frontmatter (not verbatim) for a create row with no atlas.type", async () => {
    const raw = `---\ntags:\n  - npc\n---\n# Corven\n\nbody\n`;
    const row = {
      id: "r1", filename: "corven.md",
      inferredType: "npc", typeWasExplicit: false,
      resolvedId: "corven", resolvedVisibility: "dm",
      rawContent: raw, content: raw,
      targetPath: "content/w/npcs/corven.md",
      pathAllowed: true, rowKind: "create" as const,
      included: true, frontmatterPath: undefined,
    };
    const [change] = await buildImportChanges([row as never]);
    expect(change.content).not.toBe(raw);            // not verbatim
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("npc");
    expect(atlas.id).toBe("corven");
    expect(atlas.visibility).toBe("dm");
    expect(parseFrontmatter(change.content).data.tags).toContain("npc");
    expect(change.baseHash).toBeNull();              // create-only
  });
});
