/**
 * `npm run atlas:tree` (R-16): for each campaign, the ocean and the map tree,
 * with each map's verdict and state, and per map how many pins, regions,
 * routes and sound areas ship (of how many). Read-only: it loads the content
 * root with R-12's loader (`loadAtlasModel`) and asks R-11a's resolver
 * (`resolveCampaign`) per campaign; it decides nothing itself.
 *
 *   npm run atlas:tree                                       # atlas.config.json (content/, v1: one campaign `main`)
 *   npm run atlas:tree -- --config atlas.next.config.json    # the v2 test world (content-next/)
 *
 * DM-facing: it names hidden maps, items and notes. Never write its output
 * into a player artifact.
 *
 * Exit codes: 0 printed; 1 the content doesn't load (each problem printed) or
 * the config can't be read.
 */
import fs from "node:fs";
import path from "node:path";
import { formatIssue, type LoadedAtlasContent } from "../../src/atlas/content/atlasModel";
import {
  resolveCampaign,
  type ItemVerdict,
  type PinVerdict,
  type ShipReason,
} from "../../src/atlas/content/resolveCampaign";
import type {
  CampaignId,
  CampaignNotesMode,
  MapState,
  OceanPlacementV2,
  OceanV2,
} from "../../src/atlas/content/schemaV2";
import { AtlasModelError, loadAtlasModel } from "./loadAtlasModel";

/** How many of a map's items ship to the campaign, of how many it has. */
export interface ItemCount {
  ships: number;
  total: number;
}

export interface TreeMap {
  id: string;
  name: string;
  ships: boolean;
  reason: ShipReason;
  /** The map's state in the campaign file (not listed reads as `unknown`). */
  state: MapState;
  /** Where a top-level map sits on the ocean; absent for child maps and v1. */
  onOcean?: OceanPlacementV2;
  counts: { pins: ItemCount; regions: ItemCount; routes: ItemCount; sound: ItemCount };
  children: TreeMap[];
}

export interface TreeWorld {
  id: string;
  name: string;
  ships: boolean;
  reason: ShipReason;
  /** Top-level maps (and any map whose parent can't be found), each with its subtree. */
  maps: TreeMap[];
}

export interface CampaignTree {
  campaign: CampaignId;
  name: string;
  notesMode: CampaignNotesMode;
  /** `null` for v1 content, which has no ocean. */
  ocean: OceanV2 | null;
  worlds: TreeWorld[];
  /** Ids of the notes that ship, in load order, and how many notes there are. */
  notes: { ships: string[]; total: number };
}

function count(list: readonly (ItemVerdict | PinVerdict)[], map: string): ItemCount {
  const on = list.filter((x) => x.map === map);
  return { ships: on.filter((x) => x.ships).length, total: on.length };
}

/** The tree of every campaign of loaded content, in `atlas.yaml` `campaigns` order. */
export function atlasTree(content: Pick<LoadedAtlasContent, "model" | "notes">): CampaignTree[] {
  const { model, notes } = content;
  return model.campaigns.map((campaign) => {
    const r = resolveCampaign(model, notes, campaign.id);
    const worlds: TreeWorld[] = model.worlds.map((world, wi) => {
      const wv = r.worlds[wi];
      const verdictOf = new Map(
        r.maps.filter((m) => m.world === world.world.id).map((m) => [m.id, m]),
      );
      const ids = new Set(world.maps.map((m) => m.id));
      const visited = new Set<string>();
      const build = (id: string): TreeMap => {
        visited.add(id);
        const map = world.maps.find((m) => m.id === id)!;
        const v = verdictOf.get(id)!;
        const placement = model.onOcean.find((p) => p.map === id);
        return {
          id,
          name: map.name,
          ships: v.ships,
          reason: v.reason,
          state: Object.hasOwn(campaign.maps, id) ? campaign.maps[id].state : "unknown",
          ...(map.parent === undefined && placement ? { onOcean: placement } : {}),
          counts: {
            pins: count(r.pins, id),
            regions: count(r.regions, id),
            routes: count(r.routes, id),
            sound: count(r.sound, id),
          },
          children: world.maps
            .filter((m) => m.parent === id && m.id !== id && !visited.has(m.id))
            .map((m) => build(m.id)),
        };
      };
      const roots = world.maps
        .filter((m) => m.parent === undefined || !ids.has(m.parent))
        .map((m) => build(m.id));
      // A cycle has no root: list what the walk never reached at the top level.
      for (const m of world.maps) if (!visited.has(m.id)) roots.push(build(m.id));
      return {
        id: world.world.id,
        name: world.world.name,
        ships: wv.ships,
        reason: wv.reason,
        maps: roots,
      };
    });
    return {
      campaign: campaign.id,
      name: campaign.name,
      notesMode: campaign.notes,
      ocean: model.ocean,
      worlds,
      notes: { ships: r.notes.filter((n) => n.ships).map((n) => n.id), total: r.notes.length },
    };
  });
}

const verdict = (v: { ships: boolean; reason: ShipReason }) =>
  v.ships ? "ships" : `hidden (${v.reason})`;
const n = (c: ItemCount) => `${c.ships}/${c.total}`;

/** The trees as text: one block per campaign, indented by depth. */
export function formatAtlasTree(trees: readonly CampaignTree[]): string {
  const out: string[] = ["(counts: shipping/total)"];
  for (const t of trees) {
    out.push("", `campaign ${t.campaign} "${t.name}" (notes: ${t.notesMode})`);
    out.push(
      t.ocean
        ? `  ocean ${t.ocean.width}x${t.ocean.height}, sea ${t.ocean.sea}`
        : "  ocean: none (schema v1)",
    );
    for (const w of t.worlds) {
      out.push(`  world ${w.id} "${w.name}": ${verdict(w)}`);
      const walk = (m: TreeMap, depth: number) => {
        const at = m.onOcean ? ` @ ocean (${m.onOcean.x}, ${m.onOcean.y}) x${m.onOcean.scale}` : "";
        const c = m.counts;
        out.push(
          `${"  ".repeat(depth)}${m.id} "${m.name}"${at}: ${verdict(m)}, ${m.state}` +
            ` | pins ${n(c.pins)}, regions ${n(c.regions)}, routes ${n(c.routes)}, sound ${n(c.sound)}`,
        );
        for (const child of m.children) walk(child, depth + 1);
      };
      for (const m of w.maps) walk(m, 2);
    }
    out.push(`  notes: ${t.notes.ships.length} of ${t.notes.total} ship`);
  }
  return out.join("\n");
}

interface TreeConfig {
  contentRoot: string;
  defaultWorld: string;
  include: string[];
  exclude: string[];
}

/** Load the content a config names and build its trees. Throws `AtlasModelError`. */
export function loadAtlasTree(
  configPath: string,
  root: string,
): { trees: CampaignTree[]; warnings: string[] } {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as TreeConfig;
  const contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);
  const loaded = loadAtlasModel(
    contentDir,
    { defaultWorld: cfg.defaultWorld, include: cfg.include, exclude: cfg.exclude },
    { root },
  );
  return { trees: atlasTree(loaded), warnings: loaded.warnings };
}

if (process.argv[1]?.endsWith("atlas-tree.ts") || process.argv[1]?.endsWith("atlas-tree.js")) {
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === "--config" || a.startsWith("--config="));
  const configArg =
    i < 0 ? "atlas.config.json" : argv[i].includes("=") ? argv[i].slice(9) : argv[i + 1];
  const root = process.cwd();
  try {
    if (!configArg) throw new Error("--config needs a file");
    const { trees, warnings } = loadAtlasTree(path.resolve(root, configArg), root);
    console.log(`atlas:tree: ${configArg}`);
    console.log(formatAtlasTree(trees));
    if (warnings.length > 0) {
      console.log(`\n${warnings.length} warning(s) from the loader:`);
      for (const w of warnings) console.log(`  - ${w}`);
    }
  } catch (e) {
    if (e instanceof AtlasModelError) {
      console.error(`atlas:tree: the content doesn't load:`);
      for (const issue of e.issues) console.error(`  - ${formatIssue(issue)}`);
    } else {
      console.error(`atlas:tree: ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exit(1);
  }
}
