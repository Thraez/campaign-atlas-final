/**
 * R-19: `atlas:publish` covers every campaign. v1 content keeps today's chain
 * (snapshot, player build, one site build into dist, the scans); v2 content
 * gets a player store and a site build per campaign, from a public dir that
 * holds the app's static files and that campaign's store only.
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parsePublishArgs,
  publishPlan,
  CAMPAIGN_SITE_STATIC_FILES,
  stageCampaignPublicDir,
  type PublishStep,
} from "./publishPlan";
import { CAMPAIGN_PUBLIC_DIR_ENV, sitePublicDir } from "./campaignSitePublicDir";

const ROOT = path.resolve(__dirname, "../..");
const V2_CONTENT = path.resolve(__dirname, "../../src/test/fixtures/scan-registry/v2/content");

const temps: string[] = [];
afterAll(() => {
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
function tmp(label: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `publish-plan-${label}-`));
  temps.push(d);
  return d;
}
function write(file: string, text = "x"): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}
const runs = (plan: PublishStep[]) => plan.filter((s) => s.run).map((s) => s.run!.join(" "));

/** A v2 root: the scan-registry fixture's content (campaigns `a` and `b`). */
function v2Root(): { root: string; configPath: string } {
  const root = tmp("v2");
  fs.cpSync(V2_CONTENT, path.join(root, "content"), { recursive: true });
  const configPath = path.join(root, "atlas.next.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      contentRoot: "content",
      outputDir: ".atlas-campaigns",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  return { root, configPath };
}

describe("parsePublishArgs", () => {
  it("defaults to atlas.config.json", () => {
    expect(parsePublishArgs([])).toEqual({ configPath: "atlas.config.json" });
  });
  it("takes --config <file> and --config=<file>", () => {
    expect(parsePublishArgs(["--config", "atlas.next.config.json"]).configPath).toBe(
      "atlas.next.config.json",
    );
    expect(parsePublishArgs(["--config=x.json"]).configPath).toBe("x.json");
  });
  it("refuses an unknown argument or a missing value", () => {
    expect(() => parsePublishArgs(["--confg", "x"])).toThrow(/--confg/);
    expect(() => parsePublishArgs(["--config"])).toThrow(/--config/);
  });
});

describe("publishPlan: v1 content", () => {
  it("is today's chain: snapshot, player build, one site build into dist, the scans", () => {
    const plan = publishPlan({
      root: ROOT,
      configPath: path.join(ROOT, "atlas.config.json"),
      scratchDir: "/scratch",
    });
    expect(runs(plan)).toEqual([
      "tsx scripts/atlas/snapshot-baseline.ts",
      "tsx scripts/build-atlas.ts --player --strict --config atlas.config.json",
      "vite build",
      "tsx scripts/atlas/publish-orchestrator.ts --config atlas.config.json",
    ]);
    expect(plan.some((s) => s.stage || s.clean)).toBe(false);
    // The site build sees no campaign public dir, whatever the caller's env holds.
    const site = plan.find((s) => s.run?.[0] === "vite")!;
    expect(site.env).toEqual({ [CAMPAIGN_PUBLIC_DIR_ENV]: undefined });
  });
});

describe("publishPlan: v2 content", () => {
  it("builds every campaign's store, then a site per campaign from its own store, then scans", () => {
    const { root, configPath } = v2Root();
    const scratch = "/scratch";
    const plan = publishPlan({ root, configPath, scratchDir: scratch });
    expect(runs(plan)).toEqual([
      "tsx scripts/build-atlas.ts --player --strict --config atlas.next.config.json",
      // dist: the build still writes it and the deploy uploads it (R-15's legacy pair).
      "vite build",
      "vite build --mode production --outDir dist-campaigns/a --emptyOutDir",
      "vite build --mode production --outDir dist-campaigns/b --emptyOutDir",
      "tsx scripts/atlas/publish-orchestrator.ts --config atlas.next.config.json",
    ]);
    // No snapshot: the editor's diff baseline is public/atlas, v1's.
    expect(runs(plan).some((r) => r.includes("snapshot"))).toBe(false);
    // Stale campaign sites go before anything is built.
    expect(plan[0].clean).toBe(path.join(root, "dist-campaigns"));

    for (const id of ["a", "b"]) {
      const stageAt = plan.findIndex((s) => s.stage?.campaign === id);
      const build = plan.findIndex((s) => s.run?.includes(`dist-campaigns/${id}`));
      expect(stageAt).toBeGreaterThan(0);
      expect(build).toBe(stageAt + 1);
      const stage = plan[stageAt].stage!;
      expect(stage.storeDir).toBe(path.join(root, ".atlas-campaigns", id, "atlas"));
      expect(stage.publicDir).toBe(path.join(root, "public"));
      expect(stage.dest).toBe(path.join(scratch, id));
      // The site build reads that staged dir, as a player build.
      expect(plan[build].env).toEqual({
        [CAMPAIGN_PUBLIC_DIR_ENV]: stage.dest,
        INCLUDE_EDITOR: undefined,
      });
    }
    // The legacy site build sees no campaign public dir.
    const legacy = plan.find((s) => s.run?.join(" ") === "vite build")!;
    expect(legacy.env).toEqual({ [CAMPAIGN_PUBLIC_DIR_ENV]: undefined });
  });

  it("fails closed on content it can't load", () => {
    const root = tmp("broken");
    const configPath = path.join(root, "atlas.config.json");
    fs.writeFileSync(configPath, JSON.stringify({ contentRoot: "missing", outputDir: "x" }));
    expect(() => publishPlan({ root, configPath, scratchDir: "/s" })).toThrow();
  });
});

/** The app's static files, as public/ holds them. */
function writeStatic(pub: string) {
  for (const f of CAMPAIGN_SITE_STATIC_FILES) write(path.join(pub, f));
}

describe("stageCampaignPublicDir", () => {
  it("allows exactly the app's static files in public/ today", () => {
    const pub = path.join(ROOT, "public");
    const today = filesUnder(pub).filter(
      (f) => !f.startsWith("atlas/") && !f.endsWith(".DS_Store"),
    );
    expect(today).toEqual([...CAMPAIGN_SITE_STATIC_FILES].sort());
  });

  it("fails on a file in public/ it does not know, and copies no .DS_Store", () => {
    const root = tmp("stray");
    const pub = path.join(root, "public");
    writeStatic(pub);
    write(path.join(pub, ".DS_Store"));
    write(path.join(pub, "icons", ".DS_Store"));
    const store = path.join(root, "store", "atlas");
    write(path.join(store, "atlas.json"));
    const dest = path.join(root, "d");
    stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest });
    expect(filesUnder(dest).filter((f) => f.includes(".DS_Store"))).toEqual([]);

    write(path.join(pub, "secret.txt"));
    expect(() => stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest })).toThrow(
      /secret\.txt/,
    );
    fs.rmSync(path.join(pub, "secret.txt"));
    write(path.join(pub, "icons", "dm-map.png"));
    expect(() => stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest })).toThrow(
      /icons\/dm-map\.png/,
    );
  });

  it("fails when an allowed static file is missing", () => {
    const root = tmp("missing-static");
    const pub = path.join(root, "public");
    writeStatic(pub);
    fs.rmSync(path.join(pub, "robots.txt"));
    const store = path.join(root, "store", "atlas");
    write(path.join(store, "atlas.json"));
    expect(() =>
      stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest: path.join(root, "d") }),
    ).toThrow(/robots\.txt/);
  });

  it("holds the app's static files and this campaign's store as atlas/, nothing else", () => {
    const root = tmp("stage");
    const pub = path.join(root, "public");
    writeStatic(pub);
    write(path.join(pub, "atlas", "atlas.json"), "v1");
    write(path.join(pub, "atlas", ".last-published.json"), "v1");
    write(path.join(pub, "atlas", "assets", "maps", "v1.webp"));
    const stores = path.join(root, ".atlas-campaigns");
    write(path.join(stores, "a", "atlas", "atlas.json"), "a");
    write(path.join(stores, "a", "atlas", "search-index.json"), "[]");
    write(path.join(stores, "a", "atlas", "assets", "maps", "0123456789abcdef.png"));
    write(path.join(stores, "a", "must-not-ship.json"), "{}");
    write(path.join(stores, "b", "atlas", "atlas.json"), "b");
    write(path.join(stores, "b", "atlas", "assets", "maps", "fedcba9876543210.png"));

    const dest = path.join(root, "staged", "a");
    stageCampaignPublicDir({
      publicDir: pub,
      storeDir: path.join(stores, "a", "atlas"),
      dest,
    });
    expect(filesUnder(dest)).toEqual(
      [
        "atlas/assets/maps/0123456789abcdef.png",
        "atlas/atlas.json",
        "atlas/search-index.json",
        ...CAMPAIGN_SITE_STATIC_FILES,
      ].sort(),
    );
    expect(fs.readFileSync(path.join(dest, "atlas", "atlas.json"), "utf8")).toBe("a");
  });

  it("replaces an earlier staging whole", () => {
    const root = tmp("restage");
    const pub = path.join(root, "public");
    writeStatic(pub);
    const store = path.join(root, "store", "atlas");
    write(path.join(store, "atlas.json"));
    const dest = path.join(root, "staged");
    write(path.join(dest, "atlas", "stale.json"));
    stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest });
    expect(filesUnder(dest)).toEqual(["atlas/atlas.json", ...CAMPAIGN_SITE_STATIC_FILES].sort());
  });

  it("refuses a store with no atlas.json and copies no link", () => {
    const root = tmp("nostore");
    const pub = path.join(root, "public");
    writeStatic(pub);
    const store = path.join(root, "store", "atlas");
    fs.mkdirSync(store, { recursive: true });
    expect(() =>
      stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest: path.join(root, "d") }),
    ).toThrow(/atlas\.json/);

    write(path.join(store, "atlas.json"));
    fs.symlinkSync(path.join(pub, "robots.txt"), path.join(store, "linked.txt"));
    expect(() =>
      stageCampaignPublicDir({ publicDir: pub, storeDir: store, dest: path.join(root, "d") }),
    ).toThrow(/link/);
  });
});

describe("sitePublicDir (vite.config's publicDir)", () => {
  it("is public/ unless a campaign public dir is given", () => {
    expect(sitePublicDir({}, false)).toBe("public");
    expect(sitePublicDir({ [CAMPAIGN_PUBLIC_DIR_ENV]: "/s/a" }, false)).toBe("/s/a");
  });
  it("refuses a campaign public dir in an editor build", () => {
    expect(() => sitePublicDir({ [CAMPAIGN_PUBLIC_DIR_ENV]: "/s/a" }, true)).toThrow(/editor/);
  });
});
