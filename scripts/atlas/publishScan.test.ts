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
