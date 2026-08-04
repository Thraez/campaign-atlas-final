import { describe, it, expect } from "vitest";
import {
  classifyVaultNote,
  recordSync,
  findPathByApprovedHash,
  hasLocalEdits,
  type SyncMap,
} from "@/atlas/import/syncMap";

const H1 = "sha256:1111";
const H2 = "sha256:2222";

describe("classifyVaultNote", () => {
  it("reports a note with no sync-map entry as new", () => {
    expect(classifyVaultNote({}, "03_Entities/Corven.md", H1)).toBe("new");
  });

  it("reports an unchanged note when the hash matches", () => {
    const map: SyncMap = { "03_Entities/Corven.md": { id: "corven", baseType: "npc", approvedHash: H1 } };
    expect(classifyVaultNote(map, "03_Entities/Corven.md", H1)).toBe("unchanged");
  });

  it("reports a changed note when the hash differs", () => {
    const map: SyncMap = { "03_Entities/Corven.md": { id: "corven", baseType: "npc", approvedHash: H1 } };
    expect(classifyVaultNote(map, "03_Entities/Corven.md", H2)).toBe("changed");
  });

  it("reports unknown for a pre-upgrade entry with no hash", () => {
    const map: SyncMap = { "03_Entities/Corven.md": { id: "corven", baseType: "npc" } };
    expect(classifyVaultNote(map, "03_Entities/Corven.md", H1)).toBe("unknown");
  });
});

describe("recordSync", () => {
  it("stores the approved hash without mutating the original map", () => {
    const map: SyncMap = {};
    const next = recordSync(map, "03_Entities/Corven.md", "corven", "npc", H1);
    expect(next["03_Entities/Corven.md"].approvedHash).toBe(H1);
    expect(map).toEqual({});
  });

  it("omits approvedHash when none is supplied", () => {
    const next = recordSync({}, "a.md", "a", "npc");
    expect(next["a.md"].approvedHash).toBeUndefined();
  });
});

describe("findPathByApprovedHash", () => {
  it("finds a moved note by exact content hash", () => {
    const map: SyncMap = { "01_Lore/Corven.md": { id: "corven", baseType: "npc", approvedHash: H1 } };
    expect(findPathByApprovedHash(map, H1)).toBe("01_Lore/Corven.md");
  });

  it("returns undefined when no entry matches", () => {
    expect(findPathByApprovedHash({}, H1)).toBeUndefined();
  });
});

describe("hasLocalEdits", () => {
  it("is false when the atlas file is exactly what the last sync wrote", () => {
    const map: SyncMap = {
      "03_Entities/Corven.md": { id: "corven", baseType: "npc", syncedFileHash: H1 },
    };
    expect(hasLocalEdits(map, "03_Entities/Corven.md", H1)).toBe(false);
  });

  it("is true when the atlas file has drifted from what the last sync wrote", () => {
    const map: SyncMap = {
      "03_Entities/Corven.md": { id: "corven", baseType: "npc", syncedFileHash: H1 },
    };
    expect(hasLocalEdits(map, "03_Entities/Corven.md", H2)).toBe(true);
  });

  it("is false when we have no record — never cry wolf on a first sync", () => {
    expect(hasLocalEdits({}, "03_Entities/Corven.md", H1)).toBe(false);
  });
});
