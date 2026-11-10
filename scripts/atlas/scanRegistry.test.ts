/**
 * eval-2026-10/01: one list of safety scans. CI (the orchestrator), the
 * editor's Publish check and the integrity smoke all read SCANS, so a scan
 * can't be dropped from one of them without a test failing.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LEGACY_OUTPUT,
  MISSING_ARTIFACT_EXIT,
  SCANS,
  campaignArtifacts,
  missingArtifacts,
  scanTasks,
  runAll,
  type ScanContext,
  type ScanTask,
} from "./scanRegistry";
import { MISSING_ARTIFACT_MSG, runPublishScans } from "./publishScan";
import { SAFE_ID } from "./loadAtlasModel";

const SCRIPTS_DIR = path.resolve(__dirname, "..");
const FIXTURE_CONTENT = path.resolve(__dirname, "../../src/test/fixtures/atlas-build/content");
const V2_CONTENT = path.resolve(__dirname, "../../src/test/fixtures/scan-registry/v2/content");

const temps: string[] = [];
afterAll(() => {
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

/** `atlasJson` with one map whose layer shows `src`. */
function withMap(atlasJson: string, src: string): string {
  return JSON.stringify({
    ...JSON.parse(atlasJson),
    maps: [{ id: "m", layers: [{ id: "base", src }] }],
  });
}

/** A v2 campaign's must-not-ship file (R-17), beside its store. */
const MUST_NOT_SHIP = (id: string) => `.atlas-campaigns/${id}/must-not-ship.json`;
function mustNotShipFile(id: string, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    campaign: id,
    ids: [],
    names: [],
    paths: [],
    pinLocations: [],
    otherCampaigns: [],
    ...over,
  });
}

/** A temp repo root whose atlas.config.json points at `contentRoot` (v1 by default). */
function repoWith(
  contentRoot = FIXTURE_CONTENT,
  defaultWorld = "test-world",
  outputDir = ".atlas-campaigns",
): ScanContext {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-registry-"));
  temps.push(root);
  const configPath = path.join(root, "atlas.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      contentRoot,
      defaultWorld,
      outputDir,
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  return { root, configPath, contentDir: contentRoot };
}

describe("SCANS", () => {
  it("lists every scanner script under scripts/", () => {
    const scanners = fs
      .readdirSync(SCRIPTS_DIR)
      .filter((n) => /^check-.*\.ts$/.test(n) && !n.endsWith(".test.ts"))
      .concat("atlas/audit-assets.ts")
      .sort();
    expect(SCANS.map((s) => s.script).sort()).toEqual(scanners);
  });

  it("every scan has an integrity-smoke variant, or a reason it has none", () => {
    const smoke = fs.readFileSync(path.join(__dirname, "publish-integrity-smoke.ts"), "utf8");
    for (const s of SCANS) {
      const hasVariant = smoke.includes(`runScan("${s.script}"`);
      if (s.smokeSkip !== undefined) {
        expect(hasVariant, `${s.id} has a variant and a skip reason`).toBe(false);
        expect(s.smokeSkip.length, `${s.id} skip reason`).toBeGreaterThan(10);
      } else {
        expect(hasVariant, `${s.id} has no integrity-smoke variant`).toBe(true);
      }
    }
  });

  it("each leak scan runs on both the built site and the source store", () => {
    const labels = scanTasks(repoWith()).map((t) => t.label);
    for (const id of [
      "check-no-secrets",
      "check-derived-secrets",
      "check-image-privacy",
      "check-fog-safety",
      "check-player-secrets",
    ]) {
      expect(labels).toContain(`${id} dist`);
      expect(labels).toContain(`${id} public/atlas`);
    }
  });

  it("checks the built site's file types (the DM's store may hold other files)", () => {
    const labels = scanTasks(repoWith()).map((t) => t.label);
    expect(labels.filter((l) => l.startsWith("check-player-files"))).toEqual([
      "check-player-files dist",
    ]);
  });
});

describe("runAll", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const task = (label: string, code: number, ran: string[]): ScanTask => ({
    scan: "check-no-secrets",
    label,
    requires: [],
    run: async () => {
      ran.push(label);
      return code;
    },
  });

  it("runs every task and exits 0 when all are clean", async () => {
    const ran: string[] = [];
    expect(await runAll([task("a", 0, ran), task("b", 0, ran)])).toBe(0);
    expect(ran.sort()).toEqual(["a", "b"]);
  });

  it("exits 1 when one scan fails, after running the rest", async () => {
    const ran: string[] = [];
    expect(await runAll([task("a", 13, ran), task("b", 0, ran)])).toBe(1);
    expect(ran.sort()).toEqual(["a", "b"]);
  });

  it("exits 1 when a scan throws", async () => {
    const boom: ScanTask = {
      scan: "check-no-secrets",
      label: "boom",
      requires: [],
      run: () => {
        throw new Error("x");
      },
    };
    expect(await runAll([boom])).toBe(1);
  });
});

describe("runPublishScans (the editor's Publish check)", () => {
  let root: string;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-scans-"));
    fs.writeFileSync(
      path.join(root, "atlas.config.json"),
      JSON.stringify({
        contentRoot: FIXTURE_CONTENT,
        defaultWorld: "test-world",
        include: ["**/*.md"],
        exclude: [],
      }),
    );
    fs.mkdirSync(path.join(root, "public", "atlas", "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "public", "atlas", "atlas.json"),
      JSON.stringify({
        version: "1",
        schemaVersion: 1,
        worlds: [],
        entities: [],
        maps: [{ id: "m", layers: [{ id: "base", src: "atlas/assets/maps/world.png" }] }],
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks on an unstripped {{secret:}} marker, as CI does", async () => {
    fs.writeFileSync(path.join(root, "public", "atlas", "notes.txt"), "{{secret:vault-key}}");
    const reasons = await runPublishScans(root);
    expect(reasons.map((r) => r.scan)).toContain("check-player-secrets");
    expect(JSON.stringify(reasons)).not.toContain("vault-key");
  });

  it("blocks with the path when the built site is missing (R-03)", async () => {
    const reasons = await runPublishScans(root);
    const missing = reasons.filter((r) => r.message === MISSING_ARTIFACT_MSG);
    expect(missing.map((r) => r.locator?.file)).toContain("dist/atlas/atlas.json");
    expect(missing.map((r) => r.scan)).toEqual(
      expect.arrayContaining(["check-player-files", "check-fog-safety", "check-no-secrets-dm"]),
    );
    // public/atlas/assets exists but is empty: the size audit has nothing to check.
    expect(reasons).toContainEqual(
      expect.objectContaining({
        scan: "audit-assets",
        message: MISSING_ARTIFACT_MSG,
        locator: { file: "public/atlas/assets" },
      }),
    );
  });
});

/**
 * R-03: in publish mode a missing listed artifact fails every scan. One
 * built-site fixture with every artifact a task lists; for each task and each
 * artifact it lists, the artifact removed (and, separately, emptied) fails the
 * task without running its scan, naming the path.
 */
describe("publish mode: a missing artifact fails every scan (R-03)", () => {
  let root: string;
  let ctx: ScanContext;

  function writeBuiltSite(r: string) {
    const put = (rel: string, body: string) => {
      const abs = path.join(r, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    const atlas = JSON.stringify({ version: "1", schemaVersion: 1, worlds: [], entities: [] });
    put("dist/index.html", "<html>");
    put("dist/atlas/atlas.json", atlas);
    put("dist/atlas/search-index.json", "[]");
    put("public/atlas/atlas.json", withMap(atlas, "atlas/assets/maps/world.png"));
    put("public/atlas/assets/maps/world.png", "png");
    put("content/world/place.md", "# Place");
    put(
      "atlas.config.json",
      JSON.stringify({
        contentRoot: "content",
        defaultWorld: "world",
        include: ["**/*.md"],
        exclude: [],
      }),
    );
  }

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-missing-"));
    ctx = {
      root,
      configPath: path.join(root, "atlas.config.json"),
      contentDir: path.join(root, "content"),
    };
    writeBuiltSite(root);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const errors = () => vi.mocked(console.error).mock.calls.flat().join("\n");

  it("every scan in the registry lists at least one artifact", () => {
    const tasks = scanTasks(ctx);
    for (const s of SCANS) {
      const own = tasks.filter((t) => t.scan === s.id);
      expect(own.length, s.id).toBeGreaterThan(0);
      for (const t of own) expect(t.requires.length, t.label).toBeGreaterThan(0);
    }
  });

  it("the secret-name and fog scans also need the config, and content/ for secret names", () => {
    const tasks = scanTasks(ctx);
    const needs = (id: string) =>
      tasks.filter((t) => t.scan === id).map((t) => t.requires.map((a) => a.path));
    for (const id of ["check-derived-secrets", "check-image-privacy"]) {
      for (const paths of needs(id)) {
        expect(paths, id).toEqual(expect.arrayContaining([ctx.configPath, ctx.contentDir]));
      }
    }
    for (const paths of needs("check-fog-safety")) expect(paths).toContain(ctx.configPath);
  });

  it("the full fixture has every listed artifact (the control)", () => {
    for (const t of scanTasks(ctx)) expect(missingArtifacts(t), t.label).toEqual([]);
  });

  const casesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scan-cases-"));
  temps.push(casesRoot);
  writeBuiltSite(casesRoot);
  const cases = scanTasks({
    root: casesRoot,
    configPath: path.join(casesRoot, "atlas.config.json"),
    contentDir: path.join(casesRoot, "content"),
  }).flatMap((t) =>
    t.requires.flatMap((a, i) =>
      (["removed", "emptied"] as const).map((how) => ({
        label: t.label,
        rel: path.relative(casesRoot, a.path),
        i,
        how,
      })),
    ),
  );

  it.each(cases)("$label fails when $rel is $how", async ({ label, rel, i, how }) => {
    const task = scanTasks(ctx).find((t) => t.label === label)!;
    const artifact = task.requires[i];
    expect(path.relative(root, artifact.path)).toBe(rel);
    if (how === "removed") {
      fs.rmSync(artifact.path, { recursive: true, force: true });
    } else if (artifact.kind === "file") {
      fs.writeFileSync(artifact.path, "");
    } else {
      fs.rmSync(artifact.path, { recursive: true, force: true });
      fs.mkdirSync(artifact.path);
    }
    expect(await task.run()).toBe(MISSING_ARTIFACT_EXIT);
    expect(errors()).toContain(artifact.path);
    expect(errors()).toContain(label);
  });

  it("a dist/atlas/ with no atlas.json fails every dist scan", async () => {
    fs.rmSync(path.join(root, "dist", "atlas", "atlas.json"));
    const distTasks = scanTasks(ctx).filter((t) => t.label.endsWith(" dist"));
    expect(distTasks.length).toBeGreaterThanOrEqual(6);
    for (const t of distTasks) expect(await t.run(), t.label).toBe(MISSING_ARTIFACT_EXIT);
  });

  it("runAll fails the publish when one artifact is missing", async () => {
    fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
    const tasks = scanTasks(ctx).filter((t) => t.label === "check-player-files dist");
    expect(await runAll(tasks)).toBe(1);
  });
});

describe("scan layouts", () => {
  let root: string;
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-layouts-"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("a built site whose atlas.json is missing fails the fog and player-secrets scans", async () => {
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "index.html"), "<html>");
    // A stray atlas.json at the top of dist is not where the built site keeps it.
    fs.writeFileSync(path.join(root, "dist", "atlas.json"), "{}");
    const ctx = { ...repoWith(), root };
    const wanted = ["check-fog-safety dist", "check-player-secrets dist"];
    const tasks = scanTasks(ctx).filter((t) => wanted.includes(t.label));
    expect(tasks).toHaveLength(2);
    for (const t of tasks) expect(await t.run(), t.label).not.toBe(0);
  });
});

/**
 * R-15: the registry reads the campaign list from the loaded model. v1 content
 * is campaign `main` on today's two dirs; v2 content gives every campaign its
 * own store and built site (ADR-0004).
 */
describe("campaign dirs (R-15)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const rel = (ctx: ScanContext, p: string) => path.relative(ctx.root, p).split(path.sep).join("/");

  it("v1: exactly today's task list, labelled campaign main", () => {
    const ctx = repoWith();
    const list = scanTasks(ctx).map((t) => ({
      label: t.label,
      campaign: t.campaign ?? null,
      requires: t.requires.map((a) => `${a.kind} ${rel(ctx, a.path)}`),
    }));
    const cfg = "file atlas.config.json";
    const content = `dir ${rel(ctx, FIXTURE_CONTENT)}`;
    const dist = "file dist/atlas/atlas.json";
    const store = "file public/atlas/atlas.json";
    expect(list).toEqual([
      { label: "check-no-secrets dist", campaign: "main", requires: [dist] },
      { label: "check-no-secrets public/atlas", campaign: "main", requires: [store] },
      { label: "check-derived-secrets dist", campaign: "main", requires: [dist, cfg, content] },
      {
        label: "check-derived-secrets public/atlas",
        campaign: "main",
        requires: [store, cfg, content],
      },
      { label: "check-artifact-shape public/atlas", campaign: "main", requires: [store] },
      { label: "check-image-privacy dist", campaign: "main", requires: [dist, cfg, content] },
      {
        label: "check-image-privacy public/atlas",
        campaign: "main",
        requires: [store, cfg, content],
      },
      { label: "check-fog-safety dist", campaign: "main", requires: [dist, cfg] },
      { label: "check-fog-safety public/atlas", campaign: "main", requires: [store, cfg] },
      { label: "check-player-secrets dist", campaign: "main", requires: [dist] },
      { label: "check-player-secrets public/atlas", campaign: "main", requires: [store] },
      { label: "check-player-files dist", campaign: "main", requires: [dist] },
      { label: "check-vault-content content", campaign: null, requires: [content] },
      {
        label: "audit-assets public/atlas/assets",
        campaign: "main",
        requires: [store, "dir public/atlas/assets", content],
      },
    ]);
  });

  it("v2: each campaign gets its own store and built site, and the deployed pair is still scanned", () => {
    const ctx = repoWith(V2_CONTENT);
    expect(campaignArtifacts(ctx).map((a) => [a.campaign, a.label, a.layout])).toEqual([
      [LEGACY_OUTPUT, "dist", "built-site"],
      [LEGACY_OUTPUT, "public/atlas", "store"],
      ["a", "dist-campaigns/a", "built-site"],
      ["a", ".atlas-campaigns/a/atlas", "store"],
      ["b", "dist-campaigns/b", "built-site"],
      ["b", ".atlas-campaigns/b/atlas", "store"],
    ]);
  });

  // Every per-artifact scan, and the layouts it runs on.
  const PER_ARTIFACT: [string, ("built-site" | "store")[]][] = [
    ["check-no-secrets", ["built-site", "store"]],
    ["check-derived-secrets", ["built-site", "store"]],
    ["check-artifact-shape", ["store"]],
    ["check-image-privacy", ["built-site", "store"]],
    ["check-fog-safety", ["built-site", "store"]],
    ["check-player-secrets", ["built-site", "store"]],
    ["check-player-files", ["built-site"]],
    ["audit-assets", ["store"]],
  ];
  const CONTENT_WIDE = ["check-vault-content"];
  const DIRS = {
    "built-site": (id: string) => `dist-campaigns/${id}`,
    store: (id: string) => `.atlas-campaigns/${id}/atlas`,
  };
  const ATLAS_JSON = {
    "built-site": (id: string) => `dist-campaigns/${id}/atlas/atlas.json`,
    store: (id: string) => `.atlas-campaigns/${id}/atlas/atlas.json`,
  };

  it("the table covers every scan in the registry", () => {
    expect([...PER_ARTIFACT.map(([id]) => id), ...CONTENT_WIDE].sort()).toEqual(
      SCANS.map((s) => s.id).sort(),
    );
  });

  describe.each(PER_ARTIFACT)("v2: %s", (scan, layouts) => {
    it.each(["a", "b"])("one task per layout for campaign %s, requiring its atlas.json", (id) => {
      const ctx = repoWith(V2_CONTENT);
      const own = scanTasks(ctx).filter((t) => t.scan === scan && t.campaign === id);
      expect(own.map((t) => t.label)).toEqual(
        layouts.map((l) =>
          scan === "audit-assets" ? `${scan} ${DIRS[l](id)}/assets` : `${scan} ${DIRS[l](id)}`,
        ),
      );
      own.forEach((t, i) => {
        expect(t.label).toContain(id);
        expect(rel(ctx, t.requires[0].path)).toBe(ATLAS_JSON[layouts[i]](id));
      });
    });
  });

  it("v2: every scan of v1's deployed dirs still runs, labelled as the legacy output", () => {
    const ctx = repoWith(V2_CONTENT);
    const v1Labels = scanTasks(repoWith())
      .filter((t) => t.campaign !== undefined)
      .map((t) => t.label);
    const legacy = scanTasks(ctx).filter((t) => t.campaign === LEGACY_OUTPUT);
    expect(legacy.map((t) => t.label)).toEqual(v1Labels);
  });

  it.each(CONTENT_WIDE)("v2: %s runs once", (scan) => {
    const tasks = scanTasks(repoWith(V2_CONTENT)).filter((t) => t.scan === scan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].campaign).toBeUndefined();
  });

  /** Both campaigns' outputs, with every artifact a task lists. */
  function writeCampaignOutputs(ctx: ScanContext) {
    const atlas = JSON.stringify({ version: "1", schemaVersion: 1, worlds: [], entities: [] });
    const put = (r: string, body: string) => {
      const abs = path.join(ctx.root, r);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    // The legacy pair the deploy still ships.
    put("dist/atlas/atlas.json", atlas);
    put("public/atlas/atlas.json", withMap(atlas, "atlas/assets/maps/vale.webp"));
    put("public/atlas/assets/maps/vale.webp", "webp");
    for (const id of ["a", "b"]) {
      put(`dist-campaigns/${id}/index.html`, "<html>");
      // Each campaign's atlas.json names its own campaign (check-derived-secrets checks it).
      const own = JSON.stringify({ ...JSON.parse(atlas), campaign: { id, name: id } });
      put(ATLAS_JSON["built-site"](id), own);
      put(ATLAS_JSON.store(id), withMap(own, "atlas/assets/maps/vale.webp"));
      put(`.atlas-campaigns/${id}/atlas/assets/maps/vale.webp`, "webp");
      put(MUST_NOT_SHIP(id), mustNotShipFile(id));
    }
  }

  it("v2: the full outputs have every listed artifact (the control)", () => {
    const ctx = repoWith(V2_CONTENT);
    writeCampaignOutputs(ctx);
    for (const t of scanTasks(ctx)) expect(missingArtifacts(t), t.label).toEqual([]);
  });

  const removals = (["a", "b"] as const).flatMap((id) =>
    (["built-site", "store"] as const).map((layout) => ({ id, layout })),
  );

  it.each(removals)(
    "v2: removing $id's $layout atlas.json fails every $id task on it and none of the other's",
    async ({ id, layout }) => {
      const ctx = repoWith(V2_CONTENT);
      writeCampaignOutputs(ctx);
      const gone = path.join(ctx.root, ATLAS_JSON[layout](id));
      fs.rmSync(gone);
      const tasks = scanTasks(ctx);
      const hit = tasks.filter((t) => t.campaign === id && t.label.includes(DIRS[layout](id)));
      expect(hit.length).toBe(PER_ARTIFACT.filter(([, ls]) => ls.includes(layout)).length);
      for (const t of hit) {
        expect(await t.run(), t.label).toBe(MISSING_ARTIFACT_EXIT);
      }
      const errors = vi.mocked(console.error).mock.calls.flat().join("\n");
      expect(errors).toContain(gone);
      for (const t of tasks.filter((t) => !hit.includes(t))) {
        expect(missingArtifacts(t), t.label).toEqual([]);
      }
    },
  );

  it("v2: removing a campaign's whole output fails every task for it, none for the other", async () => {
    const ctx = repoWith(V2_CONTENT);
    writeCampaignOutputs(ctx);
    fs.rmSync(path.join(ctx.root, "dist-campaigns", "a"), { recursive: true });
    fs.rmSync(path.join(ctx.root, ".atlas-campaigns", "a"), { recursive: true });
    const tasks = scanTasks(ctx);
    for (const t of tasks.filter((t) => t.campaign === "a")) {
      expect(await t.run(), t.label).toBe(MISSING_ARTIFACT_EXIT);
    }
    for (const t of tasks.filter((t) => t.campaign !== "a")) {
      expect(missingArtifacts(t), t.label).toEqual([]);
    }
  });

  describe("v2 (R-17): the stores root is the config's outputDir", () => {
    it("scans the stores where the build writes them", () => {
      const ctx = repoWith(V2_CONTENT, "test-world", "out/stores");
      const derived = scanTasks(ctx).filter(
        (t) => t.label.startsWith("check-derived-secrets") && t.campaign === "a",
      );
      const reqs = JSON.stringify(derived.map((t) => t.requires));
      expect(derived.length).toBeGreaterThan(0);
      expect(reqs).toContain("out/stores/a/must-not-ship.json");
      expect(reqs).toContain("out/stores/a/atlas");
      expect(reqs).not.toContain(".atlas-campaigns");
    });

    it("refuses a v2 config with no outputDir", () => {
      const ctx = repoWith(V2_CONTENT);
      const cfg = JSON.parse(fs.readFileSync(ctx.configPath, "utf8"));
      delete cfg.outputDir;
      fs.writeFileSync(ctx.configPath, JSON.stringify(cfg));
      expect(() => scanTasks(ctx)).toThrow(/names no outputDir/);
    });
  });

  describe("fails closed when the campaign list can't be loaded", () => {
    it("a missing config", () => {
      const ctx = {
        ...repoWith(),
        configPath: path.join(os.tmpdir(), "no-such-atlas.config.json"),
      };
      expect(() => scanTasks(ctx)).toThrow(/campaign list can't be loaded/);
    });

    it("a config without include/exclude", () => {
      const ctx = repoWith();
      fs.writeFileSync(ctx.configPath, JSON.stringify({ contentRoot: FIXTURE_CONTENT }));
      expect(() => scanTasks(ctx)).toThrow(/campaign list can't be loaded/);
    });

    /** v2 content with campaign b's file gone: it can't load. */
    function brokenV2(): string {
      const content = copyV2();
      fs.rmSync(path.join(content, "_atlas", "campaigns", "b.yaml"));
      return content;
    }

    /** A temp copy of the v2 fixture's content root. */
    function copyV2(): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-v2-"));
      temps.push(dir);
      const content = path.join(dir, "content");
      fs.cpSync(V2_CONTENT, content, { recursive: true });
      return content;
    }

    /** A copy of the v2 fixture with `atlas.yaml`'s campaign list replaced. */
    function v2WithCampaigns(campaigns: string[]): string {
      const content = copyV2();
      const file = path.join(content, "_atlas", "atlas.yaml");
      const text = fs.readFileSync(file, "utf8");
      const list = campaigns.length
        ? campaigns.map((c) => `\n  - ${JSON.stringify(c)}`).join("")
        : " []";
      fs.writeFileSync(file, text.replace(/campaigns:\n {2}- a\n {2}- b/, `campaigns:${list}`));
      return content;
    }

    it("v2 content that lists no campaigns", () => {
      expect(() => scanTasks(repoWith(v2WithCampaigns([])))).toThrow(/campaign/);
    });

    it.each(["../a", "a/b", ".a", "a.", "a ", "con."])("an unsafe campaign id %j", (id) => {
      expect(() => scanTasks(repoWith(v2WithCampaigns(["a", id])))).toThrow(
        /is not a valid campaign id|can't name a dir/,
      );
    });

    it("v2 content that doesn't load", () => {
      expect(() => scanTasks(repoWith(brokenV2()))).toThrow(/campaign list can't be loaded/);
    });

    it("the editor's Publish check rejects rather than report safe", async () => {
      const ctx = repoWith(brokenV2());
      await expect(runPublishScans(ctx.root)).rejects.toThrow(/campaign list can't be loaded/);
    });
  });

  it("v2 (R-17): check-derived-secrets requires each campaign's must-not-ship file, not the legacy pair's", async () => {
    const ctx = repoWith(V2_CONTENT);
    writeCampaignOutputs(ctx);
    const tasks = scanTasks(ctx).filter((t) => t.scan === "check-derived-secrets");
    for (const t of tasks) {
      const wants = t.requires
        .map((a) => rel(ctx, a.path))
        .filter((p) => p.endsWith("must-not-ship.json"));
      expect(wants, t.label).toEqual(
        t.campaign === LEGACY_OUTPUT ? [] : [MUST_NOT_SHIP(t.campaign!)],
      );
    }
    fs.rmSync(path.join(ctx.root, MUST_NOT_SHIP("a")));
    for (const t of tasks.filter((t) => t.campaign === "a")) {
      expect(await t.run(), t.label).toBe(MISSING_ARTIFACT_EXIT);
    }
    for (const t of tasks.filter((t) => t.campaign !== "a")) {
      expect(missingArtifacts(t), t.label).toEqual([]);
    }
  });

  it("v2 (R-17): check-derived-secrets fails a store naming what its must-not-ship file lists", async () => {
    const ctx = repoWith(V2_CONTENT);
    writeCampaignOutputs(ctx);
    fs.writeFileSync(
      path.join(ctx.root, MUST_NOT_SHIP("b")),
      mustNotShipFile("b", { ids: ["gloomharbour"], paths: ["images/gloomharbour.png"] }),
    );
    fs.writeFileSync(
      path.join(ctx.root, ATLAS_JSON.store("b")),
      JSON.stringify({
        version: "1",
        schemaVersion: 1,
        worlds: [],
        entities: [],
        campaign: { id: "b", name: "b" },
        note: "Gloomharbour",
      }),
    );
    const own = scanTasks(ctx).filter((t) => t.scan === "check-derived-secrets");
    const byLabel = new Map(own.map((t) => [t.label, t]));
    expect(await byLabel.get(`check-derived-secrets ${DIRS.store("b")}`)!.run()).toBe(12);
    expect(await byLabel.get(`check-derived-secrets ${DIRS.store("a")}`)!.run()).toBe(0);
  });

  describe("v2 (R-17): audit-assets needs assets/ only when the store names a file in it", () => {
    const auditOf = (ctx: ScanContext, id: string) =>
      scanTasks(ctx).find((t) => t.scan === "audit-assets" && t.campaign === id)!;
    const assetsDir = (ctx: ScanContext, id: string) =>
      path.join(ctx.root, ".atlas-campaigns", id, "atlas", "assets");

    it("a store naming no asset passes with no assets/ dir", async () => {
      const ctx = repoWith(V2_CONTENT);
      writeCampaignOutputs(ctx);
      fs.writeFileSync(
        path.join(ctx.root, ATLAS_JSON.store("a")),
        JSON.stringify({ version: "1", schemaVersion: 1, worlds: [], entities: [], maps: [] }),
      );
      fs.rmSync(assetsDir(ctx, "a"), { recursive: true });
      expect(missingArtifacts(auditOf(ctx, "a"))).toEqual([]);
      expect(await auditOf(ctx, "a").run()).toBe(0);
    });

    it("a store naming an asset fails without its assets/ dir, or with it empty", async () => {
      const ctx = repoWith(V2_CONTENT);
      writeCampaignOutputs(ctx);
      fs.rmSync(path.join(assetsDir(ctx, "a"), "maps"), { recursive: true });
      expect(await auditOf(ctx, "a").run()).toBe(MISSING_ARTIFACT_EXIT);
      fs.rmSync(assetsDir(ctx, "a"), { recursive: true });
      expect(await auditOf(ctx, "a").run()).toBe(MISSING_ARTIFACT_EXIT);
    });

    it("a store whose atlas.json isn't valid JSON still needs assets/ (fail closed)", () => {
      const ctx = repoWith(V2_CONTENT);
      writeCampaignOutputs(ctx);
      fs.writeFileSync(path.join(ctx.root, ATLAS_JSON.store("a")), "{not json");
      fs.rmSync(assetsDir(ctx, "a"), { recursive: true });
      expect(missingArtifacts(auditOf(ctx, "a"))).toContain(`${assetsDir(ctx, "a")} is missing`);
    });
  });

  it("the editor's Publish check names a v2 campaign's missing output", async () => {
    const ctx = repoWith(V2_CONTENT);
    writeCampaignOutputs(ctx);
    fs.rmSync(path.join(ctx.root, ATLAS_JSON["built-site"]("b")));
    const reasons = await runPublishScans(ctx.root);
    const missing = reasons.filter((r) => r.message === MISSING_ARTIFACT_MSG);
    expect(missing.length).toBeGreaterThan(0);
    for (const r of missing) {
      expect(r.target).toBe("dist-campaigns/b");
      expect(r.locator).toEqual({ file: "dist-campaigns/b/atlas/atlas.json" });
    }
  });
});

describe("SAFE_ID (the one id rule for folders and campaign dirs)", () => {
  it.each(["main", "a", "astrath-deeprealm", "v1.2", "_x", "a_b-c"])("accepts %j", (id) => {
    expect(SAFE_ID.test(id)).toBe(true);
  });
  it.each(["", ".a", "..", "a/b", "a\\b", "a.", "a..", "a ", " a", "a b", "-a"])(
    "rejects %j",
    (id) => {
      expect(SAFE_ID.test(id)).toBe(false);
    },
  );
});
