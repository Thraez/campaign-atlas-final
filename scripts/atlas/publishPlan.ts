/**
 * What `atlas:publish` runs, for one config (R-19, ADR-0004).
 *
 * v1 content (`atlas.config.json`) is today's chain: snapshot the editor's
 * diff baseline, the strict player build into `public/atlas/`, one Vite site
 * build into `dist/`, then the scan registry. So `publish-atlas.yml` and the
 * gate need no change.
 *
 * v2 content (a v2 config): the strict player build writes every
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
 * The app's static files a campaign site copies from `public/` (posix, relative).
 * An allowlist: anything else in `public/` but `atlas/` (and macOS's
 * `.DS_Store`, never copied) fails the staging, so a stray file can't ship.
 * Add a file here when the app gains one.
 */
export const CAMPAIGN_SITE_STATIC_FILES: readonly string[] = [
  "favicon.ico",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "placeholder.svg",
  "robots.txt",
];

/**
 * Write `dest` (replacing it) as a campaign site's public dir: the
 * `CAMPAIGN_SITE_STATIC_FILES` from `publicDir`, then the campaign's store as
 * `atlas/`. Refuses a store without `atlas.json`, a file in `publicDir` the
 * list doesn't name, a listed file that is missing, and any link.
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
  const allowed = new Set(CAMPAIGN_SITE_STATIC_FILES);
  const unexpected: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (r === "atlas" || e.name === ".DS_Store") continue;
      noLinks(path.join(dir, e.name));
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (!allowed.has(r)) unexpected.push(r);
    }
  };
  walk(publicDir, "");
  const missing = CAMPAIGN_SITE_STATIC_FILES.filter(
    (r) => !fs.statSync(path.join(publicDir, r), { throwIfNoEntry: false })?.isFile(),
  );
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `stage: ${publicDir} is not the app's static files (CAMPAIGN_SITE_STATIC_FILES): ` +
        [
          ...unexpected.map((r) => `${r} is not on the list`),
          ...missing.map((r) => `${r} is missing`),
        ].join("; "),
    );
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const r of CAMPAIGN_SITE_STATIC_FILES) {
    fs.mkdirSync(path.dirname(path.join(dest, r)), { recursive: true });
    fs.copyFileSync(path.join(publicDir, r), path.join(dest, r));
  }
  fs.cpSync(storeDir, path.join(dest, "atlas"), { recursive: true, filter: noLinks });
}
