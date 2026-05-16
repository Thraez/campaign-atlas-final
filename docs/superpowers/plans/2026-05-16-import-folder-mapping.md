# Import Folder Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.md` imports route to the DM's real world folders (configured in `world.yaml`) instead of a hardcoded taxonomy, and let same-id imports silently update the existing entity in place.

**Architecture:** Almost all the logic is already implemented and tested (34 tests passing). This plan finishes the four remaining gaps: a silent bug in the "Select all overwrites" button, a hardcoded type-option list that violates the "zero code for new types" promise, missing validation tests for `loadWorldConfig`'s import-block parser, and a missing build-pipeline test asserting `importFolders` is in DM builds but absent from player builds.

**Tech Stack:** React + TypeScript + Vite, Vitest + Testing Library, `scripts/build-atlas.ts` (tsx), `world.yaml` (YAML source). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-import-folder-mapping-design.md`

---

## Context for the implementer

This is a continuation of already-merged work. The following are **already done** — do not re-implement them:

- `src/atlas/content/schema.ts` — `ImportFolderConfig` interface and `World.importFolders?` field exist.
- `scripts/atlas/loadWorldConfig.ts` — `sanitizeImportConfig()` and `WorldConfig.importConfig` exist.
- `scripts/build-atlas.ts` — conditional `importFolders` emit (DM build only, line ~833) exists.
- `src/atlas/import/stagingState.ts` — full rewrite with `ImportFolderConfig`, `existingById`, `resolvedId`, `rowKind`.
- `src/atlas/import/useMdImportFlow.ts` — accepts `importConfig` and `existingById`.
- `src/atlas/import/buildImportChanges.ts` — handles `update` and `path-collision` rows with `baseHash`.
- `src/pages/AtlasPlacementEditor.tsx` — `importExistingById` and `importConfig` memos, both passed to `useMdImportFlow`.
- `content/astrath-deeprealm/_atlas/world.yaml` — `import:` block seeded.
- `src/test/import-staging-state.test.ts` — 25 tests, all passing.
- `src/test/import-staging-modal.test.tsx` — 5 tests, all passing.
- `src/test/build-import-changes.test.ts` — 4 tests, all passing.

**Working directory:** `C:\Users\pvpro\Documents\campaign-atlas-final\.claude\worktrees\crazy-hugle-b5f9f6`

Run `npx vitest run src/test/import-staging-state.test.ts src/test/import-staging-modal.test.tsx src/test/build-import-changes.test.ts` to confirm 34/34 pass before starting.

---

## File Structure

**Modified:**
- `src/atlas/import/ImportStagingModal.tsx` — fix `r.conflict` bug; add `importConfig` prop; derive type options from config; update description text.
- `src/test/import-staging-modal.test.tsx` — add "Select all overwrites" test; thread `importConfig` through `Harness`.
- `src/pages/AtlasPlacementEditor.tsx:1467-1474` — pass `importConfig` to `<ImportStagingModal>`.
- `src/test/atlas-world-loader.test.ts` — add import-block validation describe block.
- `src/test/atlas-build.test.ts` — add DM/player `importFolders` presence test.

**Not modified:** All files listed in "Context" above.

---

## Task 1: Fix "Select all overwrites" — the silent bug

**Files:**
- Modify: `src/atlas/import/ImportStagingModal.tsx:90-93`
- Modify: `src/test/import-staging-modal.test.tsx`

`ImportStagingModal.tsx` line 91 filters conflict rows with `r.conflict`, but `StagingRow` has no `conflict` field — the correct field is `r.rowKind === "path-collision"`. Because `r.conflict` is always `undefined`, `conflictRows` is always empty, `uncheckedConflictCount` is always 0, and the "Select all overwrites" button never renders. The fix is one character change.

- [ ] **Step 1: Write the failing test**

Open `src/test/import-staging-modal.test.tsx`. After the last `it(...)` block (before the closing `});` of `describe("ImportStagingModal", ...)`), add:

```tsx
  it("'Select all overwrites' checks all unchecked path-collision rows at once", () => {
    const existingPaths = new Set([
      "content/astrath-deeprealm/settlements/a.md",
      "content/astrath-deeprealm/settlements/b.md",
    ]);
    const ctx = makeCtx({ existingPaths });
    const rows = buildStagingRows(
      [
        { filename: "a.md", raw: "---\natlas: { type: settlement, id: a }\n---\n" },
        { filename: "b.md", raw: "---\natlas: { type: settlement, id: b }\n---\n" },
      ],
      ctx,
    );
    render(<Harness initial={rows} ctx={ctx} />);
    expect((screen.getByLabelText("Include a.md") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Include b.md") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Select all overwrites/i }));
    expect((screen.getByLabelText("Include a.md") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Include b.md") as HTMLInputElement).checked).toBe(true);
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/test/import-staging-modal.test.tsx`

Expected: FAIL — `Unable to find role="button" name="Select all overwrites"` (button never renders because `conflictRows` is always empty due to the bug).

- [ ] **Step 3: Fix the bug**

In `src/atlas/import/ImportStagingModal.tsx`, replace lines 90-93:

```tsx
  const conflictRows = useMemo(
    () => rows.filter((r) => r.pathAllowed && !r.parseError && r.conflict),
    [rows],
  );
```

with:

```tsx
  const conflictRows = useMemo(
    () => rows.filter((r) => r.pathAllowed && !r.parseError && r.rowKind === "path-collision"),
    [rows],
  );
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/test/import-staging-modal.test.tsx`

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/ImportStagingModal.tsx src/test/import-staging-modal.test.tsx
git commit -m "fix: conflictRows filter used r.conflict (undefined) instead of r.rowKind; restores Select all overwrites button"
```

---

## Task 2: Config-driven type options + description update

**Files:**
- Modify: `src/atlas/import/ImportStagingModal.tsx`
- Modify: `src/test/import-staging-modal.test.tsx`
- Modify: `src/pages/AtlasPlacementEditor.tsx:1467-1474`

Per spec D7: "Adding an entity type = one config line, zero code. No hardcoded type/folder list anywhere." The type-selection dropdown currently uses a hardcoded `TYPE_OPTIONS` array. This needs to come from `importConfig` — add the prop, derive from it. Also update the dialog description which hardcodes `{places,people,factions,items,events,regions,imports}`.

No new failing tests needed here — the existing modal tests already exercise type selection. After the prop is added, thread it through the test harness.

- [ ] **Step 1: Add `importConfig` prop and derive type options in the modal**

In `src/atlas/import/ImportStagingModal.tsx`:

At the top of the file (after existing imports), add:
```tsx
import type { ImportFolderConfig } from "../content/schema";
```

Replace the static constant (lines 39-52):
```tsx
/** DM-facing type choices — same list used elsewhere in the editor. */
const TYPE_OPTIONS = [
  "settlement",
  "region",
  "ruin",
  "dungeon",
  "location",
  "map_note",
  "npc",
  "faction",
  "event",
  "item",
  "imports",
];
```

with nothing (delete it entirely).

Add `importConfig` to the `ImportStagingModalProps` interface (after `isImporting?`):
```tsx
export interface ImportStagingModalProps {
  open: boolean;
  rows: StagingRow[];
  isImporting?: boolean;
  /** Folder config for the active world; drives the type-selection dropdown. */
  importConfig: ImportFolderConfig;
  onPatchRow: (
    id: string,
    patch: { included?: boolean; inferredType?: string; targetPath?: string },
  ) => void;
  onCancel: () => void;
  onCommit: () => void;
}
```

Add `importConfig` to the function signature:
```tsx
export function ImportStagingModal({
  open,
  rows,
  isImporting,
  importConfig,
  onPatchRow,
  onCancel,
  onCommit,
}: ImportStagingModalProps) {
```

Inside the function body, after the existing `useMemo` calls, add:
```tsx
  const typeOptions = useMemo(() => {
    const types = new Set([...Object.keys(importConfig.folders), importConfig.defaultFolder]);
    return [...types].sort();
  }, [importConfig]);
```

Replace `TYPE_OPTIONS.map(...)` (inside the Select > SelectContent) with `typeOptions.map(...)`:
```tsx
                          {typeOptions.map((t) => (
                            <SelectItem key={t} value={t} className="text-[11px]">
                              {t}
                            </SelectItem>
                          ))}
```

- [ ] **Step 2: Update the dialog description**

Replace the `<DialogDescription>` block (lines 103-112):
```tsx
          <DialogDescription>
            Review each file before committing. Target paths are restricted to
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-[10px]">
              content/&lt;world&gt;/{"{places,people,factions,items,events,regions,imports}"}/…
            </code>
            — rows outside that allowlist are red and can't be imported.
            Existing files default to <strong>unchecked</strong>; re-check
            explicitly to overwrite (the previous version is backed up).
          </DialogDescription>
```

with:
```tsx
          <DialogDescription>
            Review each file before committing. Target paths must be inside your
            world&apos;s configured import folders — rows outside the allowlist are
            red and can&apos;t be imported. Existing files default to{" "}
            <strong>unchecked</strong>; re-check explicitly to overwrite (the
            previous version is backed up).
          </DialogDescription>
```

- [ ] **Step 3: Thread `importConfig` through the test harness**

In `src/test/import-staging-modal.test.tsx`, add `ImportFolderConfig` to the imports:
```tsx
import type { ImportFolderConfig } from "@/atlas/content/schema";
```

Replace the `Harness` function (lines 50-75):
```tsx
function Harness({
  initial,
  ctx = makeCtx(),
  importConfig = TEST_IMPORT_CONFIG,
  onCommit,
}: {
  initial: StagingRow[];
  ctx?: StagingContext;
  importConfig?: ImportFolderConfig;
  onCommit?: (committed: StagingRow[]) => void;
}) {
  const [rows, setRows] = useState(initial);
  return (
    <ImportStagingModal
      open
      rows={rows}
      importConfig={importConfig}
      onPatchRow={(id, patch) =>
        setRows((rs) =>
          rs.map((r) =>
            r.id === id ? updateStagingRow(r, patch, ctx) : r,
          ),
        )
      }
      onCancel={() => {}}
      onCommit={() => onCommit?.(rows.filter((r) => r.included && r.pathAllowed && !r.parseError))}
    />
  );
}
```

- [ ] **Step 4: Pass `importConfig` to the modal in `AtlasPlacementEditor.tsx`**

In `src/pages/AtlasPlacementEditor.tsx`, find the `<ImportStagingModal>` block at line ~1467 and add `importConfig`:

```tsx
      <ImportStagingModal
        open={importFlow.open}
        rows={importFlow.rows}
        isImporting={importFlow.isImporting}
        importConfig={importConfig}
        onPatchRow={importFlow.patchRow}
        onCancel={importFlow.cancel}
        onCommit={importFlow.commit}
      />
```

- [ ] **Step 5: Run — expect all modal and tsc clean**

Run type-check first:
```
npx tsc --noEmit
```
Expected: no errors.

Run modal tests:
```
npx vitest run src/test/import-staging-modal.test.tsx
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/atlas/import/ImportStagingModal.tsx src/test/import-staging-modal.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat: import type dropdown driven by importConfig, not hardcoded list (D7)"
```

---

## Task 3: `loadWorldConfig` import-block validation tests

**Files:**
- Modify: `src/test/atlas-world-loader.test.ts`

The spec (§6) requires tests for `sanitizeImportConfig` behavior: valid config, invalid segments dropped with warnings, `_atlas`/`..` rejected, absent block → defaults. These belong in the existing `loadWorldConfig` test file.

Read `src/test/atlas-world-loader.test.ts` to understand its structure (it uses `tmpRoot`, `WORLD`, `writeWorldYaml`, `baseMap` helpers defined at the top). Add the new describe block at the end of the file.

- [ ] **Step 1: Write the tests**

Append to `src/test/atlas-world-loader.test.ts`:

```ts
describe("loadWorldConfig — import block", () => {
  it("parses a valid import block into importConfig", () => {
    writeWorldYaml(`${baseMap}
import:
  folders:
    npc: npcs
    settlement: settlements
  defaultFolder: imports
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig).toEqual({
      folders: { npc: "npcs", settlement: "settlements" },
      defaultFolder: "imports",
    });
    expect(cfg.warnings).toHaveLength(0);
  });

  it("drops invalid folder values and emits a warning per dropped entry", () => {
    writeWorldYaml(`${baseMap}
import:
  folders:
    bad1: ".."
    bad2: "../../etc/passwd"
    ok: "npcs"
  defaultFolder: imports
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig.folders).toEqual({ ok: "npcs" });
    expect(cfg.warnings.some((w) => w.includes('".."'))).toBe(true);
    expect(cfg.warnings.some((w) => w.includes('"../../etc/passwd"'))).toBe(true);
  });

  it("rejects _atlas as a folder value and warns", () => {
    writeWorldYaml(`${baseMap}
import:
  folders:
    npc: _atlas
  defaultFolder: imports
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig.folders).toEqual({});
    expect(cfg.warnings.some((w) => w.includes('"_atlas"'))).toBe(true);
  });

  it("falls back to 'imports' when defaultFolder is invalid and warns", () => {
    writeWorldYaml(`${baseMap}
import:
  defaultFolder: ".."
`);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig.defaultFolder).toBe("imports");
    expect(cfg.warnings.some((w) => w.includes("defaultFolder"))).toBe(true);
  });

  it("absent import block yields { folders: {}, defaultFolder: 'imports' } with no warnings", () => {
    writeWorldYaml(baseMap);
    const cfg = loadWorldConfig(tmpRoot, WORLD)!;
    expect(cfg.importConfig).toEqual({ folders: {}, defaultFolder: "imports" });
    expect(cfg.warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `npx vitest run src/test/atlas-world-loader.test.ts`

Expected: PASS (all previous tests + 5 new = total passes).

- [ ] **Step 3: Commit**

```bash
git add src/test/atlas-world-loader.test.ts
git commit -m "test: loadWorldConfig import-block validation (valid, invalid segments, _atlas, absent)"
```

---

## Task 4: build-atlas DM / player `importFolders` presence test

**Files:**
- Modify: `src/test/atlas-build.test.ts`

The spec (§6) requires a test asserting `worlds[0].importFolders` is present in DM builds and absent from `--player` builds. Read `src/test/atlas-build.test.ts` to understand the `run()`, `writeWorldVault()`, and `tmpRoot` helpers — they are already defined there. Add the new test inside the existing `describe.sequential("atlas build pipeline", ...)` block, after the last `it(...)`.

- [ ] **Step 1: Read the test file to find the correct insertion point**

Read `src/test/atlas-build.test.ts` lines 56-100 to confirm the `read()` helper signature and the `writeWorldVault(dir, worldYaml)` helper. Note that `read()` returns a typed object — you will need to cast the raw JSON for the `worlds` field.

- [ ] **Step 2: Write the test**

Inside `describe.sequential("atlas build pipeline", ...)` before the closing `});`, add:

```ts
  it("emits importFolders in DM build and omits it from --player build", () => {
    const vaultDir = path.join(tmpRoot, "import-folders-vault");
    writeWorldVault(
      vaultDir,
      `
maps:
  - id: m1
    name: Main
    width: 1000
    height: 1000
import:
  folders:
    npc: npcs
  defaultFolder: imports
`,
    );

    // DM build
    const dmOut = path.join(tmpRoot, "import-folders-dm");
    const dm = run(["--config", path.join(vaultDir, "atlas.config.json"), "--out", dmOut]);
    expect(dm.status, dm.stderr).toBe(0);
    const dmAtlas = JSON.parse(
      fs.readFileSync(path.join(dmOut, "atlas.json"), "utf8"),
    ) as { worlds: Array<{ importFolders?: unknown }> };
    expect(dmAtlas.worlds[0].importFolders).toEqual({
      folders: { npc: "npcs" },
      defaultFolder: "imports",
    });

    // Player build
    const playerOut = path.join(tmpRoot, "import-folders-player");
    const player = run([
      "--player",
      "--config",
      path.join(vaultDir, "atlas.config.json"),
      "--out",
      playerOut,
    ]);
    expect(player.status, player.stderr).toBe(0);
    const playerAtlas = JSON.parse(
      fs.readFileSync(path.join(playerOut, "atlas.json"), "utf8"),
    ) as { worlds: Array<{ importFolders?: unknown }> };
    expect(playerAtlas.worlds[0].importFolders).toBeUndefined();
  });
```

- [ ] **Step 3: Run — expect PASS**

Run: `npx vitest run src/test/atlas-build.test.ts`

Expected: PASS (all existing tests + 1 new).

These are integration tests that spawn `build-atlas.ts` as a subprocess — they are slow (~3–4 s each). A timeout of 30 s per test is already configured by the suite.

- [ ] **Step 4: Commit**

```bash
git add src/test/atlas-build.test.ts
git commit -m "test: importFolders present in DM atlas.json and absent in player build"
```

---

## Task 5: Full gate

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`

Expected: no output (zero errors).

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`

Expected: all tests pass, 0 failures.

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: 0 errors (warnings are pre-existing and acceptable).

- [ ] **Step 4: Atlas publish (player-safe + secret/derived scans)**

Run: `npm run atlas:publish`

Expected: exits 0, `atlas:check-secrets` and `atlas:check-derived` both report clean.

- [ ] **Step 5: Commit if any cleanup was needed**

If the gate required any fixes, commit them. If it was clean, no additional commit needed.

---

## Definition of done

- `npm test`, `npm run lint`, `npm run atlas:publish` all green.
- "Select all overwrites" button renders and works for path-collision batches.
- Adding a new entity type to `world.yaml import.folders` requires zero code changes — the type dropdown in the staging modal derives its options from `importConfig`.
- `loadWorldConfig` import-block edge cases (invalid segments, `_atlas`, absent block) are tested.
- `worlds[0].importFolders` is verified present in DM builds and absent in player builds.
