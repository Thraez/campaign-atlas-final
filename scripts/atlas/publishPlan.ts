/**
 * What `atlas:publish` runs, for one config (R-19, ADR-0004).
 *
 * v1 content (`atlas.config.json`) is today's chain: snapshot the editor's
 * diff baseline, the strict player build into `public/atlas/`, one Vite site
 * build into `dist/`, then the scan registry. So `publish-atlas.yml` and the
 * gate need no change.
 *
 * v2 content (`atlas.next.config.json`): the strict player build writes every
 * campaign's store (`<outputDir>/<id>/atlas/`, R-17); the plain site build
 * still writes `dist/` (R-15 scans it as the `(legacy)` pair, and the deploy
 * uploads it); then, per campaign, a public dir is staged holding the app's
 * static files and that campaign's store only (`stageCampaignPublicDir`), and
 * a player-mode Vite build turns it into `dist-campaigns/<id>/`. Last, the
 * registry runs every scan over every campaign's store and site, R-17b's
 * isolation scan included. Any step that fails stops the publish.
 *
 * The campaigns and their dirs come from the scan registry's
 * `campaignArtifacts`, so the publish builds exactly the dirs the scans read.
 */
import fs from "node:fs";
import path from "node:path";
import { LEGACY_OUTPUT, campaignArtifacts } from "./scanRegistry.js";
import { CAMPAIGN_PUBLIC_DIR_ENV } from "./campaignSitePublicDir.js";
import { STORE_DIR } from "./build/campaignStore.js";

export const DEFAULT_CONFIG = "atlas.config.json";

/** One step. `run` is `["tsx", script, ...args]` or `["vite", ...args]`, run from the root. */
export interface PublishStep {
  label: string;
  run?: string[];
  /** Env overrides for `run`; `undefined` removes the var. */
  env?: Record<string, string | undefined>;
  /** Stage a campaign's public dir before its site build. */
  stage?: { campaign: string; publicDir: string; storeDir: string; dest: string };
  /** Remove this dir (generated output) before anything is built. */
  clean?: string;
}

/** `--config <file>` (default `atlas.config.json`); anything else is refused. */
export function parsePublishArgs(argv: string[]): { configPath: string } {
  let configPath = DEFAULT_CONFIG;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") {
      const v = argv[++i];
      if (!v) throw new Error("--config needs a file");
      configPath = v;
    } else if (a.startsWith("--config=")) configPath = a.slice("--config=".length);
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return { configPath };
}

const posix = (p: string) => p.split(path.sep).join("/");

/**
 * The steps for `configPath`. Throws when the config or content can't be
 * loaded (the registry's own check), so nothing is built from a guess.
 * `scratchDir` holds the staged public dirs, one per campaign.
 */
export function publishPlan({
  root,
  configPath,
  scratchDir,
}: {
  root: string;
  configPath: string;
  scratchDir: string;
}): PublishStep[] {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as { contentRoot: string };
  const contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);
  const artifacts = campaignArtifacts({ root, configPath, contentDir });
  const configArg = posix(path.relative(root, configPath));

  const playerBuild: PublishStep = {
    label: "player build",
    run: ["tsx", "scripts/build-atlas.ts", "--player", "--strict", "--config", configArg],
  };
  const legacySite: PublishStep = {
    label: "site build (dist)",
    run: ["vite", "build"],
    env: { [CAMPAIGN_PUBLIC_DIR_ENV]: undefined },
  };
  const scans: PublishStep = {
    label: "scans",
    run: ["tsx", "scripts/atlas/publish-orchestrator.ts", "--config", configArg],
  };

  // Only v2 campaigns have a must-not-ship file (the registry's own marker).
  const v2 = artifacts.filter((a) => a.mustNotShip && a.campaign !== LEGACY_OUTPUT);
  if (v2.length === 0) {
    return [
      { label: "snapshot", run: ["tsx", "scripts/atlas/snapshot-baseline.ts"] },
      playerBuild,
      legacySite,
      scans,
    ];
  }

  const sitesRoot = path.join(root, "dist-campaigns");
  const perCampaign = v2
    .filter((a) => a.layout === "built-site")
    .flatMap((site): PublishStep[] => {
      const store = path.join(path.dirname(site.mustNotShip!), STORE_DIR);
      const dest = path.join(scratchDir, site.campaign);
      return [
        {
          label: `stage ${site.campaign}`,
          stage: {
            campaign: site.campaign,
            publicDir: path.join(root, "public"),
            storeDir: store,
            dest,
          },
        },
        {
          label: `site build ${site.label}`,
          run: [
            "vite",
            "build",
            "--mode",
            "production",
            "--outDir",
            posix(path.relative(root, site.dir)),
            "--emptyOutDir",
          ],
          env: { [CAMPAIGN_PUBLIC_DIR_ENV]: dest, INCLUDE_EDITOR: undefined },
        },
      ];
    });
  return [
    { label: "clean dist-campaigns", clean: sitesRoot },
    playerBuild,
    legacySite,
    ...perCampaign,
    scans,
  ];
}

/**
 * Write `dest` (replacing it) as a campaign site's public dir: every entry of
 * `publicDir` but `atlas/`, then the campaign's store as `atlas/`. Refuses a
 * store without `atlas.json` and any link in either source.
 */
export function stageCampaignPublicDir({
  publicDir,
  storeDir,
  dest,
}: {
  publicDir: string;
  storeDir: string;
  dest: string;
}): void {
  if (!fs.statSync(path.join(storeDir, "atlas.json"), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`stage: ${storeDir} has no atlas.json, so it is not a built store`);
  }
  const noLinks = (src: string) => {
    if (fs.lstatSync(src).isSymbolicLink()) {
      throw new Error(`stage: ${src} is a link; a campaign site copies no link`);
    }
    return true;
  };
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(publicDir)) {
    if (name === "atlas") continue;
    fs.cpSync(path.join(publicDir, name), path.join(dest, name), {
      recursive: true,
      filter: noLinks,
    });
  }
  fs.cpSync(storeDir, path.join(dest, "atlas"), { recursive: true, filter: noLinks });
}
