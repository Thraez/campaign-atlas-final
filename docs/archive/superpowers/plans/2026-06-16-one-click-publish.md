# One-Click Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single, trustworthy **Publish** button to the DM editor that builds the player-safe atlas, runs every safety scan, shows a plain-language readiness verdict + a player-vs-player change list, and — only after the DM confirms — makes a scoped commit and pushes to `main` (the existing GitHub Pages deploy trigger).

**Architecture:** Two new dev-only endpoints in the existing Vite save plugin (`scripts/vite-plugin-atlas-save.ts`, `apply:"serve"`): `POST /__atlas/publish-check` (player build + site build + in-process scans → structured verdict + server-computed player-vs-player diff) and `POST /__atlas/publish-push` (re-verify green → scoped commit → push → snapshot baseline). A shared module-level build lock serializes save + publish. CI (`publish-atlas.yml`) is hardened to run the full scan set so a green local check implies a green CI run. Every line is editor-only and tree-shaken from player builds.

**Tech Stack:** TypeScript, Node (tsx), Vite dev-server connect middleware, React (editor UI), Vitest, `child_process` for `git` + `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-16-one-click-publish-design.md` — read it first. Decisions D1–D14 are referenced by id throughout.

---

## File Structure

**New files:**
- `scripts/atlas/publishScan.ts` — pure scan-adapter: runs the scans via their structured exports, maps results to `PublishScanReason[]` using a static plain-language template (drops all secret text). The heart of the safety verdict.
- `scripts/atlas/publishTypes.ts` — shared types (`PublishScanReason`, `PublishCheckResult`, `PublishPushResult`) imported by both the scripts and the UI.
- `scripts/atlas/runPublishCheck.ts` — orchestrates build + site build + scans + server-side diff → `PublishCheckResult`.
- `scripts/atlas/runPublishPush.ts` — green-only re-verify + scoped commit + push + snapshot → `PublishPushResult`; includes the git-failure classifier.
- `src/atlas/publish/usePublishFlow.ts` — client state machine + endpoint calls.
- `src/atlas/publish/ReadinessCard.tsx` — renders `PublishCheckResult` + confirm flow.
- `src/atlas/publish/usePublishFlow.test.ts`, `ReadinessCard.test.tsx`, and `scripts/atlas/publishScan.test.ts`, `runPublishPush.test.ts`, `snapshot-baseline.test.ts` — tests.

**Modified files:**
- `scripts/atlas/snapshot-baseline.ts` — export `snapshotBaseline(repoRoot)` + `isMainModule` CLI shim (D11).
- `scripts/vite-plugin-atlas-save.ts` — hoist `saveInFlight` → module-level shared build lock (D4); register the two publish middlewares; add a player-build-with-timeout helper.
- `scripts/check-no-secrets.ts` — add publish endpoint fingerprints (D7).
- `src/atlas/publish/PublishedDiffPanel.tsx` — add optional `diff?: AtlasDiff` prop (render-only mode) (§4.3, §6).
- `src/atlas/tabs/PublishCheckTab.tsx` — mount the Publish action surface; demote validator to "pre-flight notes"; neutral idle banner (§7.3).
- `package.json` — add `atlas:scan` alias.
- `.github/workflows/publish-atlas.yml` — run the full orchestrator scan set (D13).
- `.gitignore` — ignore `public/atlas/.last-published.json` (D14).

---

## Grounded facts (do not re-derive)

- `runBuild(flags: { player; strict; outDir?; configPath? }): Promise<BuildResult>` where `BuildResult = { ok; exitCode; durationMs; error? }`. Player build = `runBuild({ player: true, strict: true })` → writes `public/atlas/atlas.json`. Default flags → `.local-atlas/` (the DM build). `runBuild` never calls `process.exit`; validation failures return `ok:false` with a code. (`scripts/build-atlas.ts:195,218,250`.)
- The 60s timeout wrapper lives in `runAtlasBuild` (`scripts/vite-plugin-atlas-save.ts:761`), **not** in `runBuild`. `BUILD_TIMEOUT_MS` is defined in that file.
- Scan structured exports:
  - `scanDir(dir): ScanResult` — `{ files; dmHits: ScanHit[]; editorHits: ScanHit[] }`, `ScanHit = { file; pattern; kind }`. `pattern` is a fixed sentinel/fingerprint, safe to surface. (`scripts/check-no-secrets.ts:73`.)
  - `deriveSecretsFromVault(configPath): SecretEntry[]` + `scanArtifactForSecrets(dir, secrets): DerivedScanResult` — hits `{ file; match: { name; source; field } }`. **`match.name` IS the secret — never surface it.** (`scripts/check-derived-secrets.ts:135,174`.)
  - `scanArtifactShape(atlas: unknown): ShapeResult` — `violations: ShapeViolation[] = { entityId?; field; message }`. **`message` embeds leaked values — never surface it.** Takes the parsed atlas object, not a path. (`scripts/check-artifact-shape.ts:52`.)
  - `check-image-privacy`, `check-fog-safety`, `audit-assets` expose **only** `run(opts): Promise<number>` (no structured export). Their card rows are scan-level (no entity locator), so call `run()` and map a non-zero code to a scan-level message. (`check-image-privacy.ts:81`, `check-fog-safety.ts:95`, `audit-assets` exports `run`.)
- `computeAtlasDiff(baseline: AtlasProject, current: AtlasProject): AtlasDiff` — its only `@/` import is `import type` (erased at runtime), so it is safe to import via a **relative path** from a script. `AtlasDiff = { hasChanges; counts:{entities,placements,maps,overlays}; entities; placements; maps; overlays }`. (`src/atlas/publish/computeAtlasDiff.ts:52`.)
- The dev server **shadows** `GET /atlas/atlas.json` with the DM build (`.local-atlas/atlas.json`) via `serveLocalAtlas` (`scripts/vite-plugin-atlas-save.ts:922`). The client therefore cannot fetch the fresh *player* atlas over that URL — the diff must be computed server-side and returned in the response.
- Middleware request pattern (model the new endpoints on this): loopback gate `isAllowedDevRequest({host,origin,method})` → 403; `if (lock) 423`; `req.setEncoding("utf8"); req.on("data",…); req.on("end", async ()=>{ JSON.parse; handle; respond } )` in a `try/finally` that releases the lock. (`scripts/vite-plugin-atlas-save.ts:1009–1056`.)
- `.last-published.json` is currently git-tracked; `snapshot-baseline.ts` copies `public/atlas/atlas.json` → `public/atlas/.last-published.json` and currently runs `main()` on import (no export).
- `npm test` OOMs on the whole suite; run targeted files: `npx vitest run <file>`.

---

## Increment 0 — Plumbing prerequisites

Small, independently testable changes that unblock the rest.

### Task 0.1: Export `snapshotBaseline()` from snapshot-baseline.ts (D11)

**Files:**
- Modify: `scripts/atlas/snapshot-baseline.ts`
- Test: `scripts/atlas/snapshot-baseline.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// scripts/atlas/snapshot-baseline.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshotBaseline } from "./snapshot-baseline";

describe("snapshotBaseline", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
    fs.mkdirSync(path.join(root, "public", "atlas"), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("copies atlas.json to .last-published.json", () => {
    fs.writeFileSync(path.join(root, "public/atlas/atlas.json"), '{"v":1}');
    const result = snapshotBaseline(root);
    expect(result).toBe(true);
    expect(fs.readFileSync(path.join(root, "public/atlas/.last-published.json"), "utf8")).toBe('{"v":1}');
  });

  it("returns false (no throw) when atlas.json is absent", () => {
    expect(snapshotBaseline(root)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`snapshotBaseline` not exported)

Run: `npx vitest run scripts/atlas/snapshot-baseline.test.ts`
Expected: FAIL — `snapshotBaseline is not a function`.

- [ ] **Step 3: Refactor the script to export the function + isMainModule shim**

Replace the body of `scripts/atlas/snapshot-baseline.ts` with:

```ts
#!/usr/bin/env tsx
/**
 * Snapshot the about-to-be-overwritten player atlas to
 * public/atlas/.last-published.json, the editor diff baseline.
 *
 * D11: now an importable function so publish-push can snapshot AFTER a
 * successful push (not before the build). The CLI shim preserves the old
 * `npm run atlas:snapshot` behaviour for the atlas:publish chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Copy public/atlas/atlas.json → .last-published.json. Returns true if copied,
 *  false if there was no atlas.json yet. Never throws on a missing source. */
export function snapshotBaseline(repoRoot: string = process.cwd()): boolean {
  const src = path.resolve(repoRoot, "public/atlas/atlas.json");
  const dst = path.resolve(repoRoot, "public/atlas/.last-published.json");
  if (!fs.existsSync(src)) {
    console.log("snapshot-baseline: public/atlas/atlas.json not present yet — nothing to snapshot.");
    return false;
  }
  try {
    fs.copyFileSync(src, dst);
    console.log("snapshot-baseline: copied atlas.json → .last-published.json");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`snapshot-baseline: failed to write .last-published.json — ${msg} (continuing)`);
    return false;
  }
}

// CLI shim: only runs when invoked directly, never on import.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) snapshotBaseline();
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run scripts/atlas/snapshot-baseline.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the CLI still works**

Run: `npm run atlas:snapshot`
Expected: prints either "copied…" or "not present yet…", exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas/snapshot-baseline.ts scripts/atlas/snapshot-baseline.test.ts
git commit -m "refactor(publish): export snapshotBaseline() + isMainModule shim"
```

### Task 0.2: Git-ignore `.last-published.json` (D14)

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the ignore entry**

Append to `.gitignore` (after the `.local-atlas/` block):

```gitignore
# Editor diff baseline — local snapshot of the last deployed player atlas
# (D14). Written by publish-push after a successful push; never committed.
public/atlas/.last-published.json
```

- [ ] **Step 2: Stop tracking it**

Run: `git rm --cached public/atlas/.last-published.json`
Expected: `rm 'public/atlas/.last-published.json'` (if it was tracked). If it reports "did not match any files", it was already untracked — fine.

- [ ] **Step 3: Verify it is now ignored**

Run: `git status --short public/atlas/.last-published.json`
Expected: no output (ignored), or a `D` for the cached removal staged.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(publish): git-ignore .last-published.json (local diff baseline)"
```

### Task 0.3: Add the `atlas:scan` npm alias

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

In `package.json` `scripts`, after `"atlas:publish"`, add:

```json
    "atlas:scan": "tsx scripts/atlas/publish-orchestrator.ts",
```

- [ ] **Step 2: Verify it runs the full set**

Run (after a build exists): `npm run atlas:build:player && npm run build && npm run atlas:scan`
Expected: `publish-orchestrator: all 10 scans clean` (exit 0) on a clean tree.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(publish): add atlas:scan alias for the full orchestrator scan set"
```

### Task 0.4: Harden CI to run the full scan set (D13)

**Files:**
- Modify: `.github/workflows/publish-atlas.yml`

- [ ] **Step 1: Replace the two inline scan steps with the orchestrator**

In `.github/workflows/publish-atlas.yml`, delete the `Scan built artifact for sentinel and shape leaks` and `Scan built artifact for derived-secret leaks` steps (the two `run: |` scan blocks) and replace with a single step **after** the `Build site` step:

```yaml
      - name: Scan built artifacts (full safety set)
        # D13: run the same orchestrator the local one-click check runs, so a
        # green local check implies a green CI run. This adds image-privacy,
        # fog-safety, and audit-assets, which CI previously did not run.
        run: npm run atlas:scan
```

- [ ] **Step 2: Sanity-check the YAML**

Run: `npx tsx -e "import('js-yaml').then(y=>y.load(require('fs').readFileSync('.github/workflows/publish-atlas.yml','utf8'))) && console.log('yaml ok')"`
Expected: `yaml ok` (no parse error).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-atlas.yml
git commit -m "ci(publish): run full orchestrator scan set so CI gates fog/image/asset (D13)"
```

### Task 0.5: Hoist the build lock to a module-level shared mutex (D4)

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts`
- Test: `scripts/atlas/buildLock.test.ts` (create) — but the lock will live in the plugin file; to keep it testable, extract it.
- Create: `scripts/atlas/buildLock.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/atlas/buildLock.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { tryAcquireBuildLock, releaseBuildLock, isBuildInFlight } from "./buildLock";

describe("buildLock", () => {
  beforeEach(() => releaseBuildLock());
  it("acquires when free and blocks a second acquire", () => {
    expect(tryAcquireBuildLock()).toBe(true);
    expect(isBuildInFlight()).toBe(true);
    expect(tryAcquireBuildLock()).toBe(false);
  });
  it("frees on release", () => {
    tryAcquireBuildLock();
    releaseBuildLock();
    expect(isBuildInFlight()).toBe(false);
    expect(tryAcquireBuildLock()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run scripts/atlas/buildLock.test.ts`
Expected: FAIL — cannot find module `./buildLock`.

- [ ] **Step 3: Create the shared lock module**

```ts
// scripts/atlas/buildLock.ts
/**
 * D4: one process-wide "a build is in flight" guard shared by /__atlas/save,
 * /__atlas/publish-check, and /__atlas/publish-push. A publish is a full
 * player build + site build (tens of seconds); a save rebuild and a publish
 * must not run concurrently (both write public/atlas/atlas.json). The image
 * picker DELETE path is intentionally NOT gated by this lock.
 */
let buildInFlight = false;

export function isBuildInFlight(): boolean {
  return buildInFlight;
}

/** Returns true and takes the lock if free; returns false if already held. */
export function tryAcquireBuildLock(): boolean {
  if (buildInFlight) return false;
  buildInFlight = true;
  return true;
}

export function releaseBuildLock(): void {
  buildInFlight = false;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run scripts/atlas/buildLock.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewire the save middleware to use the shared lock**

In `scripts/vite-plugin-atlas-save.ts`:
1. Add to the imports near the top: `import { tryAcquireBuildLock, releaseBuildLock } from "./atlas/buildLock";`
2. Delete the closure declaration `let saveInFlight = false;` at `:908`.
3. In the `/__atlas/save` handler, replace the 423 check + set:
   ```ts
   if (saveInFlight) { /* 423 ... */ return; }
   saveInFlight = true;
   ```
   with:
   ```ts
   if (!tryAcquireBuildLock()) {
     res.statusCode = 423;
     res.setHeader("Content-Type", "application/json");
     res.end(JSON.stringify({ error: "Locked", detail: "another build is in flight" }));
     return;
   }
   ```
4. Replace both `saveInFlight = false;` (the `finally` and the `req.on("error")`) with `releaseBuildLock();`.

- [ ] **Step 6: Verify the existing save tests still pass + lint**

Run: `npx vitest run scripts/vite-plugin-atlas-save.test.ts` (if present) and `npm run lint`
Expected: existing save tests pass; no new lint errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/atlas/buildLock.ts scripts/atlas/buildLock.test.ts scripts/vite-plugin-atlas-save.ts
git commit -m "refactor(publish): hoist save lock to a shared module-level build lock (D4)"
```

---

## Increment 1 — `publish-check` endpoint (the safety verdict half)

### Task 1.1: Shared publish types

**Files:**
- Create: `scripts/atlas/publishTypes.ts`

- [ ] **Step 1: Create the types (no test — pure declarations)**

```ts
// scripts/atlas/publishTypes.ts
import type { AtlasDiff } from "../../src/atlas/publish/computeAtlasDiff";

export interface PublishScanReason {
  /** Scan identity — the disambiguator (NOT exit code; 13 is shared). */
  scan:
    | "check-no-secrets-dm"
    | "check-no-secrets-editor"
    | "check-derived-secrets"
    | "check-image-privacy"
    | "check-fog-safety"
    | "check-artifact-shape"
    | "audit-assets";
  target: string; // "dist" | "public/atlas" | "public/atlas/atlas.json"
  severity: "blocking";
  /** Plain-language; generated from the static template — NEVER scan output. */
  message: string;
  /** Locator availability is scan-dependent (§2.3). Never contains a secret. */
  locator?: { entityId?: string; mapId?: string; file?: string };
}

export interface PublishCheckResult {
  verdict: "safe" | "blocked" | "build-failed";
  reasons: PublishScanReason[];
  diff: AtlasDiff;
  builtAt: string;
  buildError?: string;
  repoIsPublic: true;
}

export type PublishPushResult =
  | { status: "published"; pushedAt: string; commit: string }
  | { status: "blocked"; reasons: PublishScanReason[] }
  | { status: "nothing-to-publish" }
  | { status: "git-failed"; reason: "offline" | "auth" | "behind" | "conflict" | "unknown" };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/atlas/publishTypes.ts
git commit -m "feat(publish): shared publish result types"
```

### Task 1.2: Scan adapter — map structured scan results to plain-language reasons (D8)

This is the security-critical unit. It must (a) key messages on scan identity, (b) drop every secret (`match.name`, `ShapeViolation.message`), (c) surface only safe locators.

**Files:**
- Create: `scripts/atlas/publishScan.ts`
- Test: `scripts/atlas/publishScan.test.ts`

- [ ] **Step 1: Write the failing test (pure mapping, no real builds)**

```ts
// scripts/atlas/publishScan.test.ts
import { describe, it, expect } from "vitest";
import { reasonsFromNoSecrets, reasonsFromDerived, reasonsFromShape } from "./publishScan";

describe("publishScan reason mapping (D8: never echo secrets)", () => {
  it("maps a DM-content hit to a scan-level message with no secret", () => {
    const reasons = reasonsFromNoSecrets(
      { files: 1, dmHits: [{ file: "dist/x.js", pattern: "SENTINEL_DM_BODY_001", kind: "dm" }], editorHits: [] },
      "dist"
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0].scan).toBe("check-no-secrets-dm");
    expect(reasons[0].message).toMatch(/DM-only note/i);
  });

  it("maps an editor-code hit distinctly", () => {
    const reasons = reasonsFromNoSecrets(
      { files: 1, dmHits: [], editorHits: [{ file: "dist/x.js", pattern: "/__atlas/save", kind: "editor" }] },
      "dist"
    );
    expect(reasons[0].scan).toBe("check-no-secrets-editor");
    expect(reasons[0].message).toMatch(/editor/i);
  });

  it("derived: uses match.source as locator and NEVER match.name", () => {
    const SECRET = "The Cabal of the Black Sun";
    const reasons = reasonsFromDerived({
      derivedCount: 1, filesScanned: 1,
      hits: [{ file: "dist/atlas/atlas.json", match: { name: SECRET, source: "content/world/cabal.md", field: "title" } }],
    }, "dist");
    expect(reasons).toHaveLength(1);
    expect(reasons[0].locator?.file).toBe("content/world/cabal.md");
    expect(JSON.stringify(reasons[0])).not.toContain(SECRET);
  });

  it("shape: uses entityId as locator and NEVER the violation message", () => {
    const LEAK = "secret-source-path/spoiler.md";
    const reasons = reasonsFromShape({
      violations: [{ entityId: "the-villain", field: "sourcePath", message: `sourcePath leaked: "${LEAK}"` }],
    });
    expect(reasons[0].locator?.entityId).toBe("the-villain");
    expect(JSON.stringify(reasons[0])).not.toContain(LEAK);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (functions missing)

Run: `npx vitest run scripts/atlas/publishScan.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement the adapter**

```ts
// scripts/atlas/publishScan.ts
/**
 * Adapter from the safety scans to plain-language PublishScanReason rows.
 *
 * D8 — the verdict NEVER echoes a secret. The structured hits carry secrets
 * verbatim (DerivedScanHit.match.name; ShapeViolation.message embeds leaked
 * values). We therefore generate every message from the static template below,
 * keyed on SCAN IDENTITY (not exit code — 13 is shared by 3 scans), and copy
 * only safe locators (entityId for shape; the content/ source path for derived;
 * a built-artifact path for sentinel hits).
 */
import fs from "node:fs";
import path from "node:path";
import { scanDir, type ScanResult } from "../check-no-secrets";
import {
  deriveSecretsFromVault,
  scanArtifactForSecrets,
  type DerivedScanResult,
} from "../check-derived-secrets";
import { scanArtifactShape, type ShapeResult } from "../check-artifact-shape";
import { run as runImagePrivacy } from "../check-image-privacy";
import { run as runFogSafety } from "../check-fog-safety";
import { run as runAuditAssets } from "./audit-assets";
import type { PublishScanReason } from "./publishTypes";

const MSG = {
  "check-no-secrets-dm": "A DM-only note would have been visible to players. Publishing is blocked until it's hidden.",
  "check-no-secrets-editor": "The editor itself leaked into the player build — this is a code bug, not a content problem. Publishing is blocked; this needs a developer.",
  "check-derived-secrets": "The name of a hidden person or place would have leaked into the player site. Publishing is blocked.",
  "check-image-privacy": "An image that's marked DM-only would have been published. Publishing is blocked.",
  "check-fog-safety": "A map's hidden (fogged) area would have been revealed. Publishing is blocked.",
  "check-artifact-shape": "The world file came out malformed — the build needs attention before publishing.",
  "audit-assets": "An image is referenced but missing (or an unused image needs cleanup). Publishing is blocked.",
} as const;

export function reasonsFromNoSecrets(r: ScanResult, target: string): PublishScanReason[] {
  const out: PublishScanReason[] = [];
  if (r.dmHits.length) {
    out.push({ scan: "check-no-secrets-dm", target, severity: "blocking", message: MSG["check-no-secrets-dm"], locator: { file: r.dmHits[0].file } });
  }
  if (r.editorHits.length) {
    out.push({ scan: "check-no-secrets-editor", target, severity: "blocking", message: MSG["check-no-secrets-editor"], locator: { file: r.editorHits[0].file } });
  }
  return out;
}

export function reasonsFromDerived(r: DerivedScanResult, target: string): PublishScanReason[] {
  if (!r.hits.length) return [];
  // One row per distinct source file; copy ONLY match.source (never match.name).
  const seen = new Set<string>();
  const out: PublishScanReason[] = [];
  for (const h of r.hits) {
    if (seen.has(h.match.source)) continue;
    seen.add(h.match.source);
    out.push({ scan: "check-derived-secrets", target, severity: "blocking", message: MSG["check-derived-secrets"], locator: { file: h.match.source } });
  }
  return out;
}

export function reasonsFromShape(r: ShapeResult): PublishScanReason[] {
  // Copy ONLY entityId (never the violation message, which embeds leaked text).
  const seen = new Set<string>();
  const out: PublishScanReason[] = [];
  for (const v of r.violations) {
    const key = v.entityId ?? "<root>";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scan: "check-artifact-shape", target: "public/atlas/atlas.json", severity: "blocking", message: MSG["check-artifact-shape"], locator: v.entityId ? { entityId: v.entityId } : undefined });
  }
  return out;
}

/** Scan-level row for the exit-code-only scans (image/fog/audit). */
function scanLevelReason(scan: PublishScanReason["scan"], target: string): PublishScanReason {
  return { scan, target, severity: "blocking", message: MSG[scan], target, severity: "blocking" } as PublishScanReason;
}

/**
 * Run every scan over dist/ and public/atlas/ and collect reasons.
 * `repoRoot` is the dev-server cwd (the repo root).
 */
export async function runPublishScans(repoRoot: string): Promise<PublishScanReason[]> {
  const reasons: PublishScanReason[] = [];
  const dist = path.resolve(repoRoot, "dist");
  const pub = path.resolve(repoRoot, "public/atlas");
  const configPath = path.resolve(repoRoot, "atlas.config.json");

  // check-no-secrets — structured
  for (const [dir, label] of [[dist, "dist"], [pub, "public/atlas"]] as const) {
    reasons.push(...reasonsFromNoSecrets(scanDir(dir), label));
  }
  // check-derived-secrets — structured
  const secrets = deriveSecretsFromVault(configPath);
  for (const [dir, label] of [[dist, "dist"], [pub, "public/atlas"]] as const) {
    reasons.push(...reasonsFromDerived(scanArtifactForSecrets(dir, secrets), label));
  }
  // check-artifact-shape — structured (reads + parses atlas.json)
  const atlasJsonPath = path.join(pub, "atlas.json");
  if (fs.existsSync(atlasJsonPath)) {
    const atlas = JSON.parse(fs.readFileSync(atlasJsonPath, "utf8"));
    reasons.push(...reasonsFromShape(scanArtifactShape(atlas)));
  }
  // exit-code-only scans — scan-level rows
  if ((await runImagePrivacy({ dir: dist, config: configPath })) !== 0 ||
      (await runImagePrivacy({ dir: pub, config: configPath })) !== 0) {
    reasons.push(scanLevelReason("check-image-privacy", "player build"));
  }
  if ((await runFogSafety({ dir: pub, config: configPath })) !== 0 ||
      (await runFogSafety({ dir: dist, config: configPath })) !== 0) {
    reasons.push(scanLevelReason("check-fog-safety", "player build"));
  }
  if ((await runAuditAssets({ assetsDir: path.join(pub, "assets"), publicDir: path.resolve(repoRoot, "public"), contentDir: path.resolve(repoRoot, "content") })) !== 0) {
    reasons.push(scanLevelReason("audit-assets", "public/atlas/assets"));
  }
  return reasons;
}
```

> NOTE for the engineer: confirm the exact `run` option shape for `check-image-privacy`/`check-fog-safety`/`audit-assets` against their `RunOpts`/argument interfaces before wiring (`audit-assets` `run` takes `{ assetsDir, publicDir, contentDir }` per `publish-orchestrator.ts:59`; the two checks take `{ dir, config }`). Fix the `scanLevelReason` helper's duplicate-key typo — it should be a single clean object literal `{ scan, target, severity: "blocking", message: MSG[scan] }`.

- [ ] **Step 4: Fix the obvious `scanLevelReason` literal and run the test — expect PASS**

Replace the `scanLevelReason` body with:
```ts
  return { scan, target, severity: "blocking", message: MSG[scan] };
```
Run: `npx vitest run scripts/atlas/publishScan.test.ts`
Expected: PASS (4 tests), including both "not.toContain(SECRET/LEAK)" assertions.

- [ ] **Step 5: Commit**

```bash
git add scripts/atlas/publishScan.ts scripts/atlas/publishScan.test.ts
git commit -m "feat(publish): scan adapter → plain-language reasons, never echoing secrets (D8)"
```

### Task 1.3: `runPublishCheck` orchestration + player-build-with-timeout helper

**Files:**
- Create: `scripts/atlas/runPublishCheck.ts`
- Modify: `scripts/vite-plugin-atlas-save.ts` (add `runPlayerBuildWithTimeout`)

- [ ] **Step 1: Add a player-build-with-timeout helper in the plugin**

In `scripts/vite-plugin-atlas-save.ts`, next to `runAtlasBuild`, add (it mirrors `runAtlasBuild` but passes player+strict flags):

```ts
/** Player build (player+strict → public/atlas) with the same timeout race as
 *  the DM rebuild. Used by publish-check. Returns the in-process BuildResult. */
export async function runPlayerBuildWithTimeout(): Promise<{ ok: boolean; error?: string }> {
  const timeoutMs = BUILD_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; error: string }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: `player build timed out after ${timeoutMs}ms` }), timeoutMs);
  });
  try {
    const result = await Promise.race([runBuild({ player: true, strict: true }), timeout]);
    if (timer) clearTimeout(timer);
    return result.ok ? { ok: true } : { ok: false, error: (("error" in result && result.error) ? result.error : "build failed").slice(-2000) };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Create the orchestration module**

```ts
// scripts/atlas/runPublishCheck.ts
/**
 * Orchestrates a publish-check: player build → site build → scans → diff.
 * Caller (the endpoint) owns the build lock.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runPlayerBuildWithTimeout } from "../vite-plugin-atlas-save";
import { runPublishScans } from "./publishScan";
import { computeAtlasDiff, type AtlasDiff } from "../../src/atlas/publish/computeAtlasDiff";
import type { PublishCheckResult } from "./publishTypes";

const execFileAsync = promisify(execFile);
const SITE_BUILD_TIMEOUT_MS = 180_000;
const EMPTY_DIFF: AtlasDiff = { hasChanges: false, counts: { entities: 0, placements: 0, maps: 0, overlays: 0 }, entities: [], placements: [], maps: [], overlays: [] };

function readAtlas(p: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function buildFailed(error: string): PublishCheckResult {
  return { verdict: "build-failed", reasons: [], diff: EMPTY_DIFF, builtAt: new Date().toISOString(), buildError: error.slice(-2000), repoIsPublic: true };
}

export async function runPublishCheck(repoRoot: string): Promise<PublishCheckResult> {
  // 1. Player atlas build (in-process, player+strict → public/atlas/atlas.json)
  const playerBuild = await runPlayerBuildWithTimeout();
  if (!playerBuild.ok) return buildFailed(playerBuild.error ?? "player build failed");

  // 2. Site build (child process → dist/)
  try {
    await execFileAsync("npm", ["run", "build"], { cwd: repoRoot, timeout: SITE_BUILD_TIMEOUT_MS, shell: process.platform === "win32" });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return buildFailed(err.stderr || err.message || "site build failed");
  }

  // 3. Scans (in-process, structured)
  const reasons = await runPublishScans(repoRoot);

  // 4. Player-vs-player diff (server-side; computeAtlasDiff's @/ import is type-only).
  const baseline = readAtlas(path.resolve(repoRoot, "public/atlas/.last-published.json"));
  const current = readAtlas(path.resolve(repoRoot, "public/atlas/atlas.json"));
  const diff = baseline && current
    ? computeAtlasDiff(baseline as never, current as never)
    : EMPTY_DIFF;

  return {
    verdict: reasons.length === 0 ? "safe" : "blocked",
    reasons,
    diff,
    builtAt: new Date().toISOString(),
    repoIsPublic: true,
  };
}
```

> NOTE: `npm` on Windows needs `shell:true` for `execFile` to find `npm.cmd`. The `shell: process.platform === "win32"` guard handles this. Verify `computeAtlasDiff`'s runtime imports are all `import type` before relying on the relative import (grounded: only the schema import is type-only).

- [ ] **Step 3: Manual integration check (no unit test — involves real builds)**

Run: `npx tsx -e "import('./scripts/atlas/runPublishCheck').then(m=>m.runPublishCheck(process.cwd())).then(r=>console.log(r.verdict, r.reasons.length, r.diff.hasChanges))"`
Expected on a clean tree: `safe 0 <true|false>`.

- [ ] **Step 4: Commit**

```bash
git add scripts/atlas/runPublishCheck.ts scripts/vite-plugin-atlas-save.ts
git commit -m "feat(publish): runPublishCheck orchestration + player-build-with-timeout"
```

### Task 1.4: Wire `POST /__atlas/publish-check`

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts`

- [ ] **Step 1: Add the import**

Near the top: `import { runPublishCheck } from "./atlas/runPublishCheck";`

- [ ] **Step 2: Register the middleware (inside `configureServer`, after the `/__atlas/save` block)**

```ts
      // POST /__atlas/publish-check — build + scan → verdict + diff (no git).
      server.middlewares.use("/__atlas/publish-check", (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
          res.statusCode = 403; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" })); return;
        }
        if (!tryAcquireBuildLock()) {
          res.statusCode = 423; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Locked", detail: "another build is in flight" })); return;
        }
        (async () => {
          try {
            const result = await runPublishCheck(server.config.root);
            res.statusCode = 200; res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 500; res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "PublishCheckFailed", detail: e instanceof Error ? e.message : String(e) }));
          } finally {
            releaseBuildLock();
          }
        })();
      });
```

- [ ] **Step 3: Manual verify against a running dev server**

Run `npm run dev` in one shell. In another:
`curl -s -X POST http://localhost:<port>/__atlas/publish-check -H "Origin: http://localhost:<port>" | npx tsx -e "process.stdin.once('data',d=>console.log(JSON.parse(d).verdict))"`
Expected: `safe` (or `blocked`/`build-failed`), and a single 423 if you fire two concurrently.

- [ ] **Step 4: Commit**

```bash
git add scripts/vite-plugin-atlas-save.ts
git commit -m "feat(publish): POST /__atlas/publish-check endpoint"
```

---

## Increment 2 — Readiness card + check-half UI

### Task 2.1: `PublishedDiffPanel` accepts a precomputed diff (§4.3)

**Files:**
- Modify: `src/atlas/publish/PublishedDiffPanel.tsx`
- Test: `src/atlas/publish/PublishedDiffPanel.test.tsx` (create or extend)

- [ ] **Step 1: Write the failing test**

```tsx
// src/atlas/publish/PublishedDiffPanel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PublishedDiffPanel } from "./PublishedDiffPanel";
import type { AtlasDiff } from "./computeAtlasDiff";

const diff: AtlasDiff = {
  hasChanges: true,
  counts: { entities: 1, placements: 0, maps: 0, overlays: 0 },
  entities: [{ id: "e1", title: "New Tavern", kind: "added" }],
  placements: [], maps: [], overlays: [],
};

describe("PublishedDiffPanel with precomputed diff", () => {
  it("renders the supplied diff without fetching a baseline", () => {
    render(<PublishedDiffPanel diff={diff} />);
    expect(screen.getByText("New Tavern")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`diff` prop unsupported; component requires `current`)

Run: `npx vitest run src/atlas/publish/PublishedDiffPanel.test.tsx`
Expected: FAIL (type error / no render).

- [ ] **Step 3: Add the optional prop**

In `PublishedDiffPanel.tsx`:
1. Change `interface Props` to make `current` optional and add `diff`:
   ```ts
   interface Props {
     /** Editor in-memory project — used only in self-fetch mode. */
     current?: AtlasProject;
     /** Precomputed server-side diff (player-vs-player). When set, the panel
      *  renders it directly and does NOT fetch a baseline or compute. */
     diff?: AtlasDiff;
   }
   ```
   (Import `AtlasDiff` from `./computeAtlasDiff`.)
2. At the top of the component, short-circuit when `diff` is provided:
   ```ts
   export function PublishedDiffPanel({ current, diff: providedDiff }: Props) {
     // ... existing state hooks ...
     const diff = providedDiff ?? (baseline && current ? computeAtlasDiff(baseline, current) : null);
   ```
   Skip the baseline fetch when `providedDiff` is set (guard the `useEffect` body with `if (providedDiff) { setLoading(false); return; }`).

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/atlas/publish/PublishedDiffPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/publish/PublishedDiffPanel.tsx src/atlas/publish/PublishedDiffPanel.test.tsx
git commit -m "feat(publish): PublishedDiffPanel render-only mode (precomputed diff)"
```

### Task 2.2: `usePublishFlow` hook — check half

**Files:**
- Create: `src/atlas/publish/usePublishFlow.ts`
- Test: `src/atlas/publish/usePublishFlow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/atlas/publish/usePublishFlow.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { usePublishFlow } from "./usePublishFlow";

afterEach(() => vi.restoreAllMocks());

function mockCheck(result: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => result })));
}

describe("usePublishFlow (check half)", () => {
  it("idle → checking → ready on a safe verdict", async () => {
    mockCheck({ verdict: "safe", reasons: [], diff: { hasChanges: false, counts: {}, entities: [], placements: [], maps: [], overlays: [] }, builtAt: "t", repoIsPublic: true });
    const { result } = renderHook(() => usePublishFlow());
    expect(result.current.state).toBe("idle");
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.result?.verdict).toBe("safe");
  });

  it("→ blocked on a blocked verdict", async () => {
    mockCheck({ verdict: "blocked", reasons: [{ scan: "check-derived-secrets", message: "…", severity: "blocking", target: "dist" }], diff: { hasChanges: false, counts: {}, entities: [], placements: [], maps: [], overlays: [] }, builtAt: "t", repoIsPublic: true });
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("blocked"));
  });

  it("→ busy on 423", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 423, json: async () => ({ error: "Locked" }) })));
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("busy"));
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (hook missing)

Run: `npx vitest run src/atlas/publish/usePublishFlow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hook (check half; push half added in Increment 5)**

```ts
// src/atlas/publish/usePublishFlow.ts
import { useCallback, useState } from "react";
import type { PublishCheckResult } from "../../../scripts/atlas/publishTypes";

export type PublishState =
  | "idle" | "checking" | "ready" | "blocked" | "build-failed" | "busy" | "error";

export function usePublishFlow() {
  const [state, setState] = useState<PublishState>("idle");
  const [result, setResult] = useState<PublishCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setState("checking"); setError(null);
    try {
      const res = await fetch("/__atlas/publish-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.status === 423) { setState("busy"); return; }
      if (!res.ok) { setState("error"); setError(`Check failed (${res.status})`); return; }
      const data = (await res.json()) as PublishCheckResult;
      setResult(data);
      setState(data.verdict === "safe" ? "ready" : data.verdict === "build-failed" ? "build-failed" : "blocked");
    } catch (e) {
      setState("error"); setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return { state, result, error, check };
}
```

> NOTE: importing types from `scripts/` into `src/` is type-only (erased), so it does not pull build code into the bundle. If the project's tsconfig path rules forbid the cross-dir import, copy the `PublishCheckResult`/`PublishScanReason`/`PublishPushResult` types into `src/atlas/publish/publishTypes.ts` and have `scripts/atlas/publishTypes.ts` re-export from there. Confirm which at implementation time.

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/atlas/publish/usePublishFlow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/publish/usePublishFlow.ts src/atlas/publish/usePublishFlow.test.ts
git commit -m "feat(publish): usePublishFlow hook (check half)"
```

### Task 2.3: `ReadinessCard` component

**Files:**
- Create: `src/atlas/publish/ReadinessCard.tsx`
- Test: `src/atlas/publish/ReadinessCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/atlas/publish/ReadinessCard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReadinessCard } from "./ReadinessCard";

const base = { diff: { hasChanges: false, counts: { entities: 0, placements: 0, maps: 0, overlays: 0 }, entities: [], placements: [], maps: [], overlays: [] }, builtAt: "t", repoIsPublic: true as const };

describe("ReadinessCard", () => {
  it("shows confirm only when safe", () => {
    render(<ReadinessCard result={{ ...base, verdict: "safe", reasons: [] }} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: /publish now/i })).toBeInTheDocument();
  });
  it("shows reasons and hides confirm when blocked", () => {
    render(<ReadinessCard result={{ ...base, verdict: "blocked", reasons: [{ scan: "check-derived-secrets", target: "dist", severity: "blocking", message: "Hidden name would leak" }] }} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Hidden name would leak/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish now/i })).toBeNull();
  });
  it("always shows the public-repo notice", () => {
    render(<ReadinessCard result={{ ...base, verdict: "safe", reasons: [] }} onConfirm={vi.fn()} />);
    expect(screen.getByText(/public on GitHub/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/atlas/publish/ReadinessCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the card** (follow `PublishCheckTab`'s tailwind tone; use `PublishedDiffPanel diff={result.diff}`)

```tsx
// src/atlas/publish/ReadinessCard.tsx
import type { PublishCheckResult } from "../../../scripts/atlas/publishTypes";
import { Button } from "@/components/ui/button";
import { PublishedDiffPanel } from "./PublishedDiffPanel";
import { CheckCircle2, ShieldAlert, AlertTriangle, ArrowRight } from "lucide-react";

interface Props {
  result: PublishCheckResult;
  onConfirm: () => void;
  onGoToEntity?: (id: string) => void;
  onGoToMap?: (id: string) => void;
  busy?: boolean;
}

export function ReadinessCard({ result, onConfirm, onGoToEntity, onGoToMap, busy }: Props) {
  const safe = result.verdict === "safe";
  const buildFailed = result.verdict === "build-failed";
  return (
    <div className="space-y-2">
      <div className={`rounded-md border p-3 text-xs ${safe ? "border-primary/30 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
        <div className="flex items-center gap-2 font-medium">
          {safe ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
          {safe ? "Safe to publish — no DM-only content is exposed."
            : buildFailed ? "Couldn't build your world."
            : "Publishing is blocked — fix the items below, then re-check."}
        </div>
        {buildFailed && result.buildError && (
          <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/40 p-2 text-[10px] whitespace-pre-wrap">{result.buildError}</pre>
        )}
      </div>

      {!safe && !buildFailed && (
        <ul className="space-y-1.5">
          {result.reasons.map((r, i) => (
            <li key={i} className="rounded-md border border-border bg-card/50 p-2 text-xs space-y-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-foreground">{r.message}</div>
                  {r.locator?.file && <div className="text-[10px] font-mono text-muted-foreground truncate">{r.locator.file}</div>}
                  {r.locator?.entityId && onGoToEntity && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] gap-1" onClick={() => onGoToEntity(r.locator!.entityId!)}>
                      <ArrowRight className="h-3 w-3" /> Go to entity
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PublishedDiffPanel diff={result.diff} />

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-muted-foreground">
        Your source notes (including DM-only ones) are public on GitHub. Only the published site is scrubbed.
      </div>

      {safe && (
        <Button size="sm" onClick={onConfirm} disabled={busy} className="h-8 gap-1 text-xs">
          {busy ? "Re-checking safety before publishing…" : "Publish now"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/atlas/publish/ReadinessCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/publish/ReadinessCard.tsx src/atlas/publish/ReadinessCard.test.tsx
git commit -m "feat(publish): ReadinessCard (verdict + reasons + diff + confirm)"
```

### Task 2.4: Mount the Publish action in `PublishCheckTab` (neutral idle, demote validator — §7.3)

**Files:**
- Modify: `src/atlas/tabs/PublishCheckTab.tsx`

- [ ] **Step 1: Wire the hook + button + card**

In `PublishCheckTab.tsx`:
1. Import `usePublishFlow` and `ReadinessCard`.
2. Call the hook: `const publish = usePublishFlow();`
3. Add a **Publish** button at the top of the action bar: `Publish to players` → `publish.check()`, disabled while `publish.state === "checking" || publish.state === "busy"`. Show the spinner label "Checking your world…" while checking; "Busy — finishing the current build" on busy.
4. Render the card region:
   - `idle`: a neutral line — `"Run a check to see what's new and whether it's safe."` (No green/red verdict.)
   - `checking`: "Checking your world…"
   - `ready` / `blocked` / `build-failed`: `<ReadinessCard result={publish.result!} onConfirm={…/* Increment 5 */} onGoToEntity={onGoToEntity} onGoToMap={onGoToMap} />`
5. **Demote the validator banner (§7.3):** change the existing top status banner (`PublishCheckTab.tsx:84-96`) so its heading reads "Pre-flight notes" (secondary tone, `text-muted-foreground`), NOT "Player build is safe to publish." The green/red safety headline now belongs solely to `ReadinessCard`.

- [ ] **Step 2: Verify in the browser (preview tools)**

Start the dev server (preview_start), open the editor, open the Publish panel. `preview_snapshot` to confirm: a "Publish to players" button, a neutral idle prompt, and the demoted "Pre-flight notes" heading (no competing "safe to publish" banner). Click Publish; after the build, `preview_snapshot` shows the readiness card with a verdict.

- [ ] **Step 3: Commit**

```bash
git add src/atlas/tabs/PublishCheckTab.tsx
git commit -m "feat(publish): mount Publish action in PublishCheckTab; neutral idle, demote validator (S7.3)"
```

---

## Increment 3 — Tree-shake regression guard (D7)

### Task 3.1: Fingerprint the publish endpoints

**Files:**
- Modify: `scripts/check-no-secrets.ts`
- Test: `scripts/check-no-secrets.test.ts` (extend; or the existing sentinel-scan test)

- [ ] **Step 1: Write the failing test**

```ts
// add to the existing check-no-secrets test file
import { scanFile } from "./check-no-secrets";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";

it("flags a bundle containing the publish endpoint string as an editor leak", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fp-")), "bundle.js");
  fs.writeFileSync(f, 'fetch("/__atlas/publish-check")');
  const hits = scanFile(f);
  expect(hits.some(h => h.kind === "editor" && h.pattern === "/__atlas/publish-check")).toBe(true);
});
```

- [ ] **Step 2: Run it — expect FAIL** (fingerprint not present)

Run: `npx vitest run scripts/check-no-secrets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the fingerprints**

In `scripts/check-no-secrets.ts:32`, extend `EDITOR_CODE_FINGERPRINTS`:

```ts
export const EDITOR_CODE_FINGERPRINTS = [
  "/__atlas/save",
  "/__atlas/publish-check",
  "/__atlas/publish-push",
  "saveAtlasPatchToLocalFs",
  "AtlasPlacementEditor",
  "/atlas/edit",
] as const;
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run scripts/check-no-secrets.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the player build still passes the scan** (the endpoints must be tree-shaken)

Run: `npm run build && npm run atlas:check-secrets dist`
Expected: exit 0 (no editor fingerprint in `dist/`). If it fails, the publish UI is being imported from a player entry point — fix the import boundary before proceeding.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-no-secrets.ts scripts/check-no-secrets.test.ts
git commit -m "feat(publish): fingerprint publish endpoints in the editor-leak scan (D7)"
```

---

## Increment 4 — `publish-push` endpoint (the push half)

### Task 4.1: `runPublishPush` — re-verify, scoped commit, push, snapshot

**Files:**
- Create: `scripts/atlas/runPublishPush.ts`
- Test: `scripts/atlas/runPublishPush.test.ts` (git-failure classifier + nothing-to-publish)

- [ ] **Step 1: Write the failing test (pure classifier)**

```ts
// scripts/atlas/runPublishPush.test.ts
import { describe, it, expect } from "vitest";
import { classifyGitFailure } from "./runPublishPush";

describe("classifyGitFailure", () => {
  it("offline", () => expect(classifyGitFailure("fatal: unable to access 'https://…': Could not resolve host: github.com")).toBe("offline"));
  it("auth", () => expect(classifyGitFailure("fatal: Authentication failed for 'https://…'")).toBe("auth"));
  it("behind", () => expect(classifyGitFailure("! [rejected]  main -> main (non-fast-forward)")).toBe("behind"));
  it("conflict", () => expect(classifyGitFailure("CONFLICT (content): Merge conflict in x")).toBe("conflict"));
  it("unknown", () => expect(classifyGitFailure("some other git noise")).toBe("unknown"));
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run scripts/atlas/runPublishPush.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// scripts/atlas/runPublishPush.ts
/**
 * publish-push: re-verify green, scoped commit, push to main, snapshot baseline.
 * Caller owns the build lock.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runPublishCheck } from "./runPublishCheck";
import { snapshotBaseline } from "./snapshot-baseline";
import type { PublishPushResult } from "./publishTypes";

const execFileAsync = promisify(execFile);

// Scoped pathspec (§5.2): world source + built player atlas. NOT a bare
// world.yaml (it lives under content/), NOT .last-published.json (git-ignored),
// NOT dist/ or .local-atlas/ (git-ignored), NOT src/ or scripts/.
const COMMIT_PATHSPEC = [
  "content",
  "atlas.config.json",
  "public/atlas/atlas.json",
  "public/atlas/search-index.json",
  "public/atlas/assets",
];

export function classifyGitFailure(stderr: string): "offline" | "auth" | "behind" | "conflict" | "unknown" {
  const s = stderr.toLowerCase();
  if (s.includes("could not resolve host") || s.includes("could not read from remote") || s.includes("unable to access")) return "offline";
  if (s.includes("authentication failed") || s.includes("could not read username") || s.includes("permission denied")) return "auth";
  if (s.includes("non-fast-forward") || s.includes("[rejected]") || s.includes("fetch first") || s.includes("behind")) return "behind";
  if (s.includes("conflict")) return "conflict";
  return "unknown";
}

async function git(repoRoot: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string }> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
    return { ok: true, stdout };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false, stderr: err.stderr || err.message || "git failed" };
  }
}

export async function runPublishPush(repoRoot: string, now: string = new Date().toISOString()): Promise<PublishPushResult> {
  // 1. Re-verify safety (D10) — never trust a client-claimed verdict.
  const check = await runPublishCheck(repoRoot);
  if (check.verdict !== "safe") return { status: "blocked", reasons: check.reasons };

  // 2. Stage the scoped pathspec.
  const add = await git(repoRoot, ["add", "--", ...COMMIT_PATHSPEC]);
  if (!add.ok) return { status: "git-failed", reason: classifyGitFailure(add.stderr) };

  // 3. Nothing to publish? (no staged changes in scope)
  const staged = await git(repoRoot, ["diff", "--cached", "--quiet", "--", ...COMMIT_PATHSPEC]);
  if (staged.ok) return { status: "nothing-to-publish" }; // exit 0 = no diff

  // 4. Commit.
  const date = now.slice(0, 10);
  const commit = await git(repoRoot, ["commit", "-m", `publish: world update ${date}`, "--", ...COMMIT_PATHSPEC]);
  if (!commit.ok) return { status: "git-failed", reason: classifyGitFailure(commit.stderr) };

  // 5. Push to main.
  const push = await git(repoRoot, ["push", "origin", "main"]);
  if (!push.ok) return { status: "git-failed", reason: classifyGitFailure(push.stderr) };

  // 6. Snapshot the just-pushed player atlas as the new baseline (D11).
  snapshotBaseline(repoRoot);

  const sha = await git(repoRoot, ["rev-parse", "--short", "HEAD"]);
  return { status: "published", pushedAt: now, commit: sha.ok ? sha.stdout.trim() : "" };
}
```

> NOTE: `git diff --cached --quiet` exits 0 when there is NO diff and 1 when there IS — that is why `staged.ok === true` means nothing-to-publish. The `execFile` non-zero exit lands in the `catch`, so `ok:false` (a diff exists) is the publish path. Verify this inversion holds in the integration test below before trusting it.

- [ ] **Step 4: Run the classifier test — expect PASS**

Run: `npx vitest run scripts/atlas/runPublishPush.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Integration test against a throwaway local repo** (no network)

Create `scripts/atlas/runPublishPush.integration.test.ts` that: `git init` a temp dir, seeds `content/` + `public/atlas/atlas.json`, sets a fake `origin` to a second local bare repo, and asserts `runPublishPush` (with `runPublishCheck` stubbed to `safe`) commits only the scoped paths and that `.last-published.json` is never staged. (If stubbing `runPublishCheck` across modules is awkward, factor the "re-verify" call behind an injectable parameter `verify = runPublishCheck`.) Assert `nothing-to-publish` on a second call.

Run: `npx vitest run scripts/atlas/runPublishPush.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas/runPublishPush.ts scripts/atlas/runPublishPush.test.ts scripts/atlas/runPublishPush.integration.test.ts
git commit -m "feat(publish): runPublishPush (re-verify, scoped commit, push, snapshot)"
```

### Task 4.2: Wire `POST /__atlas/publish-push`

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts`

- [ ] **Step 1: Import + register the middleware** (same shape as publish-check)

Import `runPublishPush`, then register `/__atlas/publish-push` with the loopback gate + shared lock (423) + `try/finally releaseBuildLock()`, calling `runPublishPush(server.config.root)` and `res.end(JSON.stringify(result))` with `res.statusCode = 200` (the typed `status` field carries success/failure; reserve 500 for unexpected throws).

- [ ] **Step 2: Manual verify** (only if you have a clean throwaway branch — this pushes!)

Prefer to verify via the integration test (Task 4.1 step 5). Do **not** manually fire `publish-push` against the real `main` during development.

- [ ] **Step 3: Commit**

```bash
git add scripts/vite-plugin-atlas-save.ts
git commit -m "feat(publish): POST /__atlas/publish-push endpoint"
```

---

## Increment 5 — Confirm → publish wiring (the last increment)

### Task 5.1: Extend `usePublishFlow` with the push half

**Files:**
- Modify: `src/atlas/publish/usePublishFlow.ts`
- Modify: `src/atlas/publish/usePublishFlow.test.ts`

- [ ] **Step 1: Write the failing tests**

Add cases: `confirm()` → state `publishing` → on `{status:"published"}` → `published`; on `{status:"git-failed",reason:"behind"}` → `git-failed` with the reason exposed; on `{status:"nothing-to-publish"}` → `nothing-to-publish`; on `{status:"blocked",reasons}` → `blocked` (re-verify failed). Mock `fetch` per case.

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/atlas/publish/usePublishFlow.test.ts`
Expected: FAIL (`confirm` undefined, new states unhandled).

- [ ] **Step 3: Implement the push half**

Extend the `PublishState` union with `"publishing" | "published" | "nothing-to-publish" | "git-failed"`, add `pushReason` state, and a `confirm` callback:

```ts
const confirm = useCallback(async () => {
  setState("publishing");
  try {
    const res = await fetch("/__atlas/publish-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (res.status === 423) { setState("busy"); return; }
    if (!res.ok) { setState("error"); setError(`Publish failed (${res.status})`); return; }
    const data = await res.json() as { status: string; reason?: string; reasons?: unknown[] };
    if (data.status === "published") setState("published");
    else if (data.status === "nothing-to-publish") setState("nothing-to-publish");
    else if (data.status === "blocked") { setState("blocked"); /* keep reasons via a re-check or surface data.reasons */ }
    else { setState("git-failed"); setPushReason(data.reason ?? "unknown"); }
  } catch (e) {
    setState("error"); setError(e instanceof Error ? e.message : String(e));
  }
}, []);
```

Return `confirm` and `pushReason` alongside the existing API.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/atlas/publish/usePublishFlow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/publish/usePublishFlow.ts src/atlas/publish/usePublishFlow.test.ts
git commit -m "feat(publish): usePublishFlow push half (confirm → publishing → terminal states)"
```

### Task 5.2: Wire confirm + terminal states into the UI

**Files:**
- Modify: `src/atlas/tabs/PublishCheckTab.tsx`
- Modify: `src/atlas/publish/ReadinessCard.tsx` (pass `busy={publish.state==="publishing"}`)

- [ ] **Step 1: Connect `onConfirm` and render terminal states**

In `PublishCheckTab.tsx`:
- Pass `onConfirm={publish.confirm}` and `busy={publish.state === "publishing"}` to `ReadinessCard`.
- Render terminal messages by state:
  - `published`: success toast/line "Published ✓ — your players will see the changes in a couple of minutes."
  - `nothing-to-publish`: "Already up to date — nothing new to publish."
  - `git-failed`: "Couldn't publish automatically — finish in GitHub Desktop." + a one-line reason from `publish.pushReason` (offline → "You appear to be offline."; auth → "Git needs you to sign in."; behind → "Your branch is behind — pull first in GitHub Desktop."; conflict → "There's a merge conflict to resolve."; unknown → "").
  - `error`: a generic "Something went wrong — try again." with `publish.error`.

- [ ] **Step 2: Browser verification (preview tools)**

With the dev server running, open the Publish panel and click Publish → confirm path. Since a real push to `main` is undesirable during dev, verify the **safe-to-publishing** transition and the spinner sub-label ("Re-checking safety before publishing…"), and rely on the integration test for the actual push/terminal states. `preview_snapshot` after clicking to confirm the spinner + sub-label render.

- [ ] **Step 3: Commit**

```bash
git add src/atlas/tabs/PublishCheckTab.tsx src/atlas/publish/ReadinessCard.tsx
git commit -m "feat(publish): wire confirm → publishing + terminal states (published/nothing/git-failed)"
```

---

## Final verification (after all increments)

- [ ] **Player-build cleanliness (the hard gate this feature leans on):**
  ```bash
  npm run build
  npm run atlas:check-secrets dist        # exit 0 — no /__atlas/publish-* in the bundle
  npm run atlas:scan                       # exit 0 — full scan set clean
  ```
- [ ] **Targeted test sweep** (whole-suite OOMs — run the new files):
  ```bash
  npx vitest run scripts/atlas/snapshot-baseline.test.ts scripts/atlas/buildLock.test.ts scripts/atlas/publishScan.test.ts scripts/atlas/runPublishPush.test.ts scripts/check-no-secrets.test.ts
  npx vitest run src/atlas/publish/usePublishFlow.test.ts src/atlas/publish/ReadinessCard.test.tsx src/atlas/publish/PublishedDiffPanel.test.tsx
  ```
- [ ] **Lint:** `npm run lint` — no new errors.
- [ ] **Leak-regression (spec §8.3):** confirm a DM-only fixture entity with a `%%dm%%` block does not appear in `dist/` after `npm run build` (the existing redaction tests cover this; add one keyed through `runPublishScans` if not already covered).
- [ ] **Spec cross-check:** every decision D1–D14 has a corresponding change landed (snapshot timing D11/§5.4; `.last-published.json` ignore D14; CI hardening D13; shared lock D4; structured scans D2; no-secret-echo D8; fingerprint D7).

---

## Self-review notes (author)

- **Spec coverage:** Increments map to spec §9's increments 0–5. D1 (player-vs-player diff) → Task 1.3 server-side `computeAtlasDiff`. D2 → Tasks 1.2/1.3. D3/D13 → Task 0.4. D4 → Task 0.5. D6 (no stored token) → `runPublishPush` uses ambient `git` credentials only. D7 → Task 3.1. D8 → Task 1.2 (+ the two `not.toContain(secret)` tests). D9 → ReadinessCard notice. D10 → `runPublishPush` re-verify. D11 → Tasks 0.1 + 4.1 step 6. D12 → `classifyGitFailure`. D14 → Task 0.2.
- **Known implementation decisions deferred to the engineer (flagged inline):** the exact `run()` option shapes for image/fog/audit; whether `src` may import types from `scripts/` or needs a local types copy; the injectable `verify` param for testing `runPublishPush`. Each has a NOTE at its task.
- **Windows:** `execFile("npm", …)` uses `shell:true` on win32; `git` is invoked with array args (no shell) for safety.
