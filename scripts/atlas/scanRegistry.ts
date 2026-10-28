/**
 * The one list of safety scans (eval-2026-10/01).
 *
 * CI's orchestrator (`npm run atlas:scan`), the editor's Publish check
 * (`runPublishScans`) and the integrity smoke all read SCANS, so a scan runs
 * everywhere or nowhere. `scanRegistry.test.ts` fails when a scanner script
 * isn't listed here, or when a listed scan has no integrity-smoke variant and
 * no reason for lacking one.
 */
import path from "node:path";

import { run as checkNoSecrets } from "../check-no-secrets.js";
import { run as checkDerivedSecrets } from "../check-derived-secrets.js";
import { run as checkImagePrivacy } from "../check-image-privacy.js";
import { run as checkFogSafety } from "../check-fog-safety.js";
import { run as checkArtifactShape } from "../check-artifact-shape.js";
import { run as checkPlayerSecrets } from "../check-player-secrets.js";
import { run as checkPlayerFiles } from "../check-player-files.js";
import { run as auditAssets } from "./audit-assets.js";

export type ScanId =
  | "check-no-secrets"
  | "check-derived-secrets"
  | "check-artifact-shape"
  | "check-image-privacy"
  | "check-fog-safety"
  | "check-player-secrets"
  | "check-player-files"
  | "audit-assets";

/** Absolute paths the scans run against. `root` is the repo root. */
export interface ScanContext {
  root: string;
  configPath: string;
  contentDir: string;
}

export interface ScanTask {
  scan: ScanId;
  label: string;
  run: () => number | Promise<number>;
}

interface ScanEntry {
  id: ScanId;
  /** Script path under `scripts/`, as the integrity smoke spawns it. */
  script: string;
  /** Why the integrity smoke has no planted-fault variant, if it has none. */
  smokeSkip?: string;
  tasks: (ctx: ScanContext) => Omit<ScanTask, "scan">[];
}

/** The built site and the source store it was copied from. */
function artifactDirs(ctx: ScanContext): [string, string][] {
  return [
    ["dist", path.join(ctx.root, "dist")],
    ["public/atlas", path.join(ctx.root, "public", "atlas")],
  ];
}

function perDir(
  id: ScanId,
  ctx: ScanContext,
  run: (dir: string, label: string) => number | Promise<number>,
): Omit<ScanTask, "scan">[] {
  return artifactDirs(ctx).map(([label, dir]) => ({
    label: `${id} ${label}`,
    run: () => run(dir, label),
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
      perDir("check-fog-safety", ctx, (dir) => checkFogSafety({ dir, config: ctx.configPath })),
  },
  {
    id: "check-player-secrets",
    script: "check-player-secrets.ts",
    tasks: (ctx) => perDir("check-player-secrets", ctx, (dir) => checkPlayerSecrets({ dir })),
  },
  {
    id: "check-player-files",
    script: "check-player-files.ts",
    // The built site only: public/atlas is the DM's store and legitimately
    // holds files the player build drops (source-named audio beds).
    tasks: (ctx) => [
      {
        label: "check-player-files dist",
        run: () => checkPlayerFiles({ dir: path.join(ctx.root, "dist") }),
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

export function scanTasks(ctx: ScanContext): ScanTask[] {
  return SCANS.flatMap((s) => s.tasks(ctx).map((t) => ({ ...t, scan: s.id })));
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
