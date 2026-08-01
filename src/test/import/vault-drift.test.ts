import { describe, it, expect } from "vitest";
import { buildStagingRows, type StagingContext } from "@/atlas/import/stagingState";
import type { ImportFolderConfig } from "@/atlas/content/schema";
import type { VaultNoteState } from "@/atlas/import/syncMap";

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
