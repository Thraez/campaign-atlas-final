/**
 * Fog safety scanner.
 *
 * Independent re-check of player artifacts (atlas.json + asset PNGs) against
 * the source world.yaml's fog geometry. Complements the build-time enforcement
 * by re-deriving the boundary and asserting five invariants:
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
 * Usage:
 *   tsx scripts/check-fog-safety.ts <artifact-dir> [--config atlas.config.json]
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
 *       configless run and still exits 0.) Also a fog layer whose redacted
 *       `.fog.png` is not in the artifact (the alpha check cannot run on it),
 *       or a built site (`layout: "built-site"`) with no `atlas/atlas.json`.
 *   21  SOUND-IN-FOG (21, not 18: check-player-files already exits 18)
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { IMAGE_EXTENSIONS } from "./atlas/assetRefs";
import { loadWorldConfig } from "./atlas/loadWorldConfig";
import { locatePlayerAtlas, resolveAssetFile, type ArtifactLayout } from "./atlas/playerArtifact";
import { isLit } from "../src/atlas/fog/effectiveLit";
import { areaUnderFog, pathUnderFog } from "../src/atlas/content/resolveCampaign";
import type { FogOverlay, Point } from "../src/atlas/content/schema";

interface Args {
  target: string;
  config: string;
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
  fog?: PlayerFogObject;
  soundscape?: { areas?: Array<{ regionId?: string; points?: Point[] }> };
}

interface PlayerAtlas {
  maps: PlayerMap[];
  placements?: Array<{ entityId: string; mapId: string; x: number; y: number }>;
}

interface AtlasConfig {
  contentRoot: string;
  defaultWorld: string;
}

function parseArgs(argv: string[]): Args | null {
  const target = argv[0];
  if (!target) return null;
  // Optional --config flag, defaults to atlas.config.json
  let config = "atlas.config.json";
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--config") config = argv[++i];
    else if (argv[i].startsWith("--config=")) config = argv[i].slice("--config=".length);
  }
  return { target, config };
}

export interface RunOpts {
  dir: string;
  config?: string;
  /** Where atlas.json must be; inferred when absent (a run by hand). */
  layout?: ArtifactLayout;
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

  // Load source fog geometry from world config.
  // loadWorldConfig(contentRoot, worldId) — we derive these from atlas.config.json.
  const configAbs = path.resolve(process.cwd(), args.config);
  let sourceFogs: FogOverlay[] = [];
  // Distinguish "config present but FAILED to load" (a verification gap we must
  // not paper over) from "config absent" (a legitimate configless run) and from
  // "world.yaml absent" (loadWorldConfig returns null without throwing). Only a
  // genuine load failure — a thrown WorldConfigError — sets this.
  let configLoadFailed = false;

  if (fs.existsSync(configAbs)) {
    try {
      const atlasConfig: AtlasConfig = JSON.parse(fs.readFileSync(configAbs, "utf8"));
      const contentRoot = path.resolve(path.dirname(configAbs), atlasConfig.contentRoot);
      const worldId = atlasConfig.defaultWorld;
      const worldCfg = loadWorldConfig(contentRoot, worldId);
      if (worldCfg) {
        sourceFogs = worldCfg.fogs as FogOverlay[];
      }
    } catch (e) {
      configLoadFailed = true;
      console.error(
        `atlas:check-fog-safety: failed to load source world config — in-fog-content + alpha-leak checks could not run`,
        e,
      );
    }
  }

  const sourceFogByMapId = new Map(sourceFogs.map((f) => [f.mapId, f]));
  const findings: Finding[] = [];
  const fogMaps = (atlas.maps ?? []).filter((m) => m.fog?.enabled);

  // ----- 14 GEOMETRY-LEAK -----
  for (const m of fogMaps) {
    const fog = m.fog!;
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
  const geometryUnverified = configLoadFailed && fogMaps.length > 0;
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
  return run({ dir: args.target, config: args.config });
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
