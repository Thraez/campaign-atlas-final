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
 *
 * Campaigns (R-15, ADR-0004). The dirs a scan runs on come from the campaign
 * list of the loaded model (`campaignArtifacts`), read through the config the
 * `ScanContext` carries: every per-artifact scan runs once per campaign per
 * layout, and the content-wide one (`check-vault-content`) once.
 *
 * Campaign stores (R-17). A v2 campaign's must-not-ship file sits beside its
 * store (`.atlas-campaigns/<id>/must-not-ship.json`): `check-derived-secrets`
 * requires it and scans both of that campaign's dirs for what it lists. A
 * store whose player JSON names no `assets/` file has nothing for
 * `audit-assets` to measure, so its `assets/` dir is required only when
 * that JSON names one (or can't be read: fail closed).
 *
 * Campaign isolation (R-17b). `check-campaign-isolation` runs on each v2
 * campaign's store and built site only (`v2Only`): the legacy pair and v1
 * content have no must-not-ship file to check against, so a v1 run has none
 * of its tasks.
 */
import fs from "node:fs";
import path from "node:path";
import { playerAtlasJsonPath, type ArtifactLayout } from "./playerArtifact.js";
import { SAFE_ID, loadAtlasModel } from "./loadAtlasModel.js";
import { STORE_DIR, campaignStoreDir, mustNotShipPath } from "./build/campaignStore.js";
import { readPlayerImageRefs } from "./playerImageRefs.js";

import { run as checkNoSecrets } from "../check-no-secrets.js";
import { run as checkDerivedSecrets } from "../check-derived-secrets.js";
import { run as checkCampaignIsolation } from "../check-campaign-isolation.js";
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
  | "check-campaign-isolation"
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
  /**
   * A dir required only when the player JSON in this store dir names a file
   * under `assets/` (R-17: a campaign may show no image at all). When that
   * JSON can't be read the dir is required.
   */
  onlyIfStoreNamesAssets?: string;
}

export interface ScanTask {
  scan: ScanId;
  label: string;
  /** The campaign whose artifact this task scans; unset for a content-wide scan. */
  campaign?: string;
  /** The artifact dir it scans (absolute); unset for a content-wide scan. */
  dir?: string;
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
  /**
   * Why this scan has tasks only on v2 per-campaign outputs (none on v1
   * content or the legacy pair), if so. `scanRegistry.test.ts` exempts such a
   * scan, and only it, from "every scan has a task" on v1 content.
   */
  v2Only?: string;
  /** `artifacts`: every campaign's artifacts (`campaignArtifacts`), loaded once per run. */
  tasks: (ctx: ScanContext, artifacts: CampaignArtifact[]) => TaskSpec[];
}

const file = (p: string): RequiredArtifact => ({ path: p, kind: "file" });
const dir = (p: string): RequiredArtifact => ({ path: p, kind: "dir" });

/** Whether the player JSON in `storeDir` names a file under `assets/`; true when it can't be read. */
function storeNamesAssets(storeDir: string): boolean {
  try {
    return [...readPlayerImageRefs(storeDir)].some((r) => r.startsWith("assets/"));
  } catch {
    return true;
  }
}

/** Why `a` can't be scanned (missing, wrong kind, empty), or null when it can. */
function artifactProblem(a: RequiredArtifact): string | null {
  if (a.onlyIfStoreNamesAssets !== undefined && !storeNamesAssets(a.onlyIfStoreNamesAssets)) {
    return null;
  }
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

/** The campaign v1 content is (ADR-0004: v1 is one campaign, `main`). */
export const V1_CAMPAIGN = "main";

/**
 * One player artifact a scan reads: a campaign's built site or its source
 * store. `label` is the dir relative to the repo root (posix), so the task
 * label (`check-fog-safety dist-campaigns/a`) names the campaign's dir.
 */
export interface CampaignArtifact {
  campaign: string;
  label: string;
  dir: string;
  layout: ArtifactLayout;
  /** v2 campaigns only: the campaign's must-not-ship file (R-17), beside its store. */
  mustNotShip?: string;
}

/**
 * The campaign of the shared output `dist` and `public/atlas` in a v2 run. Not
 * a valid campaign id (`SAFE_ID`), so it can't collide with one.
 */
export const LEGACY_OUTPUT = "(legacy)";

interface ScanConfig {
  defaultWorld: string;
  include: string[];
  exclude: string[];
  /** v2: the root of the campaign stores, as the build reads it (relative to the root). */
  outputDir?: unknown;
}

/**
 * Every campaign's artifacts, from the loaded model (ADR-0004, R-15): the one
 * campaign list the registry knows. v1 content is campaign `main`, whose
 * outputs stay `dist` and `public/atlas`; v2 content gives each listed
 * campaign `dist-campaigns/<id>` and its store `<outputDir>/<id>/atlas` (`.atlas-campaigns`
 * in the v2 test config).
 *
 * A v2 run also scans `dist` and `public/atlas` (campaign `LEGACY_OUTPUT`):
 * the build still writes them and `publish-atlas.yml` deploys `dist`, so they
 * leave the list only when publish and deploy stop producing them (R-19).
 *
 * Fails closed: a config or content root that can't be loaded throws, so a
 * publish can never run with no campaign dirs and report "all clean".
 */
export function campaignArtifacts(ctx: ScanContext): CampaignArtifact[] {
  const where = path.relative(ctx.root, ctx.contentDir).split(path.sep).join("/") || ".";
  let campaigns: string[];
  let schemaVersion: 1 | 2;
  let outputDir: unknown;
  try {
    const cfg = JSON.parse(fs.readFileSync(ctx.configPath, "utf8")) as ScanConfig;
    outputDir = cfg.outputDir;
    const loaded = loadAtlasModel(
      ctx.contentDir,
      { defaultWorld: cfg.defaultWorld, include: cfg.include, exclude: cfg.exclude },
      { root: ctx.root },
    );
    schemaVersion = loaded.model.schemaVersion;
    campaigns = loaded.model.campaigns.map((c) => c.id);
  } catch (e) {
    throw new Error(
      `scan registry: the campaign list can't be loaded from ${where}, so no scan can run: ${(e as Error).message}`,
      { cause: e },
    );
  }
  const rel = (abs: string) => path.relative(ctx.root, abs).split(path.sep).join("/");
  const artifact = (
    campaign: string,
    dir: string,
    layout: ArtifactLayout,
    mustNotShip?: string,
  ): CampaignArtifact => ({
    campaign,
    label: rel(dir),
    dir,
    layout,
    ...(mustNotShip ? { mustNotShip } : {}),
  });
  const shared = (campaign: string) => [
    artifact(campaign, path.join(ctx.root, "dist"), "built-site"),
    artifact(campaign, path.join(ctx.root, "public", "atlas"), "store"),
  ];
  if (schemaVersion === 1) return shared(V1_CAMPAIGN);
  if (campaigns.length === 0) {
    throw new Error(`scan registry: ${where} lists no campaigns, so there is nothing to scan`);
  }
  // The stores are where the build writes them: the config's outputDir.
  if (typeof outputDir !== "string" || outputDir.trim() === "") {
    throw new Error(
      "scan registry: the config names no outputDir, so the campaign stores can't be found",
    );
  }
  const storesRoot = path.resolve(ctx.root, outputDir);
  const perCampaign = campaigns.flatMap((id) => {
    // The loader already refuses such an id; checked again where it becomes a path.
    if (!SAFE_ID.test(id)) {
      throw new Error(`scan registry: campaign id ${JSON.stringify(id)} can't name a dir`);
    }
    const store = campaignStoreDir(storesRoot, id);
    const mustNotShip = mustNotShipPath(store);
    return [
      artifact(id, path.join(ctx.root, "dist-campaigns", id), "built-site", mustNotShip),
      artifact(id, store, "store", mustNotShip),
    ];
  });
  return [...shared(LEGACY_OUTPUT), ...perCampaign];
}

/** The task scanning `a`: its player atlas.json is always required. */
function artifactTask(
  id: ScanId,
  a: CampaignArtifact,
  run: () => number | Promise<number>,
  /** Inputs besides the player atlas.json (the config, content/, an assets dir). */
  extra: RequiredArtifact[] = [],
  label = a.label,
): TaskSpec {
  return {
    label: `${id} ${label}`,
    campaign: a.campaign,
    dir: a.dir,
    // The player atlas.json is in every player artifact; without it the dir
    // is not a build, whatever else it holds.
    requires: [file(playerAtlasJsonPath(a.dir, a.layout)), ...extra],
    run,
  };
}

function perDir(
  id: ScanId,
  artifacts: CampaignArtifact[],
  run: (a: CampaignArtifact) => number | Promise<number>,
  /** Inputs besides the artifact, the same for every dir (config, content/). */
  extra: RequiredArtifact[] = [],
): TaskSpec[] {
  return artifacts.map((a) => artifactTask(id, a, () => run(a), extra));
}

const ofLayout = (artifacts: CampaignArtifact[], layout: ArtifactLayout) =>
  artifacts.filter((a) => a.layout === layout);

export const SCANS: ScanEntry[] = [
  {
    id: "check-no-secrets",
    script: "check-no-secrets.ts",
    tasks: (_ctx, arts) => perDir("check-no-secrets", arts, (a) => checkNoSecrets({ dir: a.dir })),
  },
  {
    id: "check-derived-secrets",
    script: "check-derived-secrets.ts",
    // Secret names come from content/: with none, every artifact is "clean".
    // A v2 campaign's dirs are also scanned for its must-not-ship file (R-17).
    tasks: (ctx, arts) =>
      arts.map((a) =>
        artifactTask(
          "check-derived-secrets",
          a,
          () =>
            checkDerivedSecrets({
              dir: a.dir,
              config: ctx.configPath,
              ...(a.mustNotShip ? { mustNotShip: a.mustNotShip } : {}),
            }),
          [
            file(ctx.configPath),
            dir(ctx.contentDir),
            ...(a.mustNotShip ? [file(a.mustNotShip)] : []),
          ],
        ),
      ),
  },
  {
    id: "check-campaign-isolation",
    script: "check-campaign-isolation.ts",
    v2Only:
      "it checks a campaign's output against that campaign's must-not-ship file, which only v2 builds write",
    // Each v2 campaign's store and built site; a built site is also compared
    // with its store, so that store's atlas.json is required too.
    tasks: (ctx, arts) =>
      arts.flatMap((a) => {
        if (!a.mustNotShip) return [];
        const mustNotShip = a.mustNotShip;
        const atlasDir = path.dirname(playerAtlasJsonPath(a.dir, a.layout));
        const store = path.join(path.dirname(mustNotShip), STORE_DIR);
        return [
          artifactTask(
            "check-campaign-isolation",
            a,
            () =>
              checkCampaignIsolation({
                dir: a.dir,
                layout: a.layout,
                config: ctx.configPath,
                mustNotShip,
              }),
            [
              file(path.join(atlasDir, "search-index.json")),
              file(mustNotShip),
              file(ctx.configPath),
              dir(ctx.contentDir),
              ...(a.layout === "built-site" ? [file(path.join(store, "atlas.json"))] : []),
            ],
          ),
        ];
      }),
  },
  {
    id: "check-artifact-shape",
    script: "check-artifact-shape.ts",
    // The store's atlas.json: the built site's is a copy of it.
    tasks: (_ctx, arts) =>
      ofLayout(arts, "store").map((a) =>
        artifactTask("check-artifact-shape", a, () =>
          checkArtifactShape({ atlasJsonPath: playerAtlasJsonPath(a.dir, a.layout) }),
        ),
      ),
  },
  {
    id: "check-image-privacy",
    script: "check-image-privacy.ts",
    // On the source store, only images the player JSON names are checked by
    // filename: the rest stay in the DM's store and the player build prunes them.
    tasks: (ctx, arts) =>
      perDir(
        "check-image-privacy",
        arts,
        (a) =>
          checkImagePrivacy({
            dir: a.dir,
            config: ctx.configPath,
            ...(a.layout === "store" ? { referencedBy: a.dir } : {}),
          }),
        // The filename check matches secret names derived from content/.
        [file(ctx.configPath), dir(ctx.contentDir)],
      ),
  },
  {
    id: "check-fog-safety",
    script: "check-fog-safety.ts",
    tasks: (ctx, arts) =>
      perDir(
        "check-fog-safety",
        arts,
        (a) =>
          checkFogSafety({
            dir: a.dir,
            config: ctx.configPath,
            layout: a.layout,
            // v2 (R-17): fog is the campaign's; the legacy pair has no campaign.
            ...(a.mustNotShip ? { campaign: a.campaign } : {}),
          }),
        // Without the config the in-fog and alpha checks are skipped.
        [file(ctx.configPath)],
      ),
  },
  {
    id: "check-player-secrets",
    script: "check-player-secrets.ts",
    tasks: (_ctx, arts) =>
      perDir("check-player-secrets", arts, (a) =>
        checkPlayerSecrets({ dir: a.dir, layout: a.layout }),
      ),
  },
  {
    id: "check-player-files",
    script: "check-player-files.ts",
    // The built site only: the store is the DM's and legitimately holds files
    // the player build drops (source-named audio beds).
    tasks: (_ctx, arts) =>
      ofLayout(arts, "built-site").map((a) =>
        artifactTask("check-player-files", a, () => checkPlayerFiles({ dir: a.dir })),
      ),
  },
  {
    id: "check-vault-content",
    script: "check-vault-content.ts",
    // The source, not an artifact, so it runs once: while hosting is public
    // (R-01), content/ must hold nothing Sync from Obsidian wrote.
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
    // Each store's assets are what its site ships, so the size budget is per
    // campaign; the references it compares them with are content/'s.
    tasks: (ctx, arts) =>
      ofLayout(arts, "store").map((a) => {
        const assetsDir = path.join(a.dir, "assets");
        return artifactTask(
          "audit-assets",
          a,
          () =>
            auditAssets({
              assetsDir,
              // Asset paths are compared as `atlas/assets/…`: relative to the store's parent.
              publicDir: path.dirname(a.dir),
              contentDir: ctx.contentDir,
            }),
          [{ ...dir(assetsDir), onlyIfStoreNamesAssets: a.dir }, dir(ctx.contentDir)],
          `${a.label}/assets`,
        );
      }),
  },
];

/** Every task, in publish mode: one whose artifact is missing or empty fails
 *  (MISSING_ARTIFACT_EXIT, the path named) without running its scan. */
export function scanTasks(ctx: ScanContext): ScanTask[] {
  const artifacts = campaignArtifacts(ctx);
  return SCANS.flatMap((s) =>
    s.tasks(ctx, artifacts).map((t) => ({
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
