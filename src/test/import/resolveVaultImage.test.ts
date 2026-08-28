import { describe, it, expect } from "vitest";
import { resolveVaultImage, vaultImageTargetName } from "@/atlas/import/resolveVaultImage";

const INDEX = [
  "03_Entities/pics/corven-portrait.png",
  "99_Attachments/tavern.jpg",
  "10_DmNotesAndSecrets/maps/cabal-lair.png",
];

describe("resolveVaultImage", () => {
  it("finds an image by basename anywhere in scope", () => {
    const r = resolveVaultImage("tavern.jpg", "03_Entities/Corven.md", INDEX, [
      "03_Entities",
      "99_Attachments",
    ]);
    expect(r).toEqual({ ok: true, relPath: "99_Attachments/tavern.jpg" });
  });

  it("refuses an image that lives outside the chosen folders", () => {
    const r = resolveVaultImage("cabal-lair.png", "03_Entities/Corven.md", INDEX, ["03_Entities"]);
    expect(r).toEqual({ ok: false, reason: "outside-candidates" });
  });

  it("refuses an image it cannot find", () => {
    const r = resolveVaultImage("missing.png", "03_Entities/Corven.md", INDEX, ["03_Entities"]);
    expect(r).toEqual({ ok: false, reason: "not-found" });
  });

  it("resolves a relative path spelled out in the embed", () => {
    const r = resolveVaultImage("pics/corven-portrait.png", "03_Entities/Corven.md", INDEX, [
      "03_Entities",
    ]);
    expect(r).toEqual({ ok: true, relPath: "03_Entities/pics/corven-portrait.png" });
  });

  it("refuses a traversal attempt", () => {
    const r = resolveVaultImage("../../etc/passwd.png", "03_Entities/Corven.md", INDEX, [
      "03_Entities",
    ]);
    expect(r).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("vaultImageTargetName", () => {
  it("names from the entity, never the source file", () => {
    // A PNG is published as WebP, so the extension follows the encoding policy
    // rather than the source — but the *stem* still comes from the entity id,
    // which is the secrecy rule this test exists for.
    expect(vaultImageTargetName("corven", 0, "the-cabal-lair.png")).toBe("corven-1.webp");
  });

  it("numbers multiple images per entity", () => {
    expect(vaultImageTargetName("corven", 2, "x.webp")).toBe("corven-3.webp");
  });

  it("keeps the extension of a format that is not converted", () => {
    expect(vaultImageTargetName("corven", 0, "banner.gif")).toBe("corven-1.gif");
  });

  it("ignores the case of the source extension", () => {
    expect(vaultImageTargetName("corven", 0, "P.PNG")).toBe("corven-1.webp");
    expect(vaultImageTargetName("corven", 0, "B.GIF")).toBe("corven-1.gif");
  });
});
