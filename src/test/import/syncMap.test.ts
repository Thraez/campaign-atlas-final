import { describe, it, expect } from "vitest";
import {
  classifyVaultNote,
  recordSync,
  findPathByApprovedHash,
  hasLocalEdits,
  type SyncMap,
  readSyncMapFile,
  worldSyncMap,
  withWorldSyncMap,
  allSyncMapEntries,
  SyncMapFormatError,
} from "@/atlas/import/syncMap";

const H1 = "sha256:1111";
const H2 = "sha256:2222";

describe("classifyVaultNote", () => {
  it("reports a note with no sync-map entry as new", () => {
    expect(classifyVaultNote({}, "03_Entities/Corven.md", H1)).toBe("new");
  });

  it("reports an unchanged note when the hash matches", () => {
    const map: SyncMap = {
      "03_Entities/Corven.md": { id: "corven", baseType: "npc", approvedHash: H1 },
    };
    expect(classifyVaultNote(map, "03_Entities/Corven.md", H1)).toBe("unchanged");
  });

  it("reports a changed note when the hash differs", () => {
    const map: SyncMap = {
      "03_Entities/Corven.md": { id: "corven", baseType: "npc", approvedHash: H1 },
    };
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
    const map: SyncMap = {
      "01_Lore/Corven.md": { id: "corven", baseType: "npc", approvedHash: H1 },
    };
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

describe("sync-map file, one map per world (R-14)", () => {
  const entry = { id: "corven", baseType: "npc" as const, approvedHash: H1 };

  it("reads nothing as empty", () => {
    expect(readSyncMapFile(null, "a")).toEqual({ version: 2, worlds: {} });
    expect(readSyncMapFile({}, null)).toEqual({ version: 2, worlds: {} });
  });

  it("reads an old flat map as the default world's", () => {
    const file = readSyncMapFile({ "Corven.md": entry }, "a");
    expect(worldSyncMap(file, "a")).toEqual({ "Corven.md": entry });
    expect(worldSyncMap(file, "b")).toEqual({});
  });

  it("refuses an old flat map when no default world is known", () => {
    expect(() => readSyncMapFile({ "Corven.md": entry }, null)).toThrow(SyncMapFormatError);
  });

  it("refuses an unknown version", () => {
    expect(() => readSyncMapFile({ version: 3, worlds: {} }, "a")).toThrow(SyncMapFormatError);
  });

  it("replaces one world's map and keeps the others", () => {
    const file = readSyncMapFile({ version: 2, worlds: { a: { "A.md": entry } } }, null);
    const next = withWorldSyncMap(file, "b", { "B.md": entry });
    expect(next.worlds).toEqual({ a: { "A.md": entry }, b: { "B.md": entry } });
    expect(file.worlds.b).toBeUndefined();
  });

  it("lists every world's entries, from either shape", () => {
    expect(allSyncMapEntries({ "Old.md": entry })).toEqual([entry]);
    const other = { ...entry, id: "mara" };
    const v2 = { version: 2, worlds: { a: { "A.md": entry }, b: { "B.md": other } } };
    expect(allSyncMapEntries(v2)).toEqual([entry, other]);
  });
});
