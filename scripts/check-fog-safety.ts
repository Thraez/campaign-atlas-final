/**
 * Fog safety scanner.
 *
 * Independent re-check of player artifacts (atlas.json + asset PNGs) against
 * the source world.yaml's fog geometry. Complements the build-time enforcement
 * by re-deriving the boundary and asserting these invariants:
 *
 *   13  IMAGE-LEAK    original layer image referenced by the player atlas, or
 *                     (built site only) shipped beside its redacted one
 *   14  GEOMETRY-LEAK fog geometry not stripped from player atlas
 *   15  IN-FOG-CONTENT player pin inside fog, or any part of a region's area or
 *                     a route's path inside fog, per source geometry
 *   16  ALPHA-LEAK    redacted PNG opaque at a known-fogged location
 *   21  SOUND-IN-FOG  shipped sound-only area (no regionId) with any part of its
 *                     area inside fog per source geometry, fog between lit
 *                     corners included (arch-02; ride-on areas follow their
 *                     region, which 15 checks)
 *
 * "Inside fog" means outside every reveal or inside a fog shape (`conceals`),
 * which loadWorldConfig carries through (R-07b).
 *
 * The artifact dir is the built site (`dist`, atlas.json in `dist/atlas/`) or
 * the source store (`public/atlas`); see `atlas/playerArtifact.ts`. The scan
 * registry passes which one; run by hand, it is inferred. The store
 * keeps each original map beside its redacted one (the build reads it there and
 * the player build prunes it), so the "original beside redacted" check runs on
 * the built site only.
 *
 * The source is read through `loadAtlasModel` for v1 and v2 alike (R-18):
 * v1 is one campaign, `main`; for v2 the fog is the campaign file's
 * (`campaignFog`, the resolver's own reading). The campaign is `--campaign`
 * (the scan registry passes it) or else the one the player atlas.json names;
 * the two disagreeing is 17. The checks are driven by the source, not the
 * output: a map fogged in source must ship its fog marker (26), and on v2
 * every file under the artifact dir is hashed against the fogged maps'
 * original images (13) and the images of maps hidden under fog by ADR-0004
 * rule 4 (a child whose frame is under fog, and its subtree); those maps'
 * ids must not appear in maps, placements, the ocean or a world's default
 * map (15). No world is picked from the config's default (R-13).
 *
 * `--publish` (the scan registry sets it): the source must load, fog maps in
 * the output or not; a missing config or content root is 17, not a
 * configless run.
 *
 * Usage:
 *   tsx scripts/check-fog-safety.ts <artifact-dir> [--config atlas.config.json] [--campaign <id>] [--publish]
 *
 * Exit codes:
 *   0   clean
 *   1   bad invocation
 *   13  IMAGE-LEAK
 *   14  GEOMETRY-LEAK
 *   15  IN-FOG-CONTENT
 *   16  ALPHA-LEAK
 *   17  COULD-NOT-VERIFY-GEOMETRY — a source world config was present but failed
 *       to load, so the geometry-dependent checks (15, 16, 21) never ran and the
 *       fog maps cannot be certified. (Config *absent* is a legitimate
 *       configless run and exits 0, outside `--publish`.) Also a fog layer whose redacted
 *       `.fog.png` is not in the artifact (the alpha check cannot run on it),
 *       or a built site (`layout: "built-site"`) with no `atlas/atlas.json`.
 *   21  SOUND-IN-FOG (21, not 18: check-player-files already exits 18)
 *   26  FOG-MARKER-MISSING a map fogged in source ships without `fog.enabled`
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { IMAGE_EXTENSIONS } from "./atlas/assetRefs";
import { locatePlayerAtlas, resolveAssetFile, type ArtifactLayout } from "./atlas/playerArtifact";
import { isLit } from "../src/atlas/fog/effectiveLit";
import {
  areaUnderFog,
  campaignFog,
  frameQuads,
  frameUnderFog,
  pathUnderFog,
} from "../src/atlas/content/resolveCampaign";
import { loadAtlasModel, type LoadAtlasModelConfig } from "./atlas/loadAtlasModel";
import { V1_CAMPAIGN_ID } from "../src/atlas/content/v1Model";
import type { FogOverlay, Point } from "../src/atlas/content/schema";

interface Args {
  target: string;
  config: string;
  campaign?: string;
  publish?: boolean;
}

interface Finding {
  code: number;
  message: string;
}

interface PlayerFogObject {
  mapId: string;
  enabled: boolean;
  reveals?: unknown;
  conceals?: unknown;
  featherPx?: unknown;
  color?: unknown;
}

interface PlayerLayer {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tileSrc?: string;
}

interface PlayerMap {
  id: string;
  width: number;
  height: number;
  layers: PlayerLayer[];
  regions?: Array<{ id: string; points: Point[] }>;
  routes?: Array<{ id: string; resolvedPoints?: Point[] }>;
  parent?: string;
  fog?: PlayerFogObject;
  soundscape?: { areas?: Array<{ regionId?: string; points?: Point[] }> };
}

interface PlayerAtlas {
  maps: PlayerMap[];
  /** v2 player builds: the campaign the artifact is (R-17). */
  campaign?: { id?: unknown };
  placements?: Array<{ entityId: string; mapId: string; x: number; y: number }>;
  ocean?: { onOcean?: Array<{ map?: unknown }> };
  worlds?: Array<{ id?: unknown; defaultMapId?: unknown }>;
}

/**
 * `atlas.config.json` as the scan reads it: the loader's config (the v1
 * world and the note globs) with the globs optional, plus `contentRoot`.
 */
type AtlasConfig = Omit<LoadAtlasModelConfig, "include" | "exclude"> & {
  contentRoot: string;
  include?: string[];
  exclude?: string[];
};

/** v2 content with no campaign given or named (the legacy `dist`/`public/atlas` pair). */
class NoCampaignError extends Error {}

/** What the source says the artifact's campaign must honour. */
interface SourceFog {
  v2: boolean;
  /** The campaign's fog per source map, for every map fogged in it. */
  fogs: Map<string, FogOverlay>;
  /** Source-relative path to each fogged map's layer images (v2: to compare bytes). */
  foggedImages: Array<{ map: string; file: string }>;
  /** v2: maps whose frame is under the parent's fog, and their subtrees (rule 4). */
  fogHidden: Set<string>;
  /** v2: the image files of the fog-hidden maps. */
  fogHiddenImages: Array<{ map: string; file: string }>;
}

/**
 * The artifact's campaign and its fog, loaded through the one loader (v1 too:
 * its one campaign `main` has the world.yaml fog). v2: the campaign is the
 * one given (the scan registry passes it) or the one the artifact names;
 * they must agree. Throws when the campaign can't be told or isn't in the
 * content, so the geometry checks count as not run (17).
 */
function loadSourceFog(
  cfg: AtlasConfig,
  root: string,
  contentRoot: string,
  atlas: PlayerAtlas,
  given: string | undefined,
): SourceFog {
  const v2 = fs.existsSync(path.join(contentRoot, "_atlas", "atlas.yaml"));
  const named = typeof atlas.campaign?.id === "string" ? atlas.campaign.id : undefined;
  if (given !== undefined && named !== undefined && given !== named) {
    throw new Error(`the artifact is campaign "${named}", not "${given}"`);
  }
  const id = v2 ? (given ?? named) : V1_CAMPAIGN_ID;
  if (id === undefined) {
    throw new NoCampaignError("schema v2 content, but no campaign is given or named");
  }
  if (!v2 && (given ?? named ?? id) !== id) {
    throw new Error(`v1 content has one campaign, "${id}", not "${given ?? named}"`);
  }
  const { model } = loadAtlasModel(
    contentRoot,
    { ...cfg, include: cfg.include ?? [], exclude: cfg.exclude ?? [] },
    { root },
  );
  const campaign = model.campaigns.find((c) => c.id === id);
  if (!campaign) throw new Error(`campaign "${id}" is not in the content`);

  const maps = model.worlds.flatMap((w) =>
    w.maps.map((m) => ({ map: m, assetDir: path.join(contentRoot, w.world.id, "_atlas") })),
  );
  const fogs = new Map<string, FogOverlay>();
  for (const { map } of maps) {
    const fog = campaignFog(map.id, campaign);
    if (fog) fogs.set(map.id, fog);
  }
  const imagesOf = (ids: Set<string>) =>
    maps.flatMap(({ map, assetDir }) =>
      ids.has(map.id)
        ? map.layers.flatMap((l) =>
            l.src && !/^(https?:|data:|blob:)/i.test(l.src)
              ? [{ map: map.id, file: path.resolve(assetDir, l.src) }]
              : [],
          )
        : [],
    );

  const fogHidden = new Set<string>();
  if (v2) {
    // Rule 4 from source: a frame with any part under the parent's fog, then
    // every map below it, until nothing more is added.
    for (const { map } of maps) {
      if (map.parent === undefined || !map.frame) continue;
      const quads = frameQuads(map.frame);
      const parentFog = fogs.get(map.parent) ?? null;
      if (quads?.some((q) => frameUnderFog(q, parentFog))) fogHidden.add(map.id);
    }
    for (let grew = true; grew;) {
      grew = false;
      for (const { map } of maps) {
        if (map.parent !== undefined && fogHidden.has(map.parent) && !fogHidden.has(map.id)) {
          fogHidden.add(map.id);
          grew = true;
        }
      }
    }
  }
  return {
    v2,
    fogs,
    foggedImages: v2 ? imagesOf(new Set(fogs.keys())) : [],
    fogHidden,
    fogHiddenImages: imagesOf(fogHidden),
  };
}

function parseArgs(argv: string[]): Args | null {
  const target = argv[0];
  if (!target) return null;
  // Optional --config flag, defaults to atlas.config.json
  let config = "atlas.config.json";
  let campaign: string | undefined;
  let publish = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--config") config = argv[++i];
    else if (argv[i].startsWith("--config=")) config = argv[i].slice("--config=".length);
    else if (argv[i] === "--campaign") campaign = argv[++i];
    else if (argv[i].startsWith("--campaign=")) campaign = argv[i].slice("--campaign=".length);
    else if (argv[i] === "--publish") publish = true;
  }
  return { target, config, ...(campaign ? { campaign } : {}), ...(publish ? { publish } : {}) };
}

export interface RunOpts {
  dir: string;
  config?: string;
  /** Where atlas.json must be; inferred when absent (a run by hand). */
  layout?: ArtifactLayout;
  /** v2 content: the campaign whose fog the artifact must honour (R-17). */
  campaign?: string;
  /**
   * The publish chain (the scan registry): the source fog must be read, so a
   * missing or broken config, content or campaign file is 17 even when the
   * artifact has no fog map (R-18).
   */
  publish?: boolean;
}

const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

/** Every file under `dir`, symlinks not followed. */
function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : e.isFile() ? [p] : [];
  });
}

export async function run(opts: RunOpts): Promise<number> {
  const configPath = opts.config ?? "atlas.config.json";
  const args: Args = { target: opts.dir, config: configPath };

  const targetAbs = path.resolve(process.cwd(), args.target);
  if (!fs.existsSync(targetAbs)) {
    console.log(`atlas:check-fog-safety: ${args.target} does not exist — skipping`);
    return 0;
  }

  const located = locatePlayerAtlas(targetAbs, opts.layout);
  if (!located) {
    if (opts.layout === "built-site") {
      console.error(
        `atlas:check-fog-safety: ${args.target} has no atlas/atlas.json — the built site cannot be checked`,
      );
      return 17;
    }
    console.log(`atlas:check-fog-safety: no atlas.json in ${args.target} — skipping`);
    return 0;
  }
  const { atlasDir } = located;
  const builtSite = located.layout === "built-site";

  const atlas: PlayerAtlas = JSON.parse(fs.readFileSync(located.atlasJson, "utf8"));

  // The source fog, read through the loader (v1 and v2). Config absent is a
  // legitimate configless run, except in the publish chain; a config that
  // fails to load is a verification gap we must not paper over.
  const configAbs = path.resolve(process.cwd(), args.config);
  let source: SourceFog | null = null;
  let configLoadFailed = false;
  let noCampaign = false;
  if (fs.existsSync(configAbs)) {
    try {
      const atlasConfig: AtlasConfig = JSON.parse(fs.readFileSync(configAbs, "utf8"));
      const contentRoot = path.resolve(path.dirname(configAbs), atlasConfig.contentRoot);
      // No content at all is a configless run too, outside the publish chain.
      if (opts.publish || fs.existsSync(contentRoot)) {
        source = loadSourceFog(
          atlasConfig,
          path.dirname(configAbs),
          contentRoot,
          atlas,
          opts.campaign,
        );
      }
    } catch (e) {
      configLoadFailed = true;
      noCampaign = e instanceof NoCampaignError;
      console.error(
        `atlas:check-fog-safety: failed to load the source fog — the source-driven checks could not run`,
        e,
      );
    }
  } else if (opts.publish) {
    configLoadFailed = true;
    console.error(
      `atlas:check-fog-safety: ${args.config} not found — the source fog can't be read`,
    );
  }

  const sourceFogByMapId = source?.fogs ?? new Map<string, FogOverlay>();
  const findings: Finding[] = [];
  const outputMaps = atlas.maps ?? [];

  // ----- 26 FOG-MARKER-MISSING -----
  // A map fogged in the campaign that ships without its fog marker shipped
  // unredacted (or the marker was dropped after the bake).
  for (const m of outputMaps) {
    if (sourceFogByMapId.has(m.id) && !m.fog?.enabled) {
      findings.push({
        code: 26,
        message: `map "${m.id}" is fogged in the source but ships without its fog marker`,
      });
    }
  }
  const fogMaps = outputMaps.filter((m) => m.fog?.enabled || sourceFogByMapId.has(m.id));

  // ----- 14 GEOMETRY-LEAK -----
  for (const m of fogMaps) {
    const fog = m.fog;
    if (!fog) continue;
    if (fog.reveals !== undefined) {
      findings.push({ code: 14, message: `map "${m.id}" player atlas.fog.reveals not stripped` });
    }
    if (fog.conceals !== undefined) {
      findings.push({ code: 14, message: `map "${m.id}" player atlas.fog.conceals not stripped` });
    }
    if (fog.featherPx !== undefined) {
      findings.push({ code: 14, message: `map "${m.id}" player atlas.fog.featherPx not stripped` });
    }
    if (fog.color !== undefined) {
      findings.push({ code: 14, message: `map "${m.id}" player atlas.fog.color not stripped` });
    }
  }

  // ----- 13 IMAGE-LEAK -----
  for (const m of fogMaps) {
    for (const layer of m.layers) {
      if (layer.tileSrc) {
        findings.push({
          code: 13,
          message: `map "${m.id}" layer "${layer.id}" is tiled on a fog-enabled map (must not ship)`,
        });
        continue;
      }
      if (!layer.src.endsWith(".fog.png")) {
        findings.push({
          code: 13,
          message: `map "${m.id}" layer "${layer.id}" src "${layer.src}" is not a redacted (.fog.png) file`,
        });
        continue;
      }
      const redacted = resolveAssetFile(atlasDir, layer.src);
      if (!redacted || !fs.existsSync(redacted)) {
        findings.push({
          code: 17,
          message: `map "${m.id}" layer "${layer.id}" redacted "${layer.src}" is not in the artifact — alpha check cannot run`,
        });
        continue;
      }
      // The original (any image type) must not ship beside the redacted one.
      if (!builtSite) continue;
      const base = redacted.slice(0, -".fog.png".length);
      for (const ext of IMAGE_EXTENSIONS) {
        if (fs.existsSync(base + ext)) {
          findings.push({
            code: 13,
            message: `map "${m.id}" original "${path.relative(targetAbs, base + ext)}" still present in artifact dir alongside redacted`,
          });
        }
      }
    }
  }

  // v2: the unfogged original of a map fogged in this campaign, or the image
  // of a map rule 4 hides, must not be in the artifact under any name.
  if (source?.v2) {
    const shipped = new Map<string, string>();
    for (const f of filesUnder(targetAbs)) shipped.set(sha256(fs.readFileSync(f)), f);
    const check = (list: SourceFog["foggedImages"], what: string) => {
      for (const { map, file } of list) {
        let bytes: Buffer;
        try {
          bytes = fs.readFileSync(file);
        } catch {
          findings.push({
            code: 17,
            message: `map "${map}": source image "${file}" can't be read, so the artifact can't be checked for it`,
          });
          continue;
        }
        const hit = shipped.get(sha256(bytes));
        if (hit) {
          findings.push({
            code: 13,
            message: `map "${map}" (${what}): its source image ships as "${path.relative(targetAbs, hit)}"`,
          });
        }
      }
    };
    check(source.foggedImages, "fogged in this campaign");
    check(source.fogHiddenImages, "its frame is under the parent's fog");
  }

  // ----- 15 rule 4: a map whose frame is under its parent's fog, and its subtree -----
  if (source && source.fogHidden.size > 0) {
    const hidden = source.fogHidden;
    for (const m of outputMaps) {
      if (hidden.has(m.id) || (m.parent !== undefined && hidden.has(m.parent))) {
        findings.push({
          code: 15,
          message: `map "${m.id}" ships, but its frame (or an ancestor's) is under the parent's fog`,
        });
      }
    }
    for (const p of atlas.placements ?? []) {
      if (hidden.has(p.mapId)) {
        findings.push({
          code: 15,
          message: `placement "${p.entityId}" is on map "${p.mapId}", whose frame is under the parent's fog`,
        });
      }
    }
    for (const o of atlas.ocean?.onOcean ?? []) {
      if (typeof o.map === "string" && hidden.has(o.map)) {
        findings.push({ code: 15, message: `the ocean places map "${o.map}", hidden by fog` });
      }
    }
    for (const w of atlas.worlds ?? []) {
      if (typeof w.defaultMapId === "string" && hidden.has(w.defaultMapId)) {
        findings.push({
          code: 15,
          message: `world "${String(w.id)}" opens on map "${w.defaultMapId}", hidden by fog`,
        });
      }
    }
  }

  // ----- 15 IN-FOG-CONTENT (requires source fog) -----
  for (const m of fogMaps) {
    const srcFog = sourceFogByMapId.get(m.id);
    if (!srcFog || !srcFog.enabled) continue;

    // Check placements
    for (const p of atlas.placements ?? []) {
      if (p.mapId !== m.id) continue;
      if (!isLit(p.x, p.y, srcFog)) {
        findings.push({
          code: 15,
          message: `placement "${p.entityId}" on map "${m.id}" at (${p.x},${p.y}) is inside fog by source geometry`,
        });
      }
    }

    // Regions: the whole area, fog between lit vertices included.
    for (const r of m.regions ?? []) {
      if (areaUnderFog(r.points, srcFog)) {
        findings.push({
          code: 15,
          message: `region "${r.id}" on map "${m.id}" has part of its area inside fog by source geometry`,
        });
      }
    }

    // Routes: the whole resolved path, a fog gap between lit points included.
    for (const t of m.routes ?? []) {
      if (t.resolvedPoints && pathUnderFog(t.resolvedPoints, srcFog)) {
        findings.push({
          code: 15,
          message: `route "${t.id}" on map "${m.id}" has part of its path inside fog by source geometry`,
        });
      }
    }
  }

  // ----- 21 SOUND-IN-FOG (requires source fog) -----
  // A sound-only area plays wherever its own polygon is; any part of it under
  // fog tells players what's there, so its whole area is tested, not only its
  // points. Shipped ids are positional (area-N).
  for (const m of fogMaps) {
    const srcFog = sourceFogByMapId.get(m.id);
    if (!srcFog || !srcFog.enabled) continue;
    (m.soundscape?.areas ?? []).forEach((a, i) => {
      if (a.regionId) return;
      if (areaUnderFog(a.points, srcFog)) {
        findings.push({
          code: 21,
          message: `sound area #${i} on map "${m.id}" has part of its area inside fog by source geometry`,
        });
      }
    });
  }

  // ----- 16 ALPHA-LEAK (requires source fog + sharp; samples a known-fogged corner) -----
  for (const m of fogMaps) {
    const srcFog = sourceFogByMapId.get(m.id);
    if (!srcFog || !srcFog.enabled) continue;

    // Find a corner of the map that is NOT lit (fogged).
    // Typical reveals don't cover the entire map edge, so a corner is usually fogged.
    const probe: Array<[number, number]> = [
      [0, 0],
      [m.width - 1, 0],
      [0, m.height - 1],
      [m.width - 1, m.height - 1],
    ];
    const foggedPoint = probe.find(([x, y]) => !isLit(x, y, srcFog));
    if (!foggedPoint) continue; // no known-fogged corner — skip alpha check

    for (const layer of m.layers) {
      if (!layer.src.endsWith(".fog.png")) continue; // already flagged by check 13
      const layerAbs = resolveAssetFile(atlasDir, layer.src);
      if (!layerAbs || !fs.existsSync(layerAbs)) continue; // already flagged (17)

      // Convert map-space fogged point to layer-local coords.
      const lx = foggedPoint[0] - layer.x;
      const ly = foggedPoint[1] - layer.y;
      if (lx < 0 || ly < 0 || lx >= layer.width || ly >= layer.height) continue;

      const buf = fs.readFileSync(layerAbs);
      const { data, info } = await sharp(buf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const idx = (Math.round(ly) * info.width + Math.round(lx)) * info.channels;
      const a = data[idx + 3];

      // Tolerance of 8 accounts for tiny Gaussian feather smear at corners.
      if (a > 8) {
        findings.push({
          code: 16,
          message:
            `layer "${layer.id}" on map "${m.id}" alpha=${a} at known-fogged corner ` +
            `(${foggedPoint[0]},${foggedPoint[1]}) — should be 0`,
        });
      }
    }
  }

  // ----- Report -----
  console.log(
    `atlas:check-fog-safety: scanned ${fogMaps.length} fog-enabled map(s) in ${args.target}`,
  );

  // A config we were handed but could not load means the geometry-dependent
  // checks (IN-FOG-CONTENT, ALPHA-LEAK) never ran for these maps, so we cannot
  // certify them — surface the gap rather than silently reporting "clean".
  // In the publish chain any load failure counts, fog maps in the output or
  // not (a dropped marker would hide them). The legacy pair of a v2 run names
  // no campaign: it keeps the old rule until R-19 retires it.
  const geometryUnverified =
    configLoadFailed && (opts.publish && !noCampaign ? true : fogMaps.length > 0);
  if (geometryUnverified) {
    console.error(
      "atlas:check-fog-safety: source world config failed to load — IN-FOG-CONTENT and " +
        "ALPHA-LEAK checks were SKIPPED; fog maps cannot be certified.",
    );
  }

  if (findings.length > 0) {
    for (const f of findings) {
      console.error(`  [${f.code}] ${f.message}`);
    }
    // A concrete leak outranks the verification gap — return its code.
    return findings[0].code;
  }

  if (geometryUnverified) {
    return 17; // COULD-NOT-VERIFY-GEOMETRY
  }

  console.log("atlas:check-fog-safety: clean");
  return 0;
}

export async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("atlas:check-fog-safety: missing target dir");
    console.error(
      "Usage: tsx scripts/check-fog-safety.ts <artifact-dir> [--config atlas.config.json]",
    );
    return 1;
  }
  return run({
    dir: args.target,
    config: args.config,
    ...(args.campaign ? { campaign: args.campaign } : {}),
    ...(args.publish ? { publish: true } : {}),
  });
}

const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("check-fog-safety.ts") || arg1.endsWith("check-fog-safety.js");
})();

if (invokedAsScript) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error("atlas:check-fog-safety: crashed", e);
      process.exit(1);
    });
}
