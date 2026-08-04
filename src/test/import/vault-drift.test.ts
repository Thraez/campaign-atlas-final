import { describe, it, expect } from "vitest";
import { buildStagingRows, type StagingContext } from "@/atlas/import/stagingState";
import type { ImportFolderConfig } from "@/atlas/content/schema";
import { classifyVaultNote, recordSync, type VaultNoteState } from "@/atlas/import/syncMap";
import { hashContent } from "@/atlas/save/localFsSave";

const NOTE = `---\ntitle: Corven\ntags: [npc]\n---\n\nA quiet smuggler.\n`;

const IMPORT_CONFIG: ImportFolderConfig = { folders: {}, defaultFolder: "imports" };
const ALLOWED_FOLDERS: ReadonlySet<string> = new Set(["imports"]);

const CTX: StagingContext = {
  worldId: "astrath-deeprealm",
  importConfig: IMPORT_CONFIG,
  allowedFolders: ALLOWED_FOLDERS,
  existingById: new Map<string, string>(),
  existingPaths: new Set<string>(),
};

function rowsFor(vaultState: VaultNoteState) {
  return buildStagingRows(
    [{ filename: "Corven.md", raw: NOTE, vaultRelPath: "03_Entities/Corven.md", vaultState }],
    CTX,
  );
}

describe("vault drift on staging rows", () => {
  it("keeps the state on the row so the panel can group by it", () => {
    expect(rowsFor("changed")[0].vaultState).toBe("changed");
  });

  it("does not tick an unchanged note — there is nothing to import", () => {
    expect(rowsFor("unchanged")[0].included).toBe(false);
  });

  it("still ticks a changed note", () => {
    expect(rowsFor("changed")[0].included).toBe(true);
  });

  it("still ticks a new note", () => {
    expect(rowsFor("new")[0].included).toBe(true);
  });
});

describe("hash round-trip", () => {
  it("a note recorded after sync classifies as unchanged next scan", async () => {
    const hash = await hashContent(NOTE);
    const map = recordSync({}, "03_Entities/Corven.md", "corven", "npc", hash);
    const again = await hashContent(NOTE);
    expect(classifyVaultNote(map, "03_Entities/Corven.md", again)).toBe("unchanged");
  });

  it("a note edited after sync classifies as changed", async () => {
    const hash = await hashContent(NOTE);
    const map = recordSync({}, "03_Entities/Corven.md", "corven", "npc", hash);
    const edited = await hashContent(NOTE + "\nHe has been reworked.\n");
    expect(classifyVaultNote(map, "03_Entities/Corven.md", edited)).toBe("changed");
  });
});
