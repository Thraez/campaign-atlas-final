/**
 * Branch coverage for entityFrontmatterPatches in canonicalEntitySave.ts.
 *
 * The seam-guard test (atlas-entity-save-seam.test.ts) calls this function
 * only as a pass-through in end-to-end scenarios. The branches tested here
 * are correctness-critical for the Save path:
 *   - unknown entity id is silently skipped (not thrown)
 *   - each draft field falls back to the entity's current value when absent
 *   - an empty relationships array is stripped to undefined (not written as [])
 *   - profile is derived from the draft when supplied, else from the entity
 */
import { describe, it, expect } from "vitest";
import type { Entity } from "@/atlas/content/schema";
import { entityFrontmatterPatches } from "@/atlas/save/canonicalEntitySave";

const base: Entity = {
  id: "hero",
  sourcePath: "content/world/hero.md",
  title: "Hero",
  type: "npc",
  visibility: "dm",
  summary: "Old summary",
  aliases: ["Champion"],
  images: ["hero.png"],
  profile: { player: { known_for: "Bravery", visible_traits: [], rumors: [] } },
  relationships: [{ entity: "villain", type: "rivals", visibility: "dm" }],
  body: "",
  bodyHtml: "",
  frontmatter: {},
  links: [],
  backlinks: [],
  tags: [],
};

describe("entityFrontmatterPatches", () => {
  it("returns empty array when drafts is empty", () => {
    expect(entityFrontmatterPatches({}, [base])).toEqual([]);
  });

  it("skips a draft whose id is not in the entities list", () => {
    const patches = entityFrontmatterPatches({ "ghost-id": { summary: "X" } }, [base]);
    expect(patches).toHaveLength(0);
  });

  it("skips unknown ids even when mixed with known ids", () => {
    const patches = entityFrontmatterPatches(
      { "ghost-id": { summary: "X" }, hero: { summary: "Y" } },
      [base],
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].atlas.id).toBe("hero");
  });

  it("uses draft type when present; falls back to entity type when absent", () => {
    const withType = entityFrontmatterPatches({ hero: { type: "faction" } }, [base]);
    expect(withType[0].atlas.type).toBe("faction");

    const noType = entityFrontmatterPatches({ hero: { summary: "S" } }, [base]);
    expect(noType[0].atlas.type).toBe("npc");
  });

  it("uses draft visibility when present; falls back to entity visibility when absent", () => {
    const withVis = entityFrontmatterPatches({ hero: { visibility: "player" } }, [base]);
    expect(withVis[0].atlas.visibility).toBe("player");

    const noVis = entityFrontmatterPatches({ hero: { summary: "S" } }, [base]);
    expect(noVis[0].atlas.visibility).toBe("dm");
  });

  it("uses draft aliases/images when present; falls back to entity values when absent", () => {
    const withOverride = entityFrontmatterPatches(
      { hero: { aliases: ["Champion", "Chosen"], images: ["new.png"] } },
      [base],
    );
    expect(withOverride[0].atlas.aliases).toEqual(["Champion", "Chosen"]);
    expect(withOverride[0].atlas.images).toEqual(["new.png"]);

    const withFallback = entityFrontmatterPatches({ hero: {} }, [base]);
    expect(withFallback[0].atlas.aliases).toEqual(["Champion"]);
    expect(withFallback[0].atlas.images).toEqual(["hero.png"]);
  });

  it("strips empty relationships array to undefined in the output", () => {
    const patches = entityFrontmatterPatches({ hero: { relationships: [] } }, [base]);
    expect(patches[0].atlas.relationships).toBeUndefined();
  });

  it("preserves non-empty relationships from the draft", () => {
    const rel = { entity: "ally", type: "allied_with", visibility: "player" as const };
    const patches = entityFrontmatterPatches({ hero: { relationships: [rel] } }, [base]);
    expect(patches[0].atlas.relationships).toEqual([rel]);
  });

  it("falls back to entity relationships when draft has none; strips if entity list is empty", () => {
    const patches = entityFrontmatterPatches({ hero: {} }, [base]);
    expect(patches[0].atlas.relationships).toHaveLength(1);

    const emptyBase: Entity = { ...base, relationships: [] };
    const patchesEmpty = entityFrontmatterPatches({ hero: {} }, [emptyBase]);
    expect(patchesEmpty[0].atlas.relationships).toBeUndefined();
  });

  it("uses draft profile when supplied; falls back to entity profile when absent", () => {
    const draftProfile = { player: { known_for: "Cunning", visible_traits: [], rumors: [] } };
    const withProfile = entityFrontmatterPatches({ hero: { profile: draftProfile } }, [base]);
    // compactProfile keeps non-empty player fields
    expect(withProfile[0].atlas.profile).toBeDefined();
    expect(withProfile[0].atlas.profile?.player?.known_for).toBe("Cunning");

    // Without draft profile, entity profile is used
    const noProfile = entityFrontmatterPatches({ hero: {} }, [base]);
    expect(noProfile[0].atlas.profile?.player?.known_for).toBe("Bravery");
  });

  it("sets sourcePath and title from the entity, not the draft", () => {
    const patches = entityFrontmatterPatches({ hero: { summary: "New" } }, [base]);
    expect(patches[0].sourcePath).toBe("content/world/hero.md");
    expect(patches[0].title).toBe("Hero");
  });
});
