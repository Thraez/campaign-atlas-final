/**
 * code-retro 07: Sync from Obsidian through planSync / commitSync over the
 * in-memory vault port. Covers the dry run, "sync twice, the second changes
 * nothing", and the code-retro 03 cases.
 */
import { describe, it, expect } from "vitest";
import { planSync, commitSync, countByFolder, type SyncWorld } from "@/atlas/sync/sync";
import { createMemoryVaultPort } from "@/atlas/sync/memoryVaultPort";
import type { SyncSource } from "@/atlas/sync/vaultPort";
import { ConflictError, hashContent } from "@/atlas/save/localFsSave";
import type { ImportFolderConfig } from "@/atlas/content/schema";

const importConfig: ImportFolderConfig = { folders: { npc: "npcs" }, defaultFolder: "imports" };
const EXISTING = "content/w/npcs/placeholder.md";

function world(existing: Record<string, string> = { placeholder: EXISTING }): SyncWorld {
  return { worldId: "w", importConfig, existingById: new Map(Object.entries(existing)) };
}

const source = (candidateFolders: string[] = []): SyncSource => ({
  vaultRoot: "/vault",
  ignoreGlobs: [],
  candidateFolders,
});

const CORVEN = "---\ntitle: Corven\natlas:\n  type: npc\n---\nA smuggler.\n";
const PORTRAIT = "---\ntitle: Corven\natlas:\n  type: npc\n---\n![[portrait.png]]\n";
const PLACEHOLDER = "---\ntitle: Placeholder\natlas:\n  id: placeholder\n  type: npc\n---\nOld.\n";

const changesOf = (counts: ReturnType<typeof countByFolder>) =>
  counts.reduce((n, c) => n + c.create + c.update, 0);

describe("planSync", () => {
  it("counts create, update and unchanged per top-level vault folder", async () => {
    const port = createMemoryVaultPort({
      notes: {
        "03_Entities/NPCs/corven.md": CORVEN,
        "03_Entities/NPCs/placeholder.md": "---\ntitle: Placeholder\n---\nNew text.\n",
        "01_Lore/history.md": "# History\n",
        "01_Lore/kept.md": "kept\n",
      },
      atlas: { [EXISTING]: PLACEHOLDER },
      syncMap: {
        "01_Lore/kept.md": {
          id: "kept",
          baseType: "lore",
          approvedHash: await hashContent("kept\n"),
        },
      },
    });
    const plan = await planSync(port, world(), source());
    expect(plan.counts).toEqual([
      { folder: "01_Lore", create: 1, update: 0, unchanged: 1, skipped: 0 },
      { folder: "03_Entities", create: 1, update: 1, unchanged: 0, skipped: 0 },
    ]);
  });

  it("reads only the picked folders and never the built-in ignored ones", async () => {
    const port = createMemoryVaultPort({
      notes: {
        "03_Entities/corven.md": CORVEN,
        "01_Lore/history.md": "# History\n",
        "03_Entities/Templates/npc.md": "template\n",
      },
    });
    const plan = await planSync(port, world(), source(["03_Entities"]));
    expect(plan.rows.map((r) => r.vaultRelPath)).toEqual(["03_Entities/corven.md"]);
    expect(plan.rows[0].filename).toBe("corven.md");
  });

  it("refuses to plan without the DM build", async () => {
    const port = createMemoryVaultPort({ notes: { "a.md": CORVEN } });
    await expect(planSync(port, world({}), source())).rejects.toThrow(/DM mode/);
  });

  it("a dry run writes nothing, not even a move", async () => {
    const hash = await hashContent(CORVEN);
    const port = createMemoryVaultPort({
      notes: { "03_Entities/People/corven.md": CORVEN },
      syncMap: { "03_Entities/corven.md": { id: "corven", baseType: "npc", approvedHash: hash } },
    });
    const plan = await planSync(port, world(), source(), { dryRun: true });
    expect(plan.rows[0].vaultState).toBe("unchanged");
    expect(port.writes).toEqual([]);
  });

  it("holds an update for review when the DM edited the atlas copy since the last sync", async () => {
    const vaultRaw = "---\ntitle: Placeholder\n---\nVault edit.\n";
    const port = createMemoryVaultPort({
      notes: { "03_Entities/placeholder.md": vaultRaw },
      atlas: { [EXISTING]: PLACEHOLDER + "DM edit.\n" },
      syncMap: {
        "03_Entities/placeholder.md": {
          id: "placeholder",
          baseType: "npc",
          approvedHash: await hashContent("older vault text"),
          syncedFileHash: await hashContent(PLACEHOLDER),
        },
      },
    });
    const plan = await planSync(port, world(), source());
    expect(plan.rows[0]).toMatchObject({
      rowKind: "update",
      included: false,
      needsReview: { reason: "local-edits" },
    });
  });
});

describe("commitSync", () => {
  it("syncing twice: the second plan has nothing to change", async () => {
    const port = createMemoryVaultPort({
      notes: {
        "03_Entities/corven.md": CORVEN,
        "03_Entities/placeholder.md": "---\ntitle: Placeholder\n---\nNew text.\n",
        "01_Lore/history.md": "# History\n",
      },
      atlas: { [EXISTING]: PLACEHOLDER },
    });
    const first = await planSync(port, world(), source());
    expect(changesOf(first.counts)).toBe(3);
    const result = await commitSync(port, first.rows, first.source);
    expect(result.saved).toBe(3);
    expect(port.atlas.get("content/w/npcs/corven.md")).toContain("A smuggler.");

    // The editor reloads the DM build after a commit: the new notes now exist.
    const rebuilt = world({
      placeholder: EXISTING,
      corven: "content/w/npcs/corven.md",
      history: "content/w/imports/history.md",
    });
    const second = await planSync(port, rebuilt, source());
    expect(changesOf(second.counts)).toBe(0);
    expect(second.rows.every((r) => !r.included)).toBe(true);
  });

  it("commits dropped files (no vault) without touching the sync map", async () => {
    const port = createMemoryVaultPort();
    const plan = await planSync(port, world(), source());
    expect(plan.rows).toEqual([]);
    const { buildStagingRows } = await import("@/atlas/import/stagingState");
    const { stagingContext } = await import("@/atlas/sync/sync");
    const rows = buildStagingRows(
      [{ filename: "corven.md", raw: CORVEN }],
      stagingContext(world()),
    );
    await commitSync(port, rows, null);
    expect(port.atlas.has("content/w/npcs/corven.md")).toBe(true);
    expect(port.writes.map((w) => w.kind)).toEqual(["atlas"]);
  });

  // ── code-retro 03 ──────────────────────────────────────────────────────────

  it("a failed rebuild still records the sync map for the files written", async () => {
    const port = createMemoryVaultPort({
      notes: { "03_Entities/corven.md": CORVEN },
      rebuildFails: true,
    });
    const plan = await planSync(port, world(), source());
    const result = await commitSync(port, plan.rows, plan.source);
    expect(result.rebuilt).toBe(false);
    expect(port.syncMap["03_Entities/corven.md"]).toMatchObject({
      id: "corven",
      approvedHash: await hashContent(CORVEN),
      syncedFileHash: await hashContent(port.atlas.get("content/w/npcs/corven.md")!),
    });
  });

  it("a conflict on a new file stops the commit before any image is copied", async () => {
    const port = createMemoryVaultPort({
      notes: { "03_Entities/corven.md": PORTRAIT },
      images: ["03_Entities/portrait.png"],
    });
    const plan = await planSync(port, world(), source());
    // The file appears after Staging looked.
    port.atlas.set("content/w/npcs/corven.md", "someone else's note");
    await expect(commitSync(port, plan.rows, plan.source)).rejects.toBeInstanceOf(ConflictError);
    expect(port.copiedImages).toEqual([]);
    expect(port.writes).toEqual([]);
  });

  it("copies images once the targets are free, and drops a refused embed", async () => {
    const port = createMemoryVaultPort({
      notes: { "03_Entities/corven.md": PORTRAIT + "![[lair.png]]\n" },
      images: ["03_Entities/portrait.png", "10_DMNotesAndSecrets/lair.png"],
    });
    const plan = await planSync(port, world(), source(["03_Entities"]));
    const result = await commitSync(port, plan.rows, plan.source);
    expect(result.skippedImages).toBe(1);
    const written = port.atlas.get("content/w/npcs/corven.md")!;
    expect(written).toContain("![](/atlas/assets/images/corven-1.webp)");
    expect(written).not.toContain("lair");
  });

  it("a note moved in the vault is re-recorded at its new path; the next sync changes nothing", async () => {
    const hash = await hashContent(CORVEN);
    const port = createMemoryVaultPort({
      notes: { "03_Entities/People/corven.md": CORVEN },
      syncMap: { "03_Entities/corven.md": { id: "corven", baseType: "npc", approvedHash: hash } },
    });
    await planSync(port, world(), source());
    expect(Object.keys(port.syncMap)).toEqual(["03_Entities/People/corven.md"]);
    expect(port.syncMap["03_Entities/People/corven.md"]).toMatchObject({ id: "corven" });

    const again = await planSync(port, world(), source());
    expect(again.rows.map((r) => [r.vaultState, r.included])).toEqual([["unchanged", false]]);
  });

  it("a copy of a note (the original still there) does not move its sync-map entry", async () => {
    const hash = await hashContent(CORVEN);
    const port = createMemoryVaultPort({
      notes: { "03_Entities/corven.md": CORVEN, "03_Entities/corven copy.md": CORVEN },
      syncMap: { "03_Entities/corven.md": { id: "corven", baseType: "npc", approvedHash: hash } },
    });
    await planSync(port, world(), source());
    expect(port.writes).toEqual([]);
  });
});
