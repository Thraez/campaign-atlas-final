# Vault Publishing (part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the DM see which published vault notes have changed, pull images out of their notes safely, and browse a 2,179-note vault by folder instead of all at once.

**Architecture:** Three additive phases on top of the shipped Obsidian sync (`2026-06-16-obsidian-readonly-merge-design.md`). Phase A adds a content hash to the machine-local sync map so vault drift becomes computable. Phase B adds a folder-summary endpoint plus a `candidateFolders` setting so scans read only what the DM picked. Phase C resolves `![[image]]` embeds server-side, refusing any image outside the picked folders, and copies them with metadata stripped. Nothing writes to the vault; nothing weakens the existing visibility defaults.

**Tech Stack:** TypeScript, React, Vite dev-server middleware, picomatch, sharp, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-01-vault-publishing-design.md`

**Each phase ships on its own.** A is the highest value and has no dependency on B or C. C depends on B (image refusal is defined in terms of candidate folders).

---

## File Structure

**Phase A — change detection**
- Modify `src/atlas/import/syncMap.ts` — add `approvedHash`, classification, hash lookup. Pure, no I/O.
- Modify `src/atlas/import/stagingState.ts` — carry `vaultState` on rows; unchanged rows default to not-included.
- Modify `src/atlas/import/useMdImportFlow.ts` — hash scanned notes, classify, record hash on successful commit.
- Modify `src/atlas/sync/SyncPanel.tsx` — collapse unchanged notes behind a summary line.
- Test: `src/test/import/syncMap.test.ts` (new), `src/test/import/vault-drift.test.ts` (new).

**Phase B — folder scoping**
- Modify `scripts/vite-plugin-atlas-save.ts` — `handleVaultFoldersRequest` + route; `handleVaultScanRequest` takes include folders.
- Modify `src/atlas/sync/useSyncSettings.ts` — `candidateFolders`.
- Modify `src/atlas/sync/SyncPanel.tsx` — folder picker.
- Modify `src/atlas/import/useMdImportFlow.ts` — pass folders to the scan.
- Test: `src/test/import/vault-folders.test.ts` (new), `src/test/import/vault-scan.test.ts` (existing).

**Phase C — images**
- Create `src/atlas/import/resolveVaultImage.ts` — pure resolution + naming.
- Modify `scripts/vite-plugin-atlas-save.ts` — `handleVaultImageCopyRequest` + route.
- Modify `src/atlas/import/parseObsidian.ts` — entity-derived attachment naming.
- Modify `src/atlas/import/useMdImportFlow.ts` — copy images, rewrite bodies, report skips.
- Test: `src/test/import/resolveVaultImage.test.ts` (new), `src/test/import/vault-image-copy.test.ts` (new).

---

# Phase A — "which of my published notes changed?"

### Task A1: Content hash on the sync map

**Files:**
- Modify: `src/atlas/import/syncMap.ts`
- Test: `src/test/import/syncMap.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/import/syncMap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  classifyVaultNote,
  recordSync,
  findPathByApprovedHash,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/syncMap.test.ts`
Expected: FAIL — `classifyVaultNote` and `findPathByApprovedHash` are not exported.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/atlas/import/syncMap.ts`:

```ts
/** Entry stored per vault-relative POSIX path after a completed sync. */
export interface SyncMapEntry {
  /** Atlas entity id that this vault note last synced into. */
  id: string;
  /** Last-synced vault type (used for two-way type conflict detection in §3.6). */
  baseType: string;
  /**
   * `sha256:<hex>` of the vault note's raw bytes at the last successful sync.
   * Optional because maps written before this feature have no hash; those
   * entries classify as "unknown" once, then settle on the next sync.
   */
  approvedHash?: string;
}

/** Keyed by vault-relative POSIX path (e.g. "notes/corven.md"). */
export type SyncMap = Record<string, SyncMapEntry>;

/** How a scanned vault note relates to what was last published from it. */
export type VaultNoteState = "unchanged" | "changed" | "new" | "unknown";

/** Return the sync-map entry for a vault-relative path, or undefined if not present. */
export function lookupByPath(map: SyncMap, relPath: string): SyncMapEntry | undefined {
  return map[relPath];
}

/**
 * Compare a scanned note against what was last published from that path.
 * `currentHash` must come from hashContent() so the formats match.
 */
export function classifyVaultNote(
  map: SyncMap,
  relPath: string,
  currentHash: string,
): VaultNoteState {
  const entry = map[relPath];
  if (!entry) return "new";
  if (!entry.approvedHash) return "unknown";
  return entry.approvedHash === currentHash ? "unchanged" : "changed";
}

/**
 * Exact-hash lookup used to spot a renamed/moved note: a note with no entry at
 * its own path whose bytes match a hash recorded elsewhere. Exact match only —
 * deliberately not fuzzy (design §3, June §5.3).
 */
export function findPathByApprovedHash(map: SyncMap, hash: string): string | undefined {
  for (const [relPath, entry] of Object.entries(map)) {
    if (entry.approvedHash === hash) return relPath;
  }
  return undefined;
}

/** Return a new SyncMap with the given entry added or updated (pure — does not mutate the original). */
export function recordSync(
  map: SyncMap,
  relPath: string,
  id: string,
  baseType: string,
  approvedHash?: string,
): SyncMap {
  return {
    ...map,
    [relPath]: { id, baseType, ...(approvedHash ? { approvedHash } : {}) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/syncMap.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck (the `recordSync` signature grew)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean. The new parameter is optional, so existing 4-argument callers still compile.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/import/syncMap.ts src/test/import/syncMap.test.ts
git commit -F - <<'EOF'
feat(sync): record what a vault note looked like when it was published

Adds approvedHash to the sync map plus pure helpers to classify a scanned
note as new/changed/unchanged, and to find a moved note by exact content
hash. No behaviour change yet — nothing writes or reads the hash.
EOF
```

---

### Task A2: Carry the state onto staging rows

**Files:**
- Modify: `src/atlas/import/stagingState.ts` (the `RawFileInput` and `StagingRow` interfaces, and the `included` default at ~:292)
- Test: `src/test/import/vault-drift.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/import/vault-drift.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStagingRows } from "@/atlas/import/stagingState";

const NOTE = `---\ntitle: Corven\ntags: [npc]\n---\n\nA quiet smuggler.\n`;

function rowsFor(vaultState: "unchanged" | "changed" | "new") {
  return buildStagingRows(
    [{ filename: "Corven.md", raw: NOTE, vaultRelPath: "03_Entities/Corven.md", vaultState }],
    {
      worldId: "astrath-deeprealm",
      importConfig: { folders: {} },
      existingById: new Map<string, string>(),
    },
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
```

> If `buildStagingRows`' second argument differs in this codebase, match the call
> shape used in `src/test/import/` — do not change the production signature to fit
> the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/vault-drift.test.ts`
Expected: FAIL — `vaultState` is not a known property.

- [ ] **Step 3: Add the field to both interfaces**

In `src/atlas/import/stagingState.ts`, import the type at the top:

```ts
import type { VaultNoteState } from "./syncMap";
```

Add to `RawFileInput`:

```ts
  /** Drift state from the sync map — present only for rows from a vault scan. */
  vaultState?: VaultNoteState;
```

Add to `StagingRow`, next to the existing `vaultRelPath` field (~:128):

```ts
  /** Drift state vs the last publish of this note. Undefined for non-vault rows. */
  vaultState?: VaultNoteState;
```

- [ ] **Step 4: Default unchanged rows to not-included**

In `buildStagingRows`, find the `included` computation (~:292):

```ts
  const included = !parseError && pathAllowed && rowKind !== "path-collision" && !needsReview;
```

Replace with:

```ts
  // An unchanged note has nothing to import — leave it unticked so the default
  // action on a re-sync is "bring in what actually moved".
  const included =
    !parseError &&
    pathAllowed &&
    rowKind !== "path-collision" &&
    !needsReview &&
    input.vaultState !== "unchanged";
```

Then carry it onto the constructed row, next to `vaultRelPath`:

```ts
    vaultState: input.vaultState,
```

> `input` is the `RawFileInput` in scope in that function. If it is named
> differently, use the local name rather than renaming it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/import/vault-drift.test.ts src/test/import/`
Expected: PASS. The whole `import/` folder runs so a changed `included` default can't quietly break existing staging tests.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/import/stagingState.ts src/test/import/vault-drift.test.ts
git commit -F - <<'EOF'
feat(sync): leave unchanged notes unticked on re-sync

Staging rows carry their vault drift state, and a note whose bytes match
what was last published defaults to not-included.
EOF
```

---

### Task A3: Compute hashes during the scan, save them after a successful sync

**Files:**
- Modify: `src/atlas/import/useMdImportFlow.ts` (`openWithVaultScan` ~:113, and the commit path)
- Test: `src/test/import/vault-drift.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/test/import/vault-drift.test.ts`:

```ts
import { hashContent } from "@/atlas/save/localFsSave";
import { classifyVaultNote, recordSync } from "@/atlas/import/syncMap";

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
```

- [ ] **Step 2: Run test to verify it passes already**

Run: `npx vitest run src/test/import/vault-drift.test.ts`
Expected: PASS — this pins the contract between `hashContent` and the classifier before wiring. If it fails, the hash format differs and Task A1 must be fixed first.

- [ ] **Step 3: Hash and classify inside `openWithVaultScan`**

In `src/atlas/import/useMdImportFlow.ts`, add imports:

```ts
import { hashContent } from "@/atlas/save/localFsSave";
import { classifyVaultNote, findPathByApprovedHash } from "./syncMap";
import { loadSyncMap, saveSyncMap } from "@/atlas/sync/useSyncSettings";
```

After the vault-scan response is parsed into `data.files` and before rows are built, replace the plain mapping with:

```ts
  const syncMap = await loadSyncMap();
  const inputs = await Promise.all(
    Object.entries(data.files).map(async ([relPath, raw]) => {
      const hash = await hashContent(raw);
      let vaultState = classifyVaultNote(syncMap, relPath, hash);
      // A note with no entry at its own path whose bytes match a hash recorded
      // elsewhere is a move/rename, not a new note.
      if (vaultState === "new" && findPathByApprovedHash(syncMap, hash)) {
        vaultState = "unchanged";
      }
      return {
        filename: relPath.split("/").pop() ?? relPath,
        raw,
        vaultRelPath: relPath,
        vaultState,
        vaultHash: hash,
      };
    }),
  );
```

Feed `inputs` into `buildStagingRows` exactly where the previous mapping was fed in. Keep `vaultHash` on the input object so the commit step can record it; add it to `RawFileInput` in `stagingState.ts`:

```ts
  /** Hash of the raw vault bytes, recorded into the sync map after a successful sync. */
  vaultHash?: string;
```

and onto `StagingRow` beside `vaultState`:

```ts
  /** Hash of the raw vault bytes for this row (vault scans only). */
  vaultHash?: string;
```

and carry it in the row constructor beside `vaultState`:

```ts
    vaultHash: input.vaultHash,
```

- [ ] **Step 4: Record the hash only on a successful commit**

In the same file, find the commit path where `recordSync` is already called for synced rows. Pass the hash as the new fifth argument:

```ts
      next = recordSync(next, row.vaultRelPath, row.resolvedId, row.resolvedType, row.vaultHash);
```

> Use the identifiers already present at that call site for id and type — do not
> introduce new ones. The only change is appending `row.vaultHash`.

The existing code writes the map with `saveSyncMap` after a successful save. Leave
that placement unchanged: a failed or cancelled sync must not record a hash.

- [ ] **Step 5: Run the import tests and typecheck**

Run: `npx vitest run src/test/import/`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/import/useMdImportFlow.ts src/atlas/import/stagingState.ts src/test/import/vault-drift.test.ts
git commit -F - <<'EOF'
feat(sync): detect vault notes that changed since they were published

Scans now hash each note and compare it to the hash recorded at the last
successful sync. A moved note whose bytes are identical is recognised as a
move rather than reported as new.
EOF
```

---

### Task A4: Show it in the panel

**Files:**
- Modify: `src/atlas/sync/SyncPanel.tsx`
- Test: `src/test/sync-panel.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/test/sync-panel.test.tsx`:

```tsx
import { VaultSyncSummary } from "@/atlas/sync/SyncPanel";

describe("VaultSyncSummary", () => {
  it("leads with what changed", () => {
    render(<VaultSyncSummary changed={3} added={1} unchanged={45} />);
    expect(screen.getByText(/3 notes changed since you published them/i)).toBeInTheDocument();
    expect(screen.getByText(/1 new note/i)).toBeInTheDocument();
  });

  it("keeps unchanged notes quiet but visible as a count", () => {
    render(<VaultSyncSummary changed={0} added={0} unchanged={45} />);
    expect(screen.getByText(/45 unchanged/i)).toBeInTheDocument();
  });

  it("says nothing changed when nothing changed", () => {
    render(<VaultSyncSummary changed={0} added={0} unchanged={0} />);
    expect(screen.getByText(/nothing to bring over/i)).toBeInTheDocument();
  });
});
```

> Match the existing import style at the top of `sync-panel.test.tsx` for
> `render`/`screen` rather than adding a second testing-library import.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sync-panel.test.tsx`
Expected: FAIL — `VaultSyncSummary` is not exported.

- [ ] **Step 3: Implement the summary**

Add to `src/atlas/sync/SyncPanel.tsx`:

```tsx
export interface VaultSyncSummaryProps {
  changed: number;
  added: number;
  unchanged: number;
}

/**
 * Plain-language read-out after a scan. Leads with what needs attention;
 * unchanged notes are reduced to a count so a large vault stays quiet.
 */
export function VaultSyncSummary({ changed, added, unchanged }: VaultSyncSummaryProps) {
  if (changed === 0 && added === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {unchanged > 0
          ? `Nothing to bring over — ${unchanged} unchanged.`
          : "Nothing to bring over."}
      </p>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      {changed > 0 && (
        <p>
          <strong>
            {changed} {changed === 1 ? "note has" : "notes"} changed since you published{" "}
            {changed === 1 ? "it" : "them"}.
          </strong>
        </p>
      )}
      {added > 0 && (
        <p>
          {added} new {added === 1 ? "note" : "notes"} not published yet.
        </p>
      )}
      {unchanged > 0 && <p className="text-muted-foreground">{unchanged} unchanged.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sync-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sync/SyncPanel.tsx src/test/sync-panel.test.tsx
git commit -F - <<'EOF'
feat(sync): say plainly what changed in the vault

Leads with the notes that moved, counts the rest.
EOF
```

---

### Task A5: Prove the safety property

**Files:**
- Test: `src/test/import/vault-drift.test.ts` (extend)

- [ ] **Step 1: Write the property test**

Append:

```ts
describe("rework never reaches players on its own", () => {
  it("a changed note is reported but not auto-included when unticked", () => {
    const rows = rowsFor("changed");
    // The DM must act: an unticked row contributes no file change.
    const untouched = rows.map((r) => ({ ...r, included: false }));
    expect(untouched.every((r) => !r.included)).toBe(true);
    expect(rows[0].vaultState).toBe("changed");
  });
});
```

- [ ] **Step 2: Mutation-check the drift classifier**

Temporarily break `classifyVaultNote` in `src/atlas/import/syncMap.ts` — make it always return `"unchanged"`:

```ts
  return "unchanged";
```

Run: `npx vitest run src/test/import/`
Expected: **FAIL** — the "reports a changed note when the hash differs" and "a note edited after sync classifies as changed" tests must both fail.

If they pass, the tests are vacuous and must be fixed before continuing. Per the audio-prune lesson, a regression test that has never failed proves nothing.

- [ ] **Step 3: Revert the mutation**

```bash
git checkout -- src/atlas/import/syncMap.ts
```

Run: `npx vitest run src/test/import/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/test/import/vault-drift.test.ts
git commit -F - <<'EOF'
test(sync): pin that reworked notes are reported, never auto-applied
EOF
```

---

### Task A6: Warn when a vault change would land on a note edited here

Spec §3, "Honest limit". A changed vault note overlays the atlas copy's content
keys (June §3.3). If the DM has since edited that note in the atlas editor, that
edit is about to be overwritten and they must be told before it happens.

**Files:**
- Modify: `src/atlas/import/syncMap.ts`
- Modify: `src/atlas/import/stagingState.ts` (the `needsReview` union at ~:126)
- Modify: `src/atlas/import/useMdImportFlow.ts`
- Test: `src/test/import/syncMap.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/test/import/syncMap.test.ts`:

```ts
import { hasLocalEdits } from "@/atlas/import/syncMap";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/syncMap.test.ts`
Expected: FAIL — `hasLocalEdits` is not exported.

- [ ] **Step 3: Implement**

In `src/atlas/import/syncMap.ts`, add to `SyncMapEntry`:

```ts
  /**
   * `sha256:<hex>` of the atlas-side file exactly as the last sync wrote it.
   * Lets us tell "the DM edited this here" apart from "the sync wrote it".
   */
  syncedFileHash?: string;
```

Add the predicate:

```ts
/**
 * True when the atlas-side file differs from what the last sync wrote — i.e. the
 * DM edited it in the editor. Returns false when unknown, so a first sync never
 * raises a false alarm.
 */
export function hasLocalEdits(
  map: SyncMap,
  relPath: string,
  currentFileHash: string,
): boolean {
  const entry = map[relPath];
  if (!entry?.syncedFileHash) return false;
  return entry.syncedFileHash !== currentFileHash;
}
```

Widen `recordSync` to carry it:

```ts
export function recordSync(
  map: SyncMap,
  relPath: string,
  id: string,
  baseType: string,
  approvedHash?: string,
  syncedFileHash?: string,
): SyncMap {
  return {
    ...map,
    [relPath]: {
      id,
      baseType,
      ...(approvedHash ? { approvedHash } : {}),
      ...(syncedFileHash ? { syncedFileHash } : {}),
    },
  };
}
```

- [ ] **Step 4: Add the review reason**

In `src/atlas/import/stagingState.ts`, widen the union (~:126):

```ts
  needsReview?: {
    reason: "secrecy-increase" | "rename-link" | "type-conflict" | "local-edits";
  };
```

- [ ] **Step 5: Flag the row and record the hash**

In `src/atlas/import/useMdImportFlow.ts`, when a scanned row is an `update` whose
`vaultState` is `"changed"`, compare the current on-disk atlas content hash
(already computed for `baseHash` in `buildImportChanges`) against
`hasLocalEdits(...)`, and set `needsReview: { reason: "local-edits" }`. A
`needsReview` row already defaults to unticked, so the DM must opt in.

At commit, pass the hash of the content actually written as the sixth argument to
`recordSync`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/test/import/`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/atlas/import/syncMap.ts src/atlas/import/stagingState.ts src/atlas/import/useMdImportFlow.ts src/test/import/syncMap.test.ts
git commit -F - <<'EOF'
feat(sync): warn before a vault change overwrites an edit made here

A changed note that would land on a file the DM edited in the atlas is held
for review instead of being ticked by default.
EOF
```

---

# Phase B — browsing that fits the vault

### Task B1: Folder-summary endpoint

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts` (beside `handleVaultScanRequest` ~:960; route beside ~:1218)
- Test: `src/test/import/vault-folders.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/import/vault-folders.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleVaultFoldersRequest } from "../../../scripts/vite-plugin-atlas-save";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-folders-"));
  fs.mkdirSync(path.join(root, "03_Entities"));
  fs.writeFileSync(path.join(root, "03_Entities", "Corven.md"), "# Corven");
  fs.writeFileSync(path.join(root, "03_Entities", "Edric.md"), "# Edric");
  fs.mkdirSync(path.join(root, "03_Entities", "minor"));
  fs.writeFileSync(path.join(root, "03_Entities", "minor", "Soreth.md"), "# Soreth");
  fs.mkdirSync(path.join(root, "10_DmNotesAndSecrets"));
  fs.writeFileSync(path.join(root, "10_DmNotesAndSecrets", "Cabal.md"), "# Cabal");
  fs.writeFileSync(path.join(root, "loose.md"), "# Loose");
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("handleVaultFoldersRequest", () => {
  it("counts notes per top-level folder, recursively", async () => {
    const res = await handleVaultFoldersRequest(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const entities = res.folders.find((f) => f.name === "03_Entities");
    expect(entities?.noteCount).toBe(3);
  });

  it("returns no file contents", async () => {
    const res = await handleVaultFoldersRequest(root);
    expect(JSON.stringify(res)).not.toContain("Corven");
  });

  it("lists every top-level folder so the DM chooses, and never pre-picks", async () => {
    const res = await handleVaultFoldersRequest(root);
    if (!res.ok) return;
    const names = res.folders.map((f) => f.name);
    expect(names).toContain("10_DmNotesAndSecrets");
    expect(res.folders.every((f) => !("selected" in f))).toBe(true);
  });

  it("errors cleanly when the path is not a directory", async () => {
    const res = await handleVaultFoldersRequest(path.join(root, "loose.md"));
    expect(res).toEqual({ ok: false, status: 400, error: "VaultNotDirectory" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/vault-folders.test.ts`
Expected: FAIL — `handleVaultFoldersRequest` is not exported.

- [ ] **Step 3: Implement the handler**

Add to `scripts/vite-plugin-atlas-save.ts`, directly after `handleVaultScanRequest`:

```ts
export interface VaultFolderSummary {
  name: string;
  noteCount: number;
}

/**
 * Pure handler for GET /__atlas/vault-folders.
 * Returns each top-level folder with a recursive .md count. Never returns file
 * contents — this is the cheap listing that lets the DM pick folders before any
 * note is read. Read-only.
 */
export async function handleVaultFoldersRequest(
  vaultRoot: string,
): Promise<
  { ok: true; folders: VaultFolderSummary[] } | { ok: false; status: number; error: string }
> {
  try {
    const s = await fs.stat(vaultRoot);
    if (!s.isDirectory()) return { ok: false, status: 400, error: "VaultNotDirectory" };
  } catch {
    return { ok: false, status: 400, error: "VaultNotFound" };
  }

  const rootResolved = path.resolve(vaultRoot);

  async function countMd(dir: string): Promise<number> {
    let total = 0;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) total += await countMd(abs);
      else if (e.name.endsWith(".md") && isReadableVaultPath(rootResolved, abs)) total += 1;
    }
    return total;
  }

  const folders: VaultFolderSummary[] = [];
  for (const e of await fs.readdir(rootResolved, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const abs = path.join(rootResolved, e.name);
    if (!isReadableVaultPath(rootResolved, abs)) continue;
    folders.push({ name: e.name, noteCount: await countMd(abs) });
  }
  folders.sort((a, b) => b.noteCount - a.noteCount);
  return { ok: true, folders };
}
```

- [ ] **Step 4: Register the route**

Beside the existing `/__atlas/vault-scan` registration (~:1218):

```ts
      // GET /__atlas/vault-folders?vaultRoot=<abs>
      server.middlewares.use("/__atlas/vault-folders", (req, res, next) => {
        if (!isAllowedDevRequest(req)) return next();
        if (req.method !== "GET") return next();
        const url = new URL(req.url ?? "", "http://localhost");
        const vaultRoot = url.searchParams.get("vaultRoot") ?? "";
        if (!vaultRoot) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "MissingVaultRoot" }));
          return;
        }
        handleVaultFoldersRequest(vaultRoot).then((result) => {
          res.statusCode = result.ok ? 200 : result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        });
      });
```

> Match the exact guard and response style of the neighbouring `vault-scan`
> registration; if it wraps differently, copy that shape rather than this one.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/import/vault-folders.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/vite-plugin-atlas-save.ts src/test/import/vault-folders.test.ts
git commit -F - <<'EOF'
feat(sync): list vault folders with note counts, without reading notes
EOF
```

---

### Task B2: Scan only the chosen folders

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts` (`handleVaultScanRequest` ~:960, route ~:1218)
- Modify: `src/atlas/sync/useSyncSettings.ts`
- Test: `src/test/import/vault-scan.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/test/import/vault-scan.test.ts` (reuse that file's existing fixture setup; if its root has no second folder, add one in its `beforeAll`):

```ts
describe("folder scoping", () => {
  it("reads only the folders the DM picked", async () => {
    const res = await handleVaultScanRequest(root, [], ["03_Entities"]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const paths = Object.keys(res.files);
    expect(paths.every((p) => p.startsWith("03_Entities/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("10_DmNotesAndSecrets/"))).toBe(false);
  });

  it("reads everything when no folders are picked, preserving today's behaviour", async () => {
    const res = await handleVaultScanRequest(root, [], []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.files).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/vault-scan.test.ts`
Expected: FAIL — `handleVaultScanRequest` takes 2 arguments.

- [ ] **Step 3: Add the parameter**

Change the signature of `handleVaultScanRequest` in `scripts/vite-plugin-atlas-save.ts`:

```ts
export async function handleVaultScanRequest(
  vaultRoot: string,
  ignoreGlobs: string[],
  includeFolders: string[] = [],
): Promise<
  { ok: true; files: Record<string, string> } | { ok: false; status: number; error: string }
> {
```

Immediately after `const isIgnored = makeIgnore(ignoreGlobs);` add:

```ts
  // Folder scoping: when the DM has picked folders, a note must sit inside one.
  // The pattern is built here, never typed by the DM — a bare folder name is not
  // a glob and would match nothing (see design §2).
  const inScope = (relPosix: string): boolean =>
    includeFolders.length === 0 ||
    includeFolders.some((f) => relPosix === f || relPosix.startsWith(`${f}/`));
```

In `processFile`, after the existing `isIgnored` check, add:

```ts
    if (!inScope(relPosix)) return null;
```

- [ ] **Step 4: Pass it through the route**

In the `/__atlas/vault-scan` registration, read repeated `folder` params and pass them:

```ts
        const includeFolders = url.searchParams.getAll("folder");
        handleVaultScanRequest(vaultRoot, ignoreGlobs, includeFolders).then((result) => {
```

- [ ] **Step 5: Add the setting**

In `src/atlas/sync/useSyncSettings.ts`, extend the interface:

```ts
export interface SyncSettings {
  vaultPath?: string;
  /** Top-level vault folders the DM draws from. Empty/absent = the whole vault. */
  candidateFolders?: string[];
  ignoreGlobs?: string[];
  lastSyncAt?: string;
}
```

- [ ] **Step 6: Send it from the client**

In `src/atlas/import/useMdImportFlow.ts`, widen `openWithVaultScan`:

```ts
  const openWithVaultScan = useCallback(
    async (vaultRoot: string, ignoreGlobs: string[], candidateFolders: string[] = []) => {
```

and add the params beside the existing ignore params:

```ts
      for (const f of candidateFolders) params.append("folder", f);
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/test/import/`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add scripts/vite-plugin-atlas-save.ts src/atlas/sync/useSyncSettings.ts src/atlas/import/useMdImportFlow.ts src/test/import/vault-scan.test.ts
git commit -F - <<'EOF'
feat(sync): scan only the vault folders the DM picked

A 2,179-note vault no longer arrives in one table. Folder patterns are
generated, never typed, so a bare folder name cannot silently match nothing.
EOF
```

---

### Task B3: Folder picker in the panel

**Files:**
- Modify: `src/atlas/sync/SyncPanel.tsx`
- Test: `src/test/sync-panel.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/test/sync-panel.test.tsx`:

```tsx
import { VaultFolderPicker } from "@/atlas/sync/SyncPanel";

describe("VaultFolderPicker", () => {
  const folders = [
    { name: "03_Entities", noteCount: 55 },
    { name: "10_DmNotesAndSecrets", noteCount: 49 },
  ];

  it("shows each folder with how many notes it holds", () => {
    render(<VaultFolderPicker folders={folders} selected={[]} onChange={() => {}} />);
    expect(screen.getByText("03_Entities")).toBeInTheDocument();
    expect(screen.getByText(/55 notes/i)).toBeInTheDocument();
  });

  it("reports the folder name when ticked, so callers build the pattern", async () => {
    const onChange = vi.fn();
    render(<VaultFolderPicker folders={folders} selected={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /03_Entities/i }));
    expect(onChange).toHaveBeenCalledWith(["03_Entities"]);
  });

  it("unticks a selected folder", async () => {
    const onChange = vi.fn();
    render(
      <VaultFolderPicker folders={folders} selected={["03_Entities"]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /03_Entities/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sync-panel.test.tsx`
Expected: FAIL — `VaultFolderPicker` is not exported.

- [ ] **Step 3: Implement the picker**

Add to `src/atlas/sync/SyncPanel.tsx`:

```tsx
export interface VaultFolderPickerProps {
  folders: { name: string; noteCount: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Folder chooser for the vault. The DM ticks folders; the caller turns those
 * names into scan parameters. Deliberately not a glob box — see design §5.
 */
export function VaultFolderPicker({ folders, selected, onChange }: VaultFolderPickerProps) {
  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name],
    );
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">Folders to draw from</Label>
      <ul className="space-y-1">
        {folders.map((f) => (
          <li key={f.name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id={`vault-folder-${f.name}`}
              checked={selected.includes(f.name)}
              onChange={() => toggle(f.name)}
            />
            <label htmlFor={`vault-folder-${f.name}`} className="flex-1">
              {f.name}
            </label>
            <span className="text-xs text-muted-foreground">{f.noteCount} notes</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the panel body**

Inside `SyncPanel`, add state and a fetch, and persist the choice with the other settings:

```tsx
  const [folders, setFolders] = useState<{ name: string; noteCount: number }[]>([]);
  const [candidateFolders, setCandidateFolders] = useState<string[]>([]);

  const loadFolders = useCallback(async () => {
    const root = vaultPath.trim();
    if (!root) return;
    const resp = await fetch(
      `/__atlas/vault-folders?vaultRoot=${encodeURIComponent(root)}`,
    );
    const data = (await resp.json()) as
      | { ok: true; folders: { name: string; noteCount: number }[] }
      | { ok: false; error: string };
    if (data.ok) setFolders(data.folders);
    else toast.error("Couldn't read that vault folder — check the path.");
  }, [vaultPath]);
```

In the existing `useEffect` that loads settings, also seed the selection:

```tsx
      setCandidateFolders(s.candidateFolders ?? []);
```

In `handleSave`, include it in `next`:

```tsx
        candidateFolders,
```

In `handleSync`, pass it through:

```tsx
      await onSync(root, globs, candidateFolders);
```

and widen the prop type:

```tsx
  onSync: (
    vaultRoot: string,
    ignoreGlobs: string[],
    candidateFolders: string[],
  ) => void | Promise<void>;
```

Render `<VaultFolderPicker folders={folders} selected={candidateFolders} onChange={setCandidateFolders} />`
under the vault-path input, with a button that calls `loadFolders`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/test/sync-panel.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean. Fix the `onSync` call site in `AtlasPlacementEditor.tsx` if it complains about arity.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/sync/SyncPanel.tsx src/test/sync-panel.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -F - <<'EOF'
feat(sync): pick vault folders with tick boxes instead of typing globs
EOF
```

---

# Phase C — images

### Task C1: Resolve an embed against the vault, safely

**Files:**
- Create: `src/atlas/import/resolveVaultImage.ts`
- Test: `src/test/import/resolveVaultImage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/import/resolveVaultImage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveVaultImage, vaultImageTargetName } from "@/atlas/import/resolveVaultImage";

const INDEX = [
  "03_Entities/pics/corven-portrait.png",
  "99_Attachments/tavern.jpg",
  "10_DmNotesAndSecrets/maps/cabal-lair.png",
];

describe("resolveVaultImage", () => {
  it("finds an image by basename anywhere in scope", () => {
    const r = resolveVaultImage("tavern.jpg", "03_Entities/Corven.md", INDEX, ["03_Entities", "99_Attachments"]);
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
    const r = resolveVaultImage("pics/corven-portrait.png", "03_Entities/Corven.md", INDEX, ["03_Entities"]);
    expect(r).toEqual({ ok: true, relPath: "03_Entities/pics/corven-portrait.png" });
  });

  it("refuses a traversal attempt", () => {
    const r = resolveVaultImage("../../etc/passwd.png", "03_Entities/Corven.md", INDEX, ["03_Entities"]);
    expect(r).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("vaultImageTargetName", () => {
  it("names from the entity, never the source file", () => {
    expect(vaultImageTargetName("corven", 0, "the-cabal-lair.png")).toBe("corven-1.png");
  });

  it("numbers multiple images per entity", () => {
    expect(vaultImageTargetName("corven", 2, "x.webp")).toBe("corven-3.webp");
  });

  it("lowercases the extension", () => {
    expect(vaultImageTargetName("corven", 0, "P.PNG")).toBe("corven-1.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/resolveVaultImage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/atlas/import/resolveVaultImage.ts`:

```ts
/**
 * Pure resolution of an Obsidian image embed against a vault file index.
 *
 * Two rules, both required:
 *   1. the image must exist in the index;
 *   2. it must sit inside a folder the DM chose.
 *
 * Rule 2 is a secrecy rule, not a tidiness rule: an embed can name an image
 * living in a DM-only folder, and copying that out would publish it. Refusal
 * is reported to the DM, never silent.
 */
export type VaultImageResolution =
  | { ok: true; relPath: string }
  | { ok: false; reason: "not-found" | "outside-candidates" };

function inCandidates(relPath: string, candidateFolders: string[]): boolean {
  if (candidateFolders.length === 0) return true;
  return candidateFolders.some((f) => relPath === f || relPath.startsWith(`${f}/`));
}

export function resolveVaultImage(
  rawSrc: string,
  noteRelPath: string,
  vaultFileIndex: string[],
  candidateFolders: string[],
): VaultImageResolution {
  const src = rawSrc.trim();
  if (!src || src.includes("..")) return { ok: false, reason: "not-found" };

  let hit: string | undefined;
  if (src.includes("/")) {
    // Relative to the note's folder first, then vault-root-relative.
    const noteDir = noteRelPath.split("/").slice(0, -1).join("/");
    const candidates = [noteDir ? `${noteDir}/${src}` : src, src];
    hit = vaultFileIndex.find((p) => candidates.includes(p));
  } else {
    hit = vaultFileIndex.find((p) => (p.split("/").pop() ?? p) === src);
  }

  if (!hit) return { ok: false, reason: "not-found" };
  if (!inCandidates(hit, candidateFolders)) return { ok: false, reason: "outside-candidates" };
  return { ok: true, relPath: hit };
}

/**
 * Target filename for a copied image. Derived from the entity id and an index —
 * never from the source filename, which can itself be a spoiler
 * ("the-cabal-lair.png") and would trip the image-privacy filename scan.
 */
export function vaultImageTargetName(entityId: string, index: number, sourceName: string): string {
  const ext = (sourceName.match(/\.[^.]+$/)?.[0] ?? ".png").toLowerCase();
  return `${entityId}-${index + 1}${ext}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/resolveVaultImage.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Mutation-check the secrecy rule**

Temporarily make `inCandidates` always return `true`.

Run: `npx vitest run src/test/import/resolveVaultImage.test.ts`
Expected: **FAIL** on "refuses an image that lives outside the chosen folders".

Revert:

```bash
git checkout -- src/atlas/import/resolveVaultImage.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/atlas/import/resolveVaultImage.ts src/test/import/resolveVaultImage.test.ts
git commit -F - <<'EOF'
feat(images): resolve vault image embeds, refusing anything outside scope

An embed can name an image sitting in a DM-only folder. Resolution refuses
it and reports why, rather than copying it out.
EOF
```

---

### Task C2: Server-side copy with metadata stripped

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts`
- Test: `src/test/import/vault-image-copy.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/import/vault-image-copy.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { handleVaultImageCopyRequest } from "../../../scripts/vite-plugin-atlas-save";

let root: string;
let outRoot: string;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-img-"));
  outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-img-out-"));
  fs.mkdirSync(path.join(root, "03_Entities", "pics"), { recursive: true });
  fs.mkdirSync(path.join(root, "10_DmNotesAndSecrets"), { recursive: true });
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .withExifMerge({ IFD0: { Copyright: "SECRET-LOCATION" } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(root, "03_Entities", "pics", "portrait.png"), png);
  fs.writeFileSync(path.join(root, "10_DmNotesAndSecrets", "cabal-lair.png"), png);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outRoot, { recursive: true, force: true });
});

describe("handleVaultImageCopyRequest", () => {
  it("copies an in-scope image and names it from the entity", async () => {
    const res = await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "portrait.png",
      entityId: "corven",
      index: 0,
      publicDir: outRoot,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.target).toBe("/atlas/assets/images/corven-1.png");
    expect(fs.existsSync(path.join(outRoot, "atlas", "assets", "images", "corven-1.png"))).toBe(true);
  });

  it("strips metadata from the copy", async () => {
    await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "portrait.png",
      entityId: "corven",
      index: 0,
      publicDir: outRoot,
    });
    const meta = await sharp(
      path.join(outRoot, "atlas", "assets", "images", "corven-1.png"),
    ).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("refuses an image from a folder the DM did not pick, and writes nothing", async () => {
    const res = await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "cabal-lair.png",
      entityId: "corven",
      index: 5,
      publicDir: outRoot,
    });
    expect(res).toEqual({ ok: false, reason: "outside-candidates" });
    expect(fs.existsSync(path.join(outRoot, "atlas", "assets", "images", "corven-6.png"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: FAIL — `handleVaultImageCopyRequest` is not exported.

- [ ] **Step 3: Implement the handler**

Add to `scripts/vite-plugin-atlas-save.ts`, after `handleVaultFoldersRequest`:

```ts
import { resolveVaultImage, vaultImageTargetName } from "../src/atlas/import/resolveVaultImage";

const VAULT_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_VAULT_IMAGE_BYTES = 6 * 1024 * 1024;

export interface VaultImageCopyArgs {
  vaultRoot: string;
  candidateFolders: string[];
  noteRelPath: string;
  rawSrc: string;
  entityId: string;
  index: number;
  /** Public dir to write into. Defaults to <cwd>/public. */
  publicDir?: string;
}

export type VaultImageCopyResult =
  | { ok: true; target: string }
  | { ok: false; reason: "not-found" | "outside-candidates" | "too-large" | "unreadable" };

/** Build the vault-relative index of image files, honouring the read boundary. */
async function indexVaultImages(rootResolved: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (!isReadableVaultPath(rootResolved, abs)) continue;
      if (e.isDirectory()) await walk(abs);
      else if (VAULT_IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
        out.push(path.relative(rootResolved, abs).split(path.sep).join("/"));
      }
    }
  }
  await walk(rootResolved);
  return out;
}

/**
 * Copy one vault image into public/atlas/assets/images, stripped of metadata.
 * Reads the vault, never writes to it. Refuses anything outside the DM's
 * chosen folders — an embed can name a DM-only image.
 */
export async function handleVaultImageCopyRequest(
  args: VaultImageCopyArgs,
): Promise<VaultImageCopyResult> {
  const rootResolved = path.resolve(args.vaultRoot);
  const index = await indexVaultImages(rootResolved);
  const resolved = resolveVaultImage(
    args.rawSrc,
    args.noteRelPath,
    index,
    args.candidateFolders,
  );
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const abs = path.join(rootResolved, resolved.relPath);
  if (!isReadableVaultPath(rootResolved, abs)) return { ok: false, reason: "not-found" };

  let bytes: Buffer;
  try {
    const stat = await fs.stat(abs);
    if (stat.size > MAX_VAULT_IMAGE_BYTES) return { ok: false, reason: "too-large" };
    bytes = await fs.readFile(abs);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const name = vaultImageTargetName(args.entityId, args.index, resolved.relPath);
  const publicDir = args.publicDir ?? path.join(process.cwd(), "public");
  const outDir = path.join(publicDir, "atlas", "assets", "images");
  const outPath = path.join(outDir, name);

  try {
    await fs.mkdir(outDir, { recursive: true });
    // Re-encode without metadata: EXIF/IPTC/XMP (incl. GPS) never lands.
    const cleaned = await sharp(bytes).toBuffer();
    await fs.writeFile(outPath, cleaned);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  return { ok: true, target: `/atlas/assets/images/${name}` };
}
```

> `sharp` is already a dependency (`scripts/check-image-privacy.ts:28`). `sharp()`
> drops metadata unless `.withMetadata()` is called, which is why the copy is a
> re-encode rather than a byte copy.

- [ ] **Step 4: Register the route**

Beside the other vault routes:

```ts
      // POST /__atlas/vault-image-copy
      server.middlewares.use("/__atlas/vault-image-copy", (req, res, next) => {
        if (!isAllowedDevRequest(req)) return next();
        if (req.method !== "POST") return next();
        readJsonBody(req).then((body) => {
          handleVaultImageCopyRequest(body as VaultImageCopyArgs).then((result) => {
            res.statusCode = result.ok ? 200 : 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          });
        });
      });
```

> Use whatever body-reading helper the neighbouring POST routes in this file
> already use instead of `readJsonBody` if it is named differently. **Do not
> accept `publicDir` from the request body** — strip it server-side so a request
> cannot redirect writes:

```ts
          const { publicDir: _ignored, ...safe } = body as VaultImageCopyArgs;
          handleVaultImageCopyRequest(safe).then((result) => {
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/vite-plugin-atlas-save.ts src/test/import/vault-image-copy.test.ts
git commit -F - <<'EOF'
feat(images): copy vault images out with metadata stripped

Server-side copy so image bytes never round-trip through the browser.
Images outside the DM's chosen folders are refused and nothing is written.
EOF
```

---

### Task C3: Rewrite embeds in the imported body

**Files:**
- Modify: `src/atlas/import/useMdImportFlow.ts`
- Test: `src/test/import/vault-image-copy.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/test/import/vault-image-copy.test.ts`:

```ts
import { rewriteEmbeds } from "@/atlas/import/resolveVaultImage";

describe("rewriteEmbeds", () => {
  it("replaces a wiki embed with a normal image link", () => {
    const body = "He waits here.\n\n![[portrait.png]]\n";
    expect(rewriteEmbeds(body, { "portrait.png": "/atlas/assets/images/corven-1.png" })).toBe(
      "He waits here.\n\n![](/atlas/assets/images/corven-1.png)\n",
    );
  });

  it("removes an embed that was refused, leaving no broken link", () => {
    const body = "He waits here.\n\n![[cabal-lair.png]]\n";
    expect(rewriteEmbeds(body, {})).toBe("He waits here.\n\n\n");
  });

  it("leaves ordinary wikilinks alone", () => {
    const body = "See [[Edric]] for more.";
    expect(rewriteEmbeds(body, {})).toBe("See [[Edric]] for more.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: FAIL — `rewriteEmbeds` is not exported.

- [ ] **Step 3: Implement**

Add to `src/atlas/import/resolveVaultImage.ts`:

```ts
/**
 * Swap Obsidian image embeds for plain markdown images.
 * An embed with no entry in `copied` was refused or skipped; it is removed
 * rather than left as a broken link or a hint that something exists.
 */
export function rewriteEmbeds(body: string, copied: Record<string, string>): string {
  return body.replace(/!\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const src = String(inner).split("|")[0].trim();
    const target = copied[src];
    return target ? `![](${target})` : "";
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the sync commit**

In `src/atlas/import/useMdImportFlow.ts`, import:

```ts
import { rewriteEmbeds } from "./resolveVaultImage";
```

In the commit path, declare the counter **once, before the loop over rows**:

```ts
    let skippedTotal = 0;
```

Then, before a row's content is handed to the merge, for each included row with a
`vaultRelPath`:

```ts
      const copied: Record<string, string> = {};
      const embeds = [...row.rawContent.matchAll(/!\[\[([^\]]+)\]\]/g)].map((m) =>
        m[1].split("|")[0].trim(),
      );
      for (const [i, src] of embeds.entries()) {
        const resp = await fetch("/__atlas/vault-image-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vaultRoot,
            candidateFolders,
            noteRelPath: row.vaultRelPath,
            rawSrc: src,
            entityId: row.resolvedId,
            index: i,
          }),
        });
        const result = (await resp.json()) as
          | { ok: true; target: string }
          | { ok: false; reason: string };
        if (result.ok) copied[src] = result.target;
        else skippedTotal += 1;
      }
      const bodyForMerge = rewriteEmbeds(row.rawContent, copied);
```

Use `bodyForMerge` in place of `row.rawContent` for that row, and after the loop
over all rows report skips plainly:

```ts
      if (skippedTotal > 0) {
        toast.warning(
          `${skippedTotal} image${skippedTotal === 1 ? "" : "s"} skipped — not in the folders you picked.`,
        );
      }
```

> `vaultRoot` and `candidateFolders` must be threaded from `openWithVaultScan`
> into the commit closure; store them in a ref when the scan runs rather than
> re-reading settings at commit time.

- [ ] **Step 6: Run the import tests and typecheck**

Run: `npx vitest run src/test/import/`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/atlas/import/resolveVaultImage.ts src/atlas/import/useMdImportFlow.ts src/test/import/vault-image-copy.test.ts
git commit -F - <<'EOF'
feat(images): bring note images across and rewrite the embeds

Refused images leave no broken link and no hint that a file exists; the DM
is told how many were skipped and why.
EOF
```

---

### Task C4: Entity-derived attachment naming in the parser

**Files:**
- Modify: `src/atlas/import/parseObsidian.ts:128`
- Test: `src/test/import/` (whichever file covers `parseObsidian` attachments)

- [ ] **Step 1: Find the existing coverage**

Run: `npx vitest run src/test/import/ -t "attachment"`
Expected: lists the tests asserting `suggestedTarget`. Read them before changing the shape.

- [ ] **Step 2: Write the failing test**

Add to that file:

```ts
it("does not put the source filename in the suggested target", () => {
  const parsed = parseObsidianNote("the-cabal-lair.png embed", "![[the-cabal-lair.png]]");
  expect(parsed.attachments[0].suggestedTarget).not.toContain("cabal");
});
```

> Match the real `parseObsidianNote` signature used in the neighbouring tests.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/import/`
Expected: FAIL — the target still contains the slugified source name.

- [ ] **Step 4: Change the suggestion**

In `src/atlas/import/parseObsidian.ts`, replace the `suggestedTarget` line (~:128):

```ts
    const ext = (filename.match(/\.[^.]+$/) ?? [".png"])[0].toLowerCase();
    // Deliberately not derived from the source filename: a vault filename can
    // itself be a spoiler. The real name is assigned at copy time from the
    // entity id (resolveVaultImage.vaultImageTargetName).
    const suggestedTarget = `public/atlas/assets/images/pending${ext}`;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/import/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/import/parseObsidian.ts src/test/import/
git commit -F - <<'EOF'
fix(images): keep vault filenames out of suggested asset paths

A source filename can be a spoiler; the real name comes from the entity id.
EOF
```

---

### Task C5: Fix the stale allowlist comment

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts:368-369`

- [ ] **Step 1: Correct the comment**

`isWritableAssetPath` already permits both `maps/` and `images/`
(`sourcePathAllowlist.ts:126-132`), but the comment claims maps only. Replace:

```ts
  // Path allowlist — dispatch per kind. asset-binary lands under
  // public/atlas/assets/{maps,images}/<file>.<image-ext>; text kinds under content/.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/vite-plugin-atlas-save.ts
git commit -F - <<'EOF'
docs(save): correct the asset allowlist comment — images are allowed too
EOF
```

---

### Task C6: Prove the two remaining safety properties

Spec §6 rows "The vault is never written" and "Visibility never silently becomes
player" have no test yet.

**Files:**
- Test: `src/test/import/vault-image-copy.test.ts` (extend)

- [ ] **Step 1: Write the vault-immutability test**

Append to `src/test/import/vault-image-copy.test.ts`:

```ts
import crypto from "node:crypto";
import { handleVaultScanRequest } from "../../../scripts/vite-plugin-atlas-save";

function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const abs = path.join(e.parentPath ?? e.path, e.name);
    if (!e.isFile()) continue;
    out[abs] = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  return out;
}

describe("the vault is never written", () => {
  it("is byte-identical after a full scan plus an image copy", async () => {
    const before = hashTree(root);
    await handleVaultScanRequest(root, [], ["03_Entities"]);
    await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "portrait.png",
      entityId: "corven",
      index: 0,
      publicDir: outRoot,
    });
    expect(hashTree(root)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: PASS.

- [ ] **Step 3: Mutation-check it**

Temporarily add a write into `handleVaultImageCopyRequest`, just after the vault
file is read:

```ts
  await fs.writeFile(abs + ".touched", "x");
```

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: **FAIL** on "is byte-identical after a full scan plus an image copy".

Revert:

```bash
git checkout -- scripts/vite-plugin-atlas-save.ts
```

- [ ] **Step 4: Write the visibility guard**

Append:

```ts
describe("visibility is never left to the build default", () => {
  it("a new entity from a vault note is written dm, not player", () => {
    const rows = buildStagingRows(
      [
        {
          filename: "Corven.md",
          raw: "---\ntitle: Corven\ntags: [npc]\n---\n\nA smuggler.\n",
          vaultRelPath: "03_Entities/Corven.md",
          vaultState: "new",
        },
      ],
      {
        worldId: "astrath-deeprealm",
        importConfig: { folders: {} },
        existingById: new Map<string, string>(),
      },
    );
    // build-atlas.ts:425 defaults a missing visibility to PLAYER, so an absent
    // key is a leak rather than a neutral state. New entities must be explicit.
    expect(rows[0].resolvedVisibility).toBe("dm");
  });
});
```

> Import `buildStagingRows` at the top of the file if it is not already imported.
> This test asserts existing June behaviour — it must pass without production
> changes. **If it fails, stop: that is a live secrecy regression, not a test bug.**

- [ ] **Step 5: Run it**

Run: `npx vitest run src/test/import/vault-image-copy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/test/import/vault-image-copy.test.ts
git commit -F - <<'EOF'
test(sync): pin that the vault is never written and visibility is explicit
EOF
```

---

## Ship gate (run before calling any phase done)

- [ ] **Full suite, sharded** — the whole suite OOMs a 4 GB coordinator:

```bash
npx vitest run --shard=1/4 --poolOptions.forks.maxForks=3
```

Repeat for shards `2/4`, `3/4`, `4/4`. Expected: all green.

- [ ] **Typecheck** (never bare `tsc --noEmit`):

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Lint:**

```bash
npm run lint
```

- [ ] **Player-safety scans** — non-negotiable, this feature moves content and images toward `public/`:

```bash
npm run atlas:publish
```

Expected: `publish-orchestrator: all 12 scans clean`.

- [ ] **Editor gating** — every new endpoint is dev-only. Confirm no new `/__atlas/…`
  string reaches the player bundle; `check-secrets` exit 9 is the signal.

- [ ] **Live check** — start the dev server via the preview tool, open the Sync
  panel, point it at the vault, pick `03_Entities`, and confirm the folder counts
  and the changed/new/unchanged read-out match reality.

---

## Notes for whoever executes this

- **Never `--no-verify`.** If a hook blocks a commit, fix the cause.
- **`.local-atlas/` is gitignored** — the sync map is machine-local by design; do not move it into the repo.
- **Do not weaken visibility defaults.** New entities from vault notes must keep
  writing `visibility: dm` (June design §5.7). `build-atlas.ts:425` defaults a
  missing value to *player*, so an omitted key is a leak, not a neutral state.
- **Mutation-check every safety test.** Tasks A5 and C1 build this in; hold the
  same bar for anything added along the way.
