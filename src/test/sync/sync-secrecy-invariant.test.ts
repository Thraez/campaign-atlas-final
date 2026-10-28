/**
 * code-retro 07 safety invariant: whatever the DM ticks, a synced note is
 * never more player-visible than the vault note it came from.
 *
 * Every combination of vault visibility tag × `atlas.publish` × vault folder
 * × atlas visibility × how the note finds its entity (title, sync map) runs
 * through planSync, is ticked, committed, and the written file is read back
 * with readNote, as the build reads it. Cases one at a time missed
 * `publish: false` beside `visibility: player`.
 */
import { describe, it, expect } from "vitest";
import { planSync, commitSync, type SyncWorld } from "@/atlas/sync/sync";
import { createMemoryVaultPort } from "../helpers/memoryVaultPort";
import { readNote } from "@/atlas/content/readNote";
import type { EntityVisibility } from "@/atlas/content/schema";

const TARGET = "content/w/npcs/corven.md";
const VAULT_VIS = ["player", "rumor", "dm", "hidden", "secret", undefined] as const;
const PUBLISH = [true, false, undefined] as const;
/** 01_Lore defaults an untagged note to player; 03_Entities to dm. */
const FOLDERS = ["01_Lore", "03_Entities"] as const;
const ATLAS_VIS: EntityVisibility[] = ["player", "hidden"];
const MATCH = ["title", "sync map"] as const;

/** The vault note's own answer, worked out from the rules, not from the code under test. */
function vaultIsPlayerVisible(
  vis: (typeof VAULT_VIS)[number],
  publish: (typeof PUBLISH)[number],
  folder: (typeof FOLDERS)[number],
): boolean {
  if (publish === false) return false;
  if (vis === "player" || vis === "rumor") return true;
  if (vis !== undefined) return false; // dm, hidden, or an invalid tag (→ dm)
  if (publish === true) return true; // legacy: publish: true with no tag
  return folder === "01_Lore";
}

function vaultNote(vis: (typeof VAULT_VIS)[number], publish: (typeof PUBLISH)[number]) {
  const atlas = [
    "  type: npc",
    vis !== undefined ? `  visibility: ${vis}` : null,
    publish !== undefined ? `  publish: ${publish}` : null,
  ].filter(Boolean);
  return `---\ntitle: Corven\natlas:\n${atlas.join("\n")}\n---\nTHE BODY.\n`;
}

const cases = VAULT_VIS.flatMap((vis) =>
  PUBLISH.flatMap((publish) =>
    FOLDERS.flatMap((folder) =>
      ATLAS_VIS.flatMap((atlasVis) =>
        MATCH.map((match) => ({ vis: vis ?? "(none)", publish, folder, atlasVis, match })),
      ),
    ),
  ),
);

describe("a ticked sync is never more player-visible than the vault note", () => {
  it.each(cases)(
    "vault $vis publish=$publish in $folder, atlas $atlasVis, by $match",
    async ({ vis, publish, folder, atlasVis, match }) => {
      const tag = vis === "(none)" ? undefined : (vis as (typeof VAULT_VIS)[number]);
      const relPath = match === "title" ? `${folder}/Corven.md` : `${folder}/Old Name.md`;
      const raw =
        match === "title"
          ? vaultNote(tag, publish)
          : vaultNote(tag, publish).replace("title: Corven", "title: Someone Else");
      const atlasRaw = `---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: ${atlasVis}\n---\nOld.\n`;
      const port = createMemoryVaultPort({
        notes: { [relPath]: raw },
        atlas: { [TARGET]: atlasRaw },
        syncMap: match === "sync map" ? { [relPath]: { id: "corven", baseType: "npc" } } : {},
      });
      const world: SyncWorld = {
        worldId: "w",
        importConfig: { folders: { npc: "npcs" }, defaultFolder: "imports" },
        existingById: new Map([["corven", TARGET]]),
        entityMeta: new Map([
          ["corven", { visibility: atlasVis, type: "npc", sourcePath: TARGET }],
        ]),
      };
      const source = { vaultRoot: "/v", ignoreGlobs: [], candidateFolders: [] };

      const plan = await planSync(port, world, source);
      const [row] = plan.rows;
      expect(row.rowKind).toBe("update");
      expect(row.resolvedId).toBe("corven");
      await commitSync(port, [{ ...row, included: true }], source);

      const written = readNote(port.atlas.get(TARGET)!, TARGET);
      if (!vaultIsPlayerVisible(tag, publish, folder)) {
        expect(written.isSecret).toBe(true);
        // What Staging showed agrees with what was written.
        expect(["dm", "hidden"]).toContain(row.resolvedVisibility);
      }
    },
  );
});
