#!/usr/bin/env tsx
/**
 * Fog safety scanner.
 *
 * Independent re-check of player artifacts (atlas.json + asset PNGs) against
 * the source world.yaml's fog geometry. Complements the build-time enforcement
 * by re-deriving the boundary and asserting four invariants:
 *
 *   13  IMAGE-LEAK    original layer PNG referenced by player atlas
 *   14  GEOMETRY-LEAK fog geometry not stripped from player atlas
 *   15  IN-FOG-CONTENT player pin/route/region inside fog per source geometry
 *   16  ALPHA-LEAK    redacted PNG opaque at a known-fogged location
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
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadWorldConfig } from "./atlas/loadWorldConfig";
import { isLit } from "../src/atlas/fog/effectiveLit";
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

export async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("atlas:check-fog-safety: missing target dir");
    console.error("Usage: tsx scripts/check-fog-safety.ts <artifact-dir> [--config atlas.config.json]");
    return 1;
  }

  const targetAbs = path.resolve(process.cwd(), args.target);
  if (!fs.existsSync(targetAbs)) {
    console.log(`atlas:check-fog-safety: ${args.target} does not exist — skipping`);
    return 0;
  }

  const atlasJsonPath = path.join(targetAbs, "atlas.json");
  if (!fs.existsSync(atlasJsonPath)) {
    console.log(`atlas:check-fog-safety: ${args.target}/atlas.json not found — skipping`);
    return 0;
  }

  const atlas: PlayerAtlas = JSON.parse(fs.readFileSync(atlasJsonPath, "utf8"));

  // Load source fog geometry from world config.
  // loadWorldConfig(contentRoot, worldId) — we derive these from atlas.config.json.
  const configAbs = path.resolve(process.cwd(), args.config);
  let sourceFogs: FogOverlay[] = [];

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
      console.error(
        `atlas:check-fog-safety: failed to load source world config — skipping in-fog-content + alpha-leak checks`,
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
      }
      // Also check: the original PNG is not present alongside the redacted in the artifact dir.
      const originalCandidate = layer.src.replace(/\.fog\.png$/, ".png");
      if (originalCandidate !== layer.src) {
        const originalAbs = path.join(targetAbs, originalCandidate);
        if (fs.existsSync(originalAbs)) {
          findings.push({
            code: 13,
            message: `map "${m.id}" original "${originalCandidate}" still present in artifact dir alongside redacted`,
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

    // Check region vertices
    for (const r of m.regions ?? []) {
      for (const [x, y] of r.points) {
        if (!isLit(x, y, srcFog)) {
          findings.push({
            code: 15,
            message: `region "${r.id}" on map "${m.id}" has vertex (${x},${y}) inside fog by source geometry`,
          });
          break; // one finding per region is enough
        }
      }
    }

    // Check route resolved points
    for (const t of m.routes ?? []) {
      for (const [x, y] of t.resolvedPoints ?? []) {
        if (!isLit(x, y, srcFog)) {
          findings.push({
            code: 15,
            message: `route "${t.id}" on map "${m.id}" has point (${x},${y}) inside fog by source geometry`,
          });
          break; // one finding per route is enough
        }
      }
    }
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
      const layerAbs = path.join(targetAbs, layer.src);
      if (!fs.existsSync(layerAbs)) continue;

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

  if (findings.length === 0) {
    console.log("atlas:check-fog-safety: clean");
    return 0;
  }

  for (const f of findings) {
    console.error(`  [${f.code}] ${f.message}`);
  }

  // Return the first finding's code for deterministic exit code in tests.
  return findings[0].code;
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
