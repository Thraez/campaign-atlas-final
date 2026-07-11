import { describe, it, expect } from "vitest";
import { reasonsFromNoSecrets, reasonsFromDerived, reasonsFromShape } from "./publishScan";

describe("publishScan reason mapping (D8: never echo secrets)", () => {
  it("maps a DM-content hit to a scan-level message with no secret", () => {
    const reasons = reasonsFromNoSecrets(
      { files: 1, dmHits: [{ file: "dist/x.js", pattern: "SENTINEL_DM_BODY_001", kind: "dm" }], editorHits: [] },
      "dist"
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0].scan).toBe("check-no-secrets-dm");
    expect(reasons[0].message).toMatch(/DM-only note/i);
  });

  it("maps an editor-code hit distinctly", () => {
    const reasons = reasonsFromNoSecrets(
      { files: 1, dmHits: [], editorHits: [{ file: "dist/x.js", pattern: "/__atlas/save", kind: "editor" }] },
      "dist"
    );
    expect(reasons[0].scan).toBe("check-no-secrets-editor");
    expect(reasons[0].message).toMatch(/editor/i);
  });

  it("derived: uses match.source as locator and NEVER match.name", () => {
    const SECRET = "The Cabal of the Black Sun";
    const reasons = reasonsFromDerived({
      derivedCount: 1, filesScanned: 1,
      hits: [{ file: "dist/atlas/atlas.json", match: { name: SECRET, source: "content/world/cabal.md", field: "title" } }],
    }, "dist");
    expect(reasons).toHaveLength(1);
    expect(reasons[0].locator?.file).toBe("content/world/cabal.md");
    expect(JSON.stringify(reasons[0])).not.toContain(SECRET);
  });

  it("shape: uses entityId as locator and NEVER the violation message", () => {
    const LEAK = "secret-source-path/spoiler.md";
    const reasons = reasonsFromShape({
      violations: [{ entityId: "the-villain", field: "sourcePath", message: `sourcePath leaked: "${LEAK}"` }],
    });
    expect(reasons[0].locator?.entityId).toBe("the-villain");
    expect(JSON.stringify(reasons[0])).not.toContain(LEAK);
  });
});

describe("publishScan dedup + fallback behavior", () => {
  it("derived: two hits from the SAME source collapse to one reason (no secret echoed)", () => {
    const reasons = reasonsFromDerived(
      {
        derivedCount: 2,
        filesScanned: 1,
        hits: [
          { file: "dist/atlas/atlas.json", match: { name: "Secret One", source: "content/world/cabal.md", field: "title" } },
          { file: "dist/atlas/atlas.json", match: { name: "Secret Two", source: "content/world/cabal.md", field: "alias" } },
        ],
      },
      "dist"
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0].locator?.file).toBe("content/world/cabal.md");
    const json = JSON.stringify(reasons);
    expect(json).not.toContain("Secret One");
    expect(json).not.toContain("Secret Two");
  });

  it("derived: hits from DIFFERENT sources produce one reason each, still echoing no secret", () => {
    const reasons = reasonsFromDerived(
      {
        derivedCount: 2,
        filesScanned: 1,
        hits: [
          { file: "dist/atlas/atlas.json", match: { name: "Secret One", source: "content/world/cabal.md", field: "title" } },
          { file: "dist/atlas/atlas.json", match: { name: "Secret Two", source: "content/world/lich.md", field: "title" } },
        ],
      },
      "dist"
    );
    expect(reasons).toHaveLength(2);
    expect(reasons.map((r) => r.locator?.file).sort()).toEqual([
      "content/world/cabal.md",
      "content/world/lich.md",
    ]);
    const json = JSON.stringify(reasons);
    expect(json).not.toContain("Secret One");
    expect(json).not.toContain("Secret Two");
  });

  it("derived: no hits returns an empty reason list", () => {
    expect(reasonsFromDerived({ derivedCount: 0, filesScanned: 1, hits: [] }, "dist")).toEqual([]);
  });

  it("shape: two violations on the SAME entity collapse to one reason", () => {
    const reasons = reasonsFromShape({
      violations: [
        { entityId: "the-villain", field: "sourcePath", message: 'sourcePath leaked: "spoiler.md"' },
        { entityId: "the-villain", field: "body", message: "body contains DM sentinel SENTINEL_X" },
      ],
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0].locator?.entityId).toBe("the-villain");
  });

  it("shape: root-level violations with no entityId dedup to one reason and emit no locator", () => {
    const reasons = reasonsFromShape({
      violations: [
        { field: "<root>", message: "atlas.json root is not an object" },
        { field: "<root>", message: "another root-level problem" },
      ],
    });
    expect(reasons).toHaveLength(1); // both root violations share the "<root>" dedup key
    expect(reasons[0].locator).toBeUndefined(); // no entityId → no locator copied
    expect(reasons[0].scan).toBe("check-artifact-shape");
    expect(reasons[0].target).toBe("public/atlas/atlas.json");
  });

  it("shape: no violations returns an empty reason list", () => {
    expect(reasonsFromShape({ violations: [] })).toEqual([]);
  });

  it("no-secrets: both a DM hit and an editor hit produce two distinct reasons (DM first)", () => {
    const reasons = reasonsFromNoSecrets(
      {
        files: 2,
        dmHits: [{ file: "dist/a.js", pattern: "SENTINEL_DM_BODY_001", kind: "dm" }],
        editorHits: [{ file: "dist/b.js", pattern: "/__atlas/save", kind: "editor" }],
      },
      "dist"
    );
    expect(reasons).toHaveLength(2);
    expect(reasons[0].scan).toBe("check-no-secrets-dm");
    expect(reasons[1].scan).toBe("check-no-secrets-editor");
  });

  it("no-secrets: a clean scan produces no reasons", () => {
    expect(reasonsFromNoSecrets({ files: 3, dmHits: [], editorHits: [] }, "dist")).toEqual([]);
  });
});
