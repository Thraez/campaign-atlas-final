/**
 * code-retro 07: Sync from Obsidian through planSync / commitSync over the
 * in-memory vault port. Covers the dry run, "sync twice, the second changes
 * nothing", and the code-retro 03 cases.
 */
import { describe, it, expect } from "vitest";
import { planSync, commitSync, countByFolder, type SyncWorld } from "@/atlas/sync/sync";
import { createMemoryVaultPort } from "../helpers/memoryVaultPort";
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
      { folder: "01_Lore", create: 1, update: 0, unchanged: 1, held: 0, skipped: 0 },
      { folder: "03_Entities", create: 1, update: 1, unchanged: 0, held: 0, skipped: 0 },
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

// ── code-retro 07 review: safety ─────────────────────────────────────────────

describe("planSync / commitSync safety", () => {
  const P = "content/w/npcs/corven.md";
  const PLAYER_CORVEN =
    "---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: player\n---\nA smuggler.\n";
  const playerWorld = (): SyncWorld => ({
    worldId: "w",
    importConfig,
    existingById: new Map([["corven", P]]),
    entityMeta: new Map([
      ["corven", { visibility: "player" as const, type: "npc", sourcePath: P }],
    ]),
  });
  const secretNote = (title: string) =>
    `---\ntitle: ${title}\natlas:\n  type: npc\n  visibility: dm\n---\nSECRET: Corven works for the Cabal.\n`;

  it.each([
    ["same title", { "03_Entities/Corven.md": secretNote("Corven") }, {}],
    [
      "a sync-map entry (renamed note)",
      { "03_Entities/The Traitor.md": secretNote("The Traitor") },
      {
        "03_Entities/The Traitor.md": { id: "corven", baseType: "npc", approvedHash: "sha256:old" },
      },
    ],
  ])(
    "a dm vault note that updates a player entity (%s) is held, and writes dm if approved",
    async (_label, notes, syncMap) => {
      const port = createMemoryVaultPort({ notes, atlas: { [P]: PLAYER_CORVEN }, syncMap });
      const plan = await planSync(port, playerWorld(), source());
      expect(plan.rows).toHaveLength(1);
      const [row] = plan.rows;
      expect(row.rowKind).toBe("update");
      expect(row.included).toBe(false);
      expect(row.needsReview).toBeDefined();
      expect(row.resolvedVisibility).toBe("dm");
      expect(plan.counts[0]).toMatchObject({ held: 1, update: 0 });

      // A DM who ticks it gets the vault's secrecy, never player.
      await commitSync(port, [{ ...row, included: true }], plan.source);
      expect(port.atlas.get(P)).toMatch(/visibility:\s*dm\b/);
    },
  );

  it("an embedded image of a note with a traversal id is named inside the images folder", async () => {
    const port = createMemoryVaultPort({
      notes: {
        "03_Entities/evil.md":
          "---\ntitle: Evil\natlas:\n  id: ../../../../../vault/03_Entities/pwned.x\n  type: npc\n---\n![[p.png]]\n",
      },
      images: ["03_Entities/p.png"],
    });
    const plan = await planSync(port, world(), source());
    await commitSync(port, plan.rows, plan.source);
    expect(port.copiedImages).toHaveLength(1);
    expect(port.copiedImages[0]).toMatch(/^\/atlas\/assets\/images\/[a-z0-9-]+\.webp$/);
  });

  it("a picked note does not take the sync-map entry of a note outside the picked folders", async () => {
    const STUB = "";
    const hash = await hashContent(STUB);
    const port = createMemoryVaultPort({
      notes: { "03_Entities/stub.md": STUB, "01_Lore/real.md": STUB },
      syncMap: { "01_Lore/real.md": { id: "real", baseType: "lore", approvedHash: hash } },
    });
    await planSync(port, world(), source(["03_Entities"]));
    expect(Object.keys(port.syncMap)).toEqual(["01_Lore/real.md"]);
    expect(port.writes).toEqual([]);
  });
});
