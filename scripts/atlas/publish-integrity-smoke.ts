#!/usr/bin/env tsx
/**
 * Publish integrity smoke test.
 *
 * Safety net for the `atlas:publish` speedup work (see
 * docs/superpowers/specs/2026-05-28-atlas-publish-speedup.md). A speed
 * optimization could "win" the timing metric by quietly weakening or skipping
 * a leak scan. This smoke proves the opposite: each scan still REJECTS the
 * fault it exists to catch.
 *
 * For every fault class it runs a clean/dirty pair against a throwaway temp
 * dir built from the real player artifacts:
 *
 *   - clean copy  -> the scan must exit 0   (catches a scan gutted to always-fail)
 *   - dirty copy  -> the scan must exit !=0 (catches a scan gutted to always-pass)
 *
 * A variant only PASSES when both halves hold. Variants whose content does not
 * exist in the current vault (e.g. derived secrets when there are no hidden
 * entities) are SKIPPED — that is a legitimate no-op, not a failure. A harness
 * that cannot find the artifacts it needs is an ERROR and fails the smoke.
 *
 * `scanRegistry.test.ts` checks that every scan in the registry has a variant
 * here (or a stated reason it has none).
 *
 * This script must stay independent of HOW publish invokes the scans (inline
 * chain today, an orchestrator tomorrow). It calls each scan script directly,
 * so it keeps guarding the scans no matter how the publish chain is rearranged.
 *
 * Usage:
 *   tsx scripts/atlas/publish-integrity-smoke.ts
 *
 * Exit codes:
 *   0   every fault was caught (or legitimately skipped)
 *   1   a scan failed to reject its fault, or the harness could not run
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DM_CONTENT_SENTINELS } from "../check-no-secrets";
import { deriveSecretsFromVault } from "../check-derived-secrets";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(HERE, "..");
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "atlas.config.json");
const PLAYER_ATLAS = path.join(PROJECT_ROOT, "public", "atlas", "atlas.json");
// Stable committed fixture with hidden/dm entities. The derived-secret scan is
// driven from this rather than the live vault so the guard stays active even
// when the live vault happens to contain no hidden content.
const FIXTURE_CONFIG = path.join(
  PROJECT_ROOT,
  "src",
  "test",
  "fixtures",
  "atlas-build",
  "atlas.config.json",
);

type Outcome = "PASS" | "FAIL" | "SKIP" | "ERROR";

interface VariantResult {
  name: string;
  scan: string;
  outcome: Outcome;
  detail: string;
}

/** Run a scan script in a child tsx process. Returns its exit code (or -1). */
function runScan(scriptRel: string, args: string[]): { code: number; stderr: string } {
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(SCRIPTS_DIR, scriptRel), ...args],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );
  return {
    code: res.status ?? -1,
    stderr: (res.stderr ?? "") + (res.error ? String(res.error) : ""),
  };
}

/** A clean run must exit 0 and a dirty run must exit non-zero, else FAIL. */
function assertCleanThenDirty(
  name: string,
  scan: string,
  clean: () => { code: number; stderr: string },
  dirty: () => { code: number; stderr: string },
): VariantResult {
  const c = clean();
  if (c.code !== 0) {
    return {
      name,
      scan,
      outcome: "FAIL",
      detail: `clean copy was rejected (exit ${c.code}) — scan may be broken or always-fail\n${c.stderr.trim()}`,
    };
  }
  const d = dirty();
  if (d.code === 0) {
    return {
      name,
      scan,
      outcome: "FAIL",
      detail: "planted fault was NOT caught (exit 0) — scan is weakened or skipped",
    };
  }
  if (d.code < 0) {
    return {
      name,
      scan,
      outcome: "ERROR",
      detail: `dirty run failed to spawn\n${d.stderr.trim()}`,
    };
  }
  return { name, scan, outcome: "PASS", detail: `clean exit 0, dirty exit ${d.code}` };
}

function freshDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `atlas-smoke-${label}-`));
}

function readPlayerAtlas(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(PLAYER_ATLAS, "utf8")) as Record<string, unknown>;
}

/** Write `atlas` where the built site keeps it (`<dir>/atlas/atlas.json`), as the scans see dist. */
function writeBuiltSite(dir: string, atlas: Record<string, unknown>): void {
  fs.mkdirSync(path.join(dir, "atlas"));
  fs.writeFileSync(path.join(dir, "atlas", "atlas.json"), JSON.stringify(atlas));
}

// ---- Variant 1: sentinel DM secret (check-no-secrets) -----------------------
function variantSecret(): VariantResult {
  const sentinel = DM_CONTENT_SENTINELS[0];
  return assertCleanThenDirty(
    "DM sentinel secret",
    "check-no-secrets.ts",
    () => {
      const dir = freshDir("secret-clean");
      fs.writeFileSync(path.join(dir, "notes.json"), JSON.stringify({ ok: true }));
      return runScan("check-no-secrets.ts", [dir]);
    },
    () => {
      const dir = freshDir("secret-dirty");
      fs.writeFileSync(
        path.join(dir, "leak.json"),
        JSON.stringify({ body: `prefix ${sentinel} suffix` }),
      );
      return runScan("check-no-secrets.ts", [dir]);
    },
  );
}

// ---- Variant 2: vault-derived secret name (check-derived-secrets) -----------
function variantDerived(): VariantResult {
  const secrets = deriveSecretsFromVault(FIXTURE_CONFIG);
  if (secrets.length === 0) {
    return {
      name: "Vault-derived secret",
      scan: "check-derived-secrets.ts",
      outcome: "ERROR",
      detail:
        `fixture ${path.relative(PROJECT_ROOT, FIXTURE_CONFIG)} yielded no derived ` +
        "secrets — its hidden/dm entities may have changed; the harness needs updating",
    };
  }
  const secretName = secrets[0].name;
  return assertCleanThenDirty(
    "Vault-derived secret",
    "check-derived-secrets.ts",
    () => {
      const dir = freshDir("derived-clean");
      fs.writeFileSync(path.join(dir, "page.txt"), "nothing secret here");
      return runScan("check-derived-secrets.ts", [dir, "--config", FIXTURE_CONFIG]);
    },
    () => {
      const dir = freshDir("derived-dirty");
      fs.writeFileSync(path.join(dir, "page.txt"), `leaked: ${secretName}`);
      return runScan("check-derived-secrets.ts", [dir, "--config", FIXTURE_CONFIG]);
    },
  );
}

// ---- Variant 3: EXIF metadata on an image (check-image-privacy) -------------
async function variantExif(): Promise<VariantResult> {
  const base = sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  });
  const cleanBuf = await base.clone().jpeg().toBuffer();
  const dirtyBuf = await base
    .clone()
    .withExif({ IFD0: { Copyright: "SMOKE_TEST_EXIF_LEAK" } })
    .jpeg()
    .toBuffer();

  return assertCleanThenDirty(
    "Image EXIF leak",
    "check-image-privacy.ts",
    () => {
      const dir = freshDir("exif-clean");
      fs.writeFileSync(path.join(dir, "clean.jpg"), cleanBuf);
      return runScan("check-image-privacy.ts", [dir, "--config", CONFIG_PATH]);
    },
    () => {
      const dir = freshDir("exif-dirty");
      fs.writeFileSync(path.join(dir, "leak.jpg"), dirtyBuf);
      return runScan("check-image-privacy.ts", [dir, "--config", CONFIG_PATH]);
    },
  );
}

// ---- Variant 4: fog geometry not stripped (check-fog-safety) ----------------
function variantFog(): VariantResult {
  const atlas = readPlayerAtlas();
  const maps = Array.isArray(atlas.maps) ? (atlas.maps as Record<string, unknown>[]) : [];
  if (maps.length === 0) {
    return {
      name: "Fog geometry leak",
      scan: "check-fog-safety.ts",
      outcome: "SKIP",
      detail: "player atlas has no maps — fog scan has nothing to check",
    };
  }
  return assertCleanThenDirty(
    "Fog geometry leak",
    "check-fog-safety.ts",
    () => {
      const dir = freshDir("fog-clean");
      writeBuiltSite(dir, atlas);
      return runScan("check-fog-safety.ts", [dir, "--config", CONFIG_PATH]);
    },
    () => {
      const dir = freshDir("fog-dirty");
      const dirty = readPlayerAtlas();
      const dmaps = dirty.maps as Record<string, unknown>[];
      // Enable fog on the first map and leave geometry in place — exactly the
      // strip-pipeline regression check-fog-safety exists to catch (code 14).
      dmaps[0].fog = {
        enabled: true,
        reveals: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      };
      writeBuiltSite(dir, dirty);
      return runScan("check-fog-safety.ts", [dir, "--config", CONFIG_PATH]);
    },
  );
}

// ---- Variant 4b: sound-only area under fog (check-fog-safety, code 21) ------
// arch-02: the build drops a sound-only area with any part under fog, and the
// fog scan re-checks the shipped soundscape against the source fog. Built from
// a throwaway vault (one map, left half revealed), so it runs whatever the
// live vault's maps and sound look like. The dirty half must exit 21 itself:
// any other code means a different check caught something, not this one.
function variantSoundFog(): VariantResult {
  const SOUND_WORLD_YAML = [
    "schemaVersion: 1",
    "maps:",
    "  - id: m1",
    "    worldId: w",
    "    name: Smoke",
    "    width: 100",
    "    height: 100",
    "    layers: []",
    "fog:",
    "  - mapId: m1",
    "    enabled: true",
    "    reveals:",
    "      - [[0, 0], [50, 0], [50, 100], [0, 100]]",
    "",
  ].join("\n");
  const area = (points: number[][]) => ({
    id: "area-0",
    points,
    bed: { src: "atlas/assets/audio/a.ogg" },
  });
  const plant = (label: string, points: number[][]) => {
    const root = freshDir(label);
    const config = path.join(root, "atlas.config.json");
    fs.writeFileSync(config, JSON.stringify({ contentRoot: "content", defaultWorld: "w" }));
    fs.mkdirSync(path.join(root, "content", "w", "_atlas"), { recursive: true });
    fs.writeFileSync(path.join(root, "content", "w", "_atlas", "world.yaml"), SOUND_WORLD_YAML);
    const site = path.join(root, "dist");
    fs.mkdirSync(site);
    writeBuiltSite(site, {
      maps: [
        {
          id: "m1",
          width: 100,
          height: 100,
          layers: [],
          fog: { mapId: "m1", enabled: true },
          soundscape: { areas: [area(points)] },
        },
      ],
      placements: [],
    });
    return runScan("check-fog-safety.ts", [site, "--config", config]);
  };
  return assertCleanThenDirty(
    "Sound-only area under fog",
    "check-fog-safety.ts",
    () =>
      plant("sound-fog-clean", [
        [10, 10],
        [40, 10],
        [40, 40],
      ]),
    () => {
      const r = plant("sound-fog-dirty", [
        [10, 10],
        [90, 10],
        [40, 40],
      ]);
      return r.code === 21 || r.code < 0 ? r : { code: 0, stderr: r.stderr };
    },
  );
}

// ---- Variant 5: corrupted player atlas shape (check-artifact-shape) ---------
function variantShape(): VariantResult {
  const atlas = readPlayerAtlas();
  return assertCleanThenDirty(
    "Atlas shape violation",
    "check-artifact-shape.ts",
    () => {
      const dir = freshDir("shape-clean");
      const file = path.join(dir, "atlas.json");
      fs.writeFileSync(file, JSON.stringify(atlas));
      return runScan("check-artifact-shape.ts", [file]);
    },
    () => {
      const dir = freshDir("shape-dirty");
      const file = path.join(dir, "atlas.json");
      const dirty = readPlayerAtlas();
      const entities = Array.isArray(dirty.entities) ? (dirty.entities as unknown[]) : [];
      // A DM-only entity with a leaked source path: two independent violations
      // (visibility not player-visible, sourcePath present).
      entities.push({ id: "smoke-bad-entity", visibility: "dm", sourcePath: "content/secret.md" });
      dirty.entities = entities;
      fs.writeFileSync(file, JSON.stringify(dirty));
      return runScan("check-artifact-shape.ts", [file]);
    },
  );
}

// ---- Variants 6a/6b: what check-player-secrets guards, one fault each -------
/** Clean = the real atlas in the built-site layout; dirty = it plus one planted entity. */
function variantPlayerSecret(name: string, plant: Record<string, unknown>): VariantResult {
  const atlas = readPlayerAtlas();
  return assertCleanThenDirty(
    name,
    "check-player-secrets.ts",
    () => {
      const dir = freshDir("player-secret-clean");
      writeBuiltSite(dir, atlas);
      return runScan("check-player-secrets.ts", [dir]);
    },
    () => {
      const dir = freshDir("player-secret-dirty");
      const dirty = readPlayerAtlas();
      const entities = Array.isArray(dirty.entities) ? (dirty.entities as unknown[]) : [];
      entities.push(plant);
      dirty.entities = entities;
      writeBuiltSite(dir, dirty);
      return runScan("check-player-secrets.ts", [dir]);
    },
  );
}

// ---- Variant 7: a DM file in the built atlas dir (check-player-files) ------
function variantPlayerFiles(): VariantResult {
  const plant = (label: string, extra?: string) => {
    const dir = freshDir(label);
    fs.mkdirSync(path.join(dir, "atlas", "assets", "maps"), { recursive: true });
    fs.writeFileSync(path.join(dir, "atlas", "atlas.json"), "{}");
    if (extra) fs.writeFileSync(path.join(dir, "atlas", "assets", "maps", extra), "fog: {}");
    return runScan("check-player-files.ts", [dir]);
  };
  return assertCleanThenDirty(
    "DM file in player build",
    "check-player-files.ts",
    () => plant("player-files-clean"),
    () => plant("player-files-dirty", "world.yaml"),
  );
}

// ---- Variant 8: a synced vault note in content/ (check-vault-content) -----
function variantVaultContent(): VariantResult {
  const plant = (label: string, withSyncMap: boolean) => {
    const root = freshDir(label);
    fs.writeFileSync(
      path.join(root, "atlas.config.json"),
      JSON.stringify({ contentRoot: "content", hosting: "public" }),
    );
    fs.mkdirSync(path.join(root, "content", "w"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "content", "w", "smoke.md"),
      "---\ntitle: Smoke\natlas:\n  id: smoke-vault-note\n---\nFrom the vault.\n",
    );
    if (withSyncMap) {
      fs.mkdirSync(path.join(root, ".local-atlas"));
      fs.writeFileSync(
        path.join(root, ".local-atlas", "sync-map.json"),
        JSON.stringify({ "03_Entities/Smoke.md": { id: "smoke-vault-note", baseType: "npc" } }),
      );
    }
    return runScan("check-vault-content.ts", ["--root", root]);
  };
  return assertCleanThenDirty(
    "Synced vault note while hosting is public",
    "check-vault-content.ts",
    () => plant("vault-content-clean", false),
    () => plant("vault-content-dirty", true),
  );
}

// ---- Variants: one campaign's output against its must-not-ship file ---------
// (check-campaign-isolation, R-17b). A hand-made clean store for campaign `a`
// of the campaign-isolation fixture, with the must-not-ship file the build
// would write for it (the scan recomputes it from the content and fails on any
// difference). Each variant plants one sentinel
// and must fail with the exit code for its kind (23 structure, 24 text, 25
// assets), so a fault caught only by accident doesn't count.
const ISOLATION_CONTENT = path.join(
  PROJECT_ROOT,
  "src",
  "test",
  "fixtures",
  "campaign-isolation",
  "content",
);
const ISOLATION_MAP = "assets/maps/0123456789abcdef.png";

type IsolationOutput = {
  atlas: Record<string, unknown> & {
    campaign: Record<string, unknown>;
    maps: Record<string, unknown>[];
    ocean: { onOcean: Record<string, unknown>[] };
    entities: Record<string, unknown>[];
  };
  index: Record<string, unknown>[];
  /** Extra files in the store, relative to its atlas dir. */
  extra: string[];
};

function cleanIsolationOutput(): IsolationOutput {
  return {
    atlas: {
      version: "1",
      schemaVersion: 2,
      worlds: [{ id: "vale", name: "The Vale", defaultMapId: "vale-overview" }],
      ocean: { onOcean: [{ map: "vale-overview", x: 0, y: 0, scale: 1, rotation: 0 }] },
      campaign: { id: "a", name: "Campaign A" },
      maps: [
        {
          id: "vale-overview",
          worldId: "vale",
          name: "Vale",
          width: 100,
          height: 100,
          layers: [{ id: "base", src: `atlas/${ISOLATION_MAP}` }],
        },
      ],
      entities: [{ id: "inn", title: "Inn", type: "location", world: "vale", body: "An inn." }],
      placements: [
        { id: "inn@vale-overview", entityId: "inn", mapId: "vale-overview", label: "Inn" },
      ],
    },
    index: [{ id: "inn", title: "Inn", type: "location", excerpt: "An inn.", bodyText: "An inn." }],
    extra: [],
  };
}

type IsolationMustNotShip = {
  campaign: string;
  ids: string[];
  names: string[];
  paths: string[];
  pinLocations: { map: string; index: number; x: number; y: number }[];
  otherCampaigns: { id: string; name: string }[];
};

/** What the build writes for campaign `a` of the fixture. */
function cleanIsolationMustNotShip(): IsolationMustNotShip {
  return {
    campaign: "a",
    ids: [
      "base-cellar",
      "c1",
      "chart",
      "fen",
      "fen-reach",
      "gloomharbour-vault",
      "hookhaven",
      "severine",
    ],
    names: ["Bog", "Fen", "Fen Reach", "Gloomharbour Vault", "Hookhaven", "S\u00e9verine"],
    paths: ["images/c1.png", "images/hookhaven-chart.png"],
    pinLocations: [{ map: "vale-overview", index: 1, x: 500, y: 600 }],
    otherCampaigns: [{ id: "main", name: "Lantern Road" }],
  };
}

function variantIsolation(
  name: string,
  wantExit: number,
  plant: (o: IsolationOutput, mns: IsolationMustNotShip) => void,
): VariantResult {
  const run = (label: string, dirty: boolean) => {
    const root = freshDir(label);
    fs.cpSync(ISOLATION_CONTENT, path.join(root, "content"), { recursive: true });
    const config = path.join(root, "atlas.config.json");
    fs.writeFileSync(
      config,
      JSON.stringify({
        contentRoot: "content",
        outputDir: ".atlas-campaigns",
        defaultWorld: "vale",
        include: ["**/*.md"],
        exclude: [],
      }),
    );
    const out = cleanIsolationOutput();
    const mnsData = cleanIsolationMustNotShip();
    if (dirty) plant(out, mnsData);
    const store = path.join(root, ".atlas-campaigns", "a", "atlas");
    for (const rel of [ISOLATION_MAP, ...out.extra]) {
      fs.mkdirSync(path.dirname(path.join(store, rel)), { recursive: true });
      fs.writeFileSync(path.join(store, rel), "img");
    }
    fs.writeFileSync(path.join(store, "atlas.json"), JSON.stringify(out.atlas));
    fs.writeFileSync(path.join(store, "search-index.json"), JSON.stringify(out.index));
    const mns = path.join(root, ".atlas-campaigns", "a", "must-not-ship.json");
    fs.writeFileSync(mns, JSON.stringify(mnsData));
    const args = [store, "--must-not-ship", mns, "--config", config, "--layout", "store"];
    return runScan("check-campaign-isolation.ts", args);
  };
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return assertCleanThenDirty(
    name,
    "check-campaign-isolation.ts",
    () => run(`${slug}-clean`, false),
    () => {
      const r = run(`${slug}-dirty`, true);
      return r.code === wantExit || r.code < 0 ? r : { code: 0, stderr: r.stderr };
    },
  );
}

function variantsIsolation(): VariantResult[] {
  return [
    variantIsolation("Another campaign's id in the campaign field", 23, (o) => {
      o.atlas.campaign = { id: "main", name: "Campaign A" };
    }),
    variantIsolation("Hidden short map id in maps", 23, (o) => {
      o.atlas.maps.push({ ...o.atlas.maps[0], id: "c1", name: "Chart" });
    }),
    variantIsolation("Hidden world id in the ocean", 23, (o) => {
      o.atlas.ocean.onOcean.push({ map: "fen", x: 1, y: 1, scale: 1, rotation: 0 });
    }),
    variantIsolation("Entity whose world isn't shipped", 23, (o) => {
      o.atlas.entities.push({ id: "hut", title: "Hut", type: "location", world: "moor" });
    }),
    variantIsolation("Hidden long name in the search index", 24, (o) => {
      o.index[0].bodyText = "The road to Gloomharbour Vault.";
    }),
    variantIsolation("Unreferenced image in the store", 25, (o) => {
      o.extra.push("assets/maps/fedcba9876543210.png");
    }),
    variantIsolation("Placement at a dropped pin's location", 23, (o) => {
      (o.atlas.placements as Record<string, unknown>[]).push({
        id: "inn@vale-overview#2",
        entityId: "inn",
        mapId: "vale-overview",
        x: 500,
        y: 600,
        label: "Inn",
      });
    }),
    variantIsolation("Emptied must-not-ship file with a hidden note", 23, (o, mns) => {
      mns.ids = [];
      mns.names = [];
      o.atlas.entities.push({
        id: "gloomharbour-vault",
        title: "Gloomharbour Vault",
        type: "location",
        world: "vale",
      });
    }),
  ];
}

async function main(): Promise<number> {
  if (!fs.existsSync(PLAYER_ATLAS)) {
    console.error(
      `publish-integrity-smoke: ${path.relative(PROJECT_ROOT, PLAYER_ATLAS)} not found.\n` +
        "Run `npm run atlas:build:player` (or `npm run atlas:publish`) first.",
    );
    return 1;
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`publish-integrity-smoke: atlas.config.json not found at ${CONFIG_PATH}`);
    return 1;
  }

  console.log(
    "publish-integrity-smoke: planting faults and confirming every scan still rejects them\n",
  );

  const results: VariantResult[] = [];
  results.push(variantSecret());
  results.push(variantDerived());
  results.push(await variantExif());
  results.push(variantFog());
  results.push(variantSoundFog());
  results.push(variantShape());
  results.push(
    variantPlayerSecret("Forbidden field on a player secret", {
      id: "smoke-entity",
      secrets: [{ id: "s", reveal: "SMOKE_PLAINTEXT" }],
    }),
  );
  results.push(
    variantPlayerSecret("Unstripped secret marker", {
      id: "smoke-entity",
      body: "{{secret:SMOKE_TEST_SECRET}}",
    }),
  );
  results.push(variantPlayerFiles());
  results.push(variantVaultContent());
  results.push(...variantsIsolation());

  const pad = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const tag = r.outcome === "PASS" ? "OK  " : r.outcome === "SKIP" ? "SKIP" : "FAIL";
    console.log(`  [${tag}] ${r.name.padEnd(pad)}  (${r.scan})`);
    if (r.outcome !== "PASS") console.log(`         ${r.detail.replace(/\n/g, "\n         ")}`);
  }

  const failed = results.filter((r) => r.outcome === "FAIL" || r.outcome === "ERROR");
  const skipped = results.filter((r) => r.outcome === "SKIP");
  console.log("");
  if (failed.length > 0) {
    console.error(
      `publish-integrity-smoke: ${failed.length} scan(s) failed to reject their fault — ` +
        "publish would ship a leak. NOT safe to optimize.",
    );
    return 1;
  }
  console.log(
    `publish-integrity-smoke: all ${results.length - skipped.length} active scan(s) caught their fault` +
      (skipped.length > 0 ? ` (${skipped.length} skipped — no such content in vault)` : "") +
      ". Safe.",
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("publish-integrity-smoke: crashed", e);
    process.exit(1);
  });
