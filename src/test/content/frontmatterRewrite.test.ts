import { describe, it, expect } from "vitest";
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

const CORVEN = `---
role: Story
tags:
  - npc
  - smuggler
atlas:
  placements:
    - mapId: m1
      x: 1
      "y": 2
---

# Corven

Body stays exactly here.
`;

describe("rewriteFrontmatter", () => {
  it("injects atlas id/type/visibility, preserves placements, body and root fields", () => {
    const out = rewriteFrontmatter(CORVEN, {
      id: "corven", type: "npc", visibility: "dm", tagsAdd: ["npc"],
    });
    const fm = parseFrontmatter(out);
    const atlas = fm.data.atlas as Record<string, unknown>;
    expect(atlas.id).toBe("corven");
    expect(atlas.type).toBe("npc");
    expect(atlas.visibility).toBe("dm");
    expect((atlas.placements as unknown[]).length).toBe(1); // preserved
    expect(fm.data.role).toBe("Story");                      // root field preserved
    expect(fm.content).toContain("# Corven");
    expect(fm.content).toContain("Body stays exactly here.");
  });
  it("dedupes tagsAdd against existing tags, order-stable", () => {
    const out = rewriteFrontmatter(CORVEN, { type: "npc", tagsAdd: ["npc", "legend"] });
    const fm = parseFrontmatter(out);
    expect(fm.data.tags).toEqual(["npc", "smuggler", "legend"]);
  });
  it("empty patch is a lossless round-trip through parseFrontmatter", () => {
    const out = rewriteFrontmatter(CORVEN, {});
    const a = parseFrontmatter(out);
    const b = parseFrontmatter(CORVEN);
    expect(a.data).toEqual(b.data);
    expect(a.content).toEqual(b.content);
  });
  it("creates an atlas block when the file has none", () => {
    const raw = `---\ntitle: Lone Note\n---\n\nbody\n`;
    const out = rewriteFrontmatter(raw, { id: "lone-note", type: "lore", visibility: "dm" });
    const atlas = parseFrontmatter(out).data.atlas as Record<string, unknown>;
    expect(atlas).toEqual({ id: "lone-note", type: "lore", visibility: "dm" });
  });
  it("creates frontmatter when the file has none at all", () => {
    const out = rewriteFrontmatter(`# Bare\n\ntext\n`, { id: "bare", type: "lore" });
    const fm = parseFrontmatter(out);
    expect((fm.data.atlas as Record<string, unknown>).id).toBe("bare");
    expect(fm.content).toContain("# Bare");
  });
});
