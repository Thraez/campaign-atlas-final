import { describe, it, expect } from "vitest";
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";

// Helper: round-trip a raw file through rewriteFrontmatter and parse the result
// back so tests can assert on structured data without re-implementing YAML parsing.
function parseResult(raw: string): Record<string, unknown> {
  // Extract YAML block between the --- fences.
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return {};
  // Simple key-value parse sufficient for these tests (no nested YAML needed
  // beyond the atlas sub-object which we inspect as a string match).
  return { _raw: raw };
}

const BARE_FILE = "# My Entity\n\nSome body text.\n";
const FENCED_FILE =
  "---\natlas:\n  id: abc\n  visibility: dm\ntags:\n  - npc\n---\n# My Entity\n\nSome body text.\n";

describe("rewriteFrontmatter — atlas field patching", () => {
  it("writes atlas.summary when patch.summary is provided", () => {
    const result = rewriteFrontmatter(BARE_FILE, { summary: "A brave hero." });
    // js-yaml omits quotes for unambiguous strings; assert the field is present.
    expect(result).toContain("summary: A brave hero.");
  });

  it("overwrites existing atlas.summary", () => {
    const file =
      "---\natlas:\n  id: xyz\n  summary: \"Old summary.\"\n---\n# Entity\n";
    const result = rewriteFrontmatter(file, { summary: "New summary." });
    expect(result).toContain("summary: New summary.");
    expect(result).not.toContain("Old summary.");
  });

  it("patches id, type, visibility, summary in one call", () => {
    const result = rewriteFrontmatter(BARE_FILE, {
      id: "ent-1",
      type: "npc",
      visibility: "player",
      summary: "Brave adventurer.",
    });
    expect(result).toContain("id: ent-1");
    expect(result).toContain("type: npc");
    expect(result).toContain("visibility: player");
    expect(result).toContain("summary: Brave adventurer.");
  });

  it("preserves existing atlas fields not in the patch", () => {
    const result = rewriteFrontmatter(FENCED_FILE, { type: "location" });
    expect(result).toContain("id: abc");
    expect(result).toContain("visibility: dm");
    expect(result).toContain("type: location");
  });
});

describe("rewriteFrontmatter — normaliseTags (string input branch)", () => {
  it("promotes a plain string tags value to a single-element array", () => {
    // tags: "npc" in YAML → existing is a string → normaliseTags returns ["npc"]
    const file = "---\natlas:\n  id: xyz\ntags: npc\n---\n# Entity\n";
    const result = rewriteFrontmatter(file, { tagsAdd: ["hero"] });
    // The output should contain both the original string tag and the new one.
    expect(result).toContain("npc");
    expect(result).toContain("hero");
    // And the tags value should now be a YAML sequence, not a bare scalar.
    expect(result).toMatch(/tags:\s*\n\s+- npc/);
    expect(result).toMatch(/- hero/);
  });

  it("trims whitespace from a string tag", () => {
    const file = "---\natlas:\n  id: xyz\ntags: \"  arcane  \"\n---\n# Entity\n";
    const result = rewriteFrontmatter(file, { tagsAdd: ["wizard"] });
    expect(result).toContain("arcane");
    expect(result).not.toContain("  arcane  ");
  });

  it("ignores an empty-string tags value (returns [] → new tag added alone)", () => {
    const file = "---\natlas:\n  id: xyz\ntags: \"\"\n---\n# Entity\n";
    const result = rewriteFrontmatter(file, { tagsAdd: ["landmark"] });
    expect(result).toContain("landmark");
    // Should not contain the empty-string tag.
    expect(result).not.toMatch(/- ""/);
  });

  it("handles tags: null (returns [] → new tag added alone)", () => {
    const file = "---\natlas:\n  id: xyz\ntags: null\n---\n# Entity\n";
    const result = rewriteFrontmatter(file, { tagsAdd: ["dungeon"] });
    expect(result).toContain("dungeon");
  });

  it("does not duplicate a tag already present as a string", () => {
    const file = "---\natlas:\n  id: xyz\ntags: npc\n---\n# Entity\n";
    const result = rewriteFrontmatter(file, { tagsAdd: ["npc"] });
    // "npc" must appear exactly once in the tags sequence.
    const tagMatches = [...result.matchAll(/- npc/g)];
    expect(tagMatches).toHaveLength(1);
  });
});

describe("rewriteFrontmatter — no tagsAdd (tags field untouched)", () => {
  it("leaves tags absent when patch has no tagsAdd", () => {
    const result = rewriteFrontmatter(BARE_FILE, { id: "ent-2" });
    // No tags key should appear in the output since there were none and none added.
    expect(result).not.toContain("tags:");
  });

  it("preserves existing tags array when patch has no tagsAdd", () => {
    const result = rewriteFrontmatter(FENCED_FILE, { id: "ent-3" });
    expect(result).toContain("npc");
  });
});
