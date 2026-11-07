/**
 * The one list of safety scans (eval-2026-10/01).
 *
 * CI's orchestrator (`npm run atlas:scan`), the editor's Publish check
 * (`runPublishScans`) and the integrity smoke all read SCANS, so a scan runs
 * everywhere or nowhere. `scanRegistry.test.ts` fails when a scanner script
 * isn't listed here, or when a listed scan has no integrity-smoke variant and
 * no reason for lacking one.
 *
 * Publish mode (R-03). Every run through this registry is a publish run: the
 * orchestrator only runs inside `atlas:publish` (so the gate) and the deploy
 * workflow, and `runPublishScans` is the editor's Publish check. So every task
 * names the artifacts it scans (`requires`), and `scanTasks` fails a task whose
 * artifact is missing or empty, naming the path, before the scan runs: a scan
 * never reports "0 files checked, ok" on a publish. Run by hand
 * (`npm run atlas:check-secrets dist` and the like), a scan keeps its own
 * lenient behaviour for a dir that isn't built yet.
 */
import fs from "node:fs";
import path from "node:path";
import { playerAtlasJsonPath, type ArtifactLayout } from "./playerArtifact.js";

import { run as checkNoSecrets } from "../check-no-secrets.js";
import { run as checkDerivedSecrets } from "../check-derived-secrets.js";
import { run as checkImagePrivacy } from "../check-image-privacy.js";
import { run as checkFogSafety } from "../check-fog-safety.js";
import { run as checkArtifactShape } from "../check-artifact-shape.js";
import { run as checkPlayerSecrets } from "../check-player-secrets.js";
import { run as checkPlayerFiles } from "../check-player-files.js";
import { run as checkVaultContent } from "../check-vault-content.js";
import { run as auditAssets } from "./audit-assets.js";

export type ScanId =
  | "check-no-secrets"
  | "check-derived-secrets"
  | "check-artifact-shape"
  | "check-image-privacy"
  | "check-fog-safety"
  | "check-player-secrets"
  | "check-player-files"
  | "check-vault-content"
  | "audit-assets";

/** Absolute paths the scans run against. `root` is the repo root. */
export interface ScanContext {
  root: string;
  configPath: string;
  contentDir: string;
}

/** An artifact a task scans: a file that must exist, or a dir that must hold something. */
export interface RequiredArtifact {
  path: string;
  kind: "file" | "dir";
}

export interface ScanTask {
  scan: ScanId;
  label: string;
  /** What the task scans; a publish fails the task when one is missing or empty. */
  requires: RequiredArtifact[];
  run: () => number | Promise<number>;
}

/** Exit code of a task whose artifact is missing or empty (R-03). */
export const MISSING_ARTIFACT_EXIT = 20;

type TaskSpec = Omit<ScanTask, "scan">;

interface ScanEntry {
  id: ScanId;
  /** Script path under `scripts/`, as the integrity smoke spawns it. */
  script: string;
  /** Why the integrity smoke has no planted-fault variant, if it has none. */
  smokeSkip?: string;
  tasks: (ctx: ScanContext) => TaskSpec[];
}

const file = (p: string): RequiredArtifact => ({ path: p, kind: "file" });
const dir = (p: string): RequiredArtifact => ({ path: p, kind: "dir" });

/** Why `a` can't be scanned (missing, wrong kind, empty), or null when it can. */
function artifactProblem(a: RequiredArtifact): string | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(a.path);
  } catch {
    return `${a.path} is missing`;
  }
  if (a.kind === "file") {
    if (!stat.isFile()) return `${a.path} is not a file`;
    return stat.size === 0 ? `${a.path} is empty` : null;
  }
  if (!stat.isDirectory()) return `${a.path} is not a dir`;
  try {
    return fs.readdirSync(a.path).length === 0 ? `${a.path} is empty` : null;
  } catch (e) {
    return `${a.path} can't be read (${(e as Error).message})`;
  }
}

/** Every artifact of `task` that is missing or empty, one line each. */
export function missingArtifacts(task: Pick<ScanTask, "requires">): string[] {
  return task.requires.flatMap((a) => artifactProblem(a) ?? []);
}

/** The built site and the source store it was copied from. */
function artifactDirs(ctx: ScanContext): [string, string, ArtifactLayout][] {
  return [
    ["dist", path.join(ctx.root, "dist"), "built-site"],
    ["public/atlas", path.join(ctx.root, "public", "atlas"), "store"],
  ];
}

function perDir(
  id: ScanId,
  ctx: ScanContext,
  run: (dir: string, label: string, layout: ArtifactLayout) => number | Promise<number>,
): TaskSpec[] {
  return artifactDirs(ctx).map(([label, d, layout]) => ({
    label: `${id} ${label}`,
    // The player atlas.json is in every player artifact; without it the dir
    // is not a build, whatever else it holds.
    requires: [file(playerAtlasJsonPath(d, layout))],
    run: () => run(d, label, layout),
  }));
}

export const SCANS: ScanEntry[] = [
  {
    id: "check-no-secrets",
    script: "check-no-secrets.ts",
    tasks: (ctx) => perDir("check-no-secrets", ctx, (dir) => checkNoSecrets({ dir })),
  },
  {
    id: "check-derived-secrets",
    script: "check-derived-secrets.ts",
    tasks: (ctx) =>
      perDir("check-derived-secrets", ctx, (dir) =>
        checkDerivedSecrets({ dir, config: ctx.configPath }),
      ),
  },
  {
    id: "check-artifact-shape",
    script: "check-artifact-shape.ts",
    tasks: (ctx) => [
      {
        label: "check-artifact-shape public/atlas",
        requires: [file(path.join(ctx.root, "public", "atlas", "atlas.json"))],
        run: () =>
          checkArtifactShape({
            atlasJsonPath: path.join(ctx.root, "public", "atlas", "atlas.json"),
          }),
      },
    ],
  },
  {
    id: "check-image-privacy",
    script: "check-image-privacy.ts",
    // On the source store, only images the player JSON names are checked by
    // filename: the rest stay in the DM's store and the player build prunes them.
    tasks: (ctx) =>
      perDir("check-image-privacy", ctx, (dir, label) =>
        checkImagePrivacy({
          dir,
          config: ctx.configPath,
          ...(label === "public/atlas" ? { referencedBy: dir } : {}),
        }),
      ),
  },
  {
    id: "check-fog-safety",
    script: "check-fog-safety.ts",
    tasks: (ctx) =>
      perDir("check-fog-safety", ctx, (dir, _label, layout) =>
        checkFogSafety({ dir, config: ctx.configPath, layout }),
      ),
  },
  {
    id: "check-player-secrets",
    script: "check-player-secrets.ts",
    tasks: (ctx) =>
      perDir("check-player-secrets", ctx, (dir, _label, layout) =>
        checkPlayerSecrets({ dir, layout }),
      ),
  },
  {
    id: "check-player-files",
    script: "check-player-files.ts",
    // The built site only: public/atlas is the DM's store and legitimately
    // holds files the player build drops (source-named audio beds).
    tasks: (ctx) => [
      {
        label: "check-player-files dist",
        requires: [file(playerAtlasJsonPath(path.join(ctx.root, "dist"), "built-site"))],
        run: () => checkPlayerFiles({ dir: path.join(ctx.root, "dist") }),
      },
    ],
  },
  {
    id: "check-vault-content",
    script: "check-vault-content.ts",
    // The source, not an artifact: while hosting is public (R-01), content/
    // must hold nothing Sync from Obsidian wrote.
    tasks: (ctx) => [
      {
        label: "check-vault-content content",
        requires: [dir(ctx.contentDir)],
        run: () =>
          checkVaultContent({
            root: ctx.root,
            config: ctx.configPath,
            contentDir: ctx.contentDir,
          }),
      },
    ],
  },
  {
    id: "audit-assets",
    script: "atlas/audit-assets.ts",
    smokeSkip: "a size budget for images, not a leak scan: nothing secret can slip through it",
    tasks: (ctx) => [
      {
        label: "audit-assets public/atlas/assets",
        requires: [dir(path.join(ctx.root, "public", "atlas", "assets")), dir(ctx.contentDir)],
        run: () =>
          auditAssets({
            assetsDir: path.join(ctx.root, "public", "atlas", "assets"),
            publicDir: path.join(ctx.root, "public"),
            contentDir: ctx.contentDir,
          }),
      },
    ],
  },
];

/** Every task, in publish mode: one whose artifact is missing or empty fails
 *  (MISSING_ARTIFACT_EXIT, the path named) without running its scan. */
export function scanTasks(ctx: ScanContext): ScanTask[] {
  return SCANS.flatMap((s) =>
    s.tasks(ctx).map((t) => ({
      ...t,
      scan: s.id,
      run: () => {
        const missing = missingArtifacts(t);
        if (missing.length === 0) return t.run();
        for (const m of missing) {
          console.error(`${t.label}: ${m}, so there is nothing to check — failing the publish`);
        }
        return MISSING_ARTIFACT_EXIT;
      },
    })),
  );
}

/** Run every task in parallel (scans are read-only). 0 when all are clean, else 1. */
export async function runAll(tasks: ScanTask[]): Promise<number> {
  const results = await Promise.all(
    tasks.map(async (t) => {
      try {
        return { label: t.label, code: await t.run() };
      } catch (e) {
        console.error(`${t.label}: crashed`, e);
        return { label: t.label, code: -1 };
      }
    }),
  );

  const failures = results.filter((r) => r.code !== 0);
  if (failures.length === 0) {
    console.log(`\npublish-orchestrator: all ${tasks.length} scans clean`);
    return 0;
  }
  console.error(`\npublish-orchestrator: ${failures.length} scan(s) failed:`);
  for (const f of failures) console.error(`  [exit ${f.code}] ${f.label}`);
  return 1;
}
