import { describe, it, expect, vi } from "vitest";
import { buildImportChanges, ImportCommitError } from "@/atlas/import/buildImportChanges";
import {
  buildStagingRows,
  updateStagingRow,
  type StagingRow,
} from "@/atlas/import/stagingState";

const WORLD = "astrath-deeprealm";

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
      { worldId: WORLD, existingPaths: new Set() },
    );
    // DM unchecks the third
    const adjusted: StagingRow[] = [
      rows[0],
      rows[1],
      updateStagingRow(rows[2], { included: false }, { worldId: WORLD, existingPaths: new Set() }),
    ];
    const changes = await buildImportChanges(adjusted, { fetchFn: fakeReadFetch({}) });
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("content/astrath-deeprealm/people/ok.md");
    expect(changes[0].kind).toBe("entity-md");
    expect(changes[0].baseHash).toBeNull();
    expect(changes[0].content).toContain("body");
  });

  it("captures baseHash for conflict rows by reading via /__atlas/read", async () => {
    const existing = new Set(["content/astrath-deeprealm/places/thornhold.md"]);
    const onDisk = "---\natlas: { type: settlement, id: thornhold }\n---\nold body\n";
    const rows = buildStagingRows(
      [
        {
          filename: "thornhold.md",
          raw: "---\natlas: { type: settlement, id: thornhold }\n---\nnew body\n",
        },
      ],
      { worldId: WORLD, existingPaths: existing },
    );
    // DM explicitly re-checks the overwrite.
    const opted = updateStagingRow(rows[0], { included: true }, {
      worldId: WORLD,
      existingPaths: existing,
    });
    const changes = await buildImportChanges([opted], {
      fetchFn: fakeReadFetch({ "content/astrath-deeprealm/places/thornhold.md": onDisk }),
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].baseHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(changes[0].content).toContain("new body");
  });

  it("throws ImportCommitError when no rows would be committed", async () => {
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      { worldId: WORLD, existingPaths: new Set() },
    );
    const off = updateStagingRow(rows[0], { included: false }, {
      worldId: WORLD,
      existingPaths: new Set(),
    });
    await expect(
      buildImportChanges([off], { fetchFn: fakeReadFetch({}) }),
    ).rejects.toBeInstanceOf(ImportCommitError);
  });

  it("wraps a failed read of a conflict file into ImportCommitError", async () => {
    const existing = new Set(["content/astrath-deeprealm/people/x.md"]);
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      { worldId: WORLD, existingPaths: existing },
    );
    const opted = updateStagingRow(rows[0], { included: true }, {
      worldId: WORLD,
      existingPaths: existing,
    });
    // fetch map empty → read returns 404.
    const fetchFn = vi.fn(fakeReadFetch({}));
    await expect(
      buildImportChanges([opted], { fetchFn }),
    ).rejects.toBeInstanceOf(ImportCommitError);
  });
});
