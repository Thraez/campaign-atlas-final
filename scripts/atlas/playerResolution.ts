/**
 * What the player build ships, as the per-campaign resolver (ADR-0004, R-11a)
 * decides it (R-11b). The build reads its content through R-12's loader
 * (`loadAtlasModel`, the one v1 adapter for v1 content), resolves campaign
 * `main`, and asks the lookups below instead of applying a visibility or fog
 * rule of its own.
 *
 * Fail closed: anything the resolver gave no verdict for (an item the adapter
 * skipped, a pin it never saw, an unknown map) does not ship.
 */
import type { AtlasModel } from "../../src/atlas/content/atlasModel";
import {
  resolveCampaign,
  type CampaignResolution,
  type NameCollision,
  type ShipReason,
  type Verdict,
} from "../../src/atlas/content/resolveCampaign";
import { V1_CAMPAIGN_ID } from "../../src/atlas/content/v1Model";
import { loadAtlasModel, type LoadAtlasModelConfig } from "./loadAtlasModel";
import type { DroppedRegion } from "./loadWorldConfig";

export interface PlayerResolution {
  resolution: CampaignResolution;
  /** Every note with this id ships (a duplicate id ships for none). */
  noteShips(id: string): boolean;
  mapShips(id: string): boolean;
  /** Region on its map; `undefined` when the resolver never saw it. */
  regionVerdict(map: string, id: string): Verdict | undefined;
  routeVerdict(map: string, id: string): Verdict | undefined;
  soundShips(map: string, id: string): boolean;
  /**
   * Whether the note's pin at (x, y) on this map ships. Each call takes the
   * next pin with that note, map and position, so two identical pins are
   * decided one each.
   */
  takePin(note: string, map: string, x: number, y: number): boolean;
  collisions: NameCollision[];
  orphanEntries: CampaignResolution["orphanEntries"];
  /** One line per rule-8 name collision, naming both items. DM-only. */
  collisionMessages: string[];
  /** One line per orphan `notes:` entry, naming world and key. DM-only. */
  orphanMessages: string[];
  /** One line per hiding region too malformed to test (rule 9), naming map and region. DM-only. */
  badHidingRegionMessages: string[];
  /**
   * One line per shipped note whose every placed pin rule 9 hides, naming the
   * note and the hiding regions. A warning, never a failure. DM-only.
   */
  hiddenPinNoteMessages: string[];
}

const key = (...parts: (string | number)[]) => parts.join("\0");

/** Many verdicts for one key ship only if all of them do; the first refusal is the reason. */
function merge(into: Map<string, Verdict>, k: string, v: Verdict): void {
  const had = into.get(k);
  if (!had) into.set(k, { ships: v.ships, reason: v.reason });
  else if (had.ships && !v.ships) into.set(k, { ships: false, reason: v.reason });
}

export function playerResolution(
  model: Pick<AtlasModel, "worlds">,
  resolution: CampaignResolution,
): PlayerResolution {
  const notes = new Map<string, Verdict>();
  for (const v of resolution.notes) merge(notes, v.id, v);
  const maps = new Map<string, Verdict>();
  for (const v of resolution.maps) merge(maps, v.id, v);
  const items = (
    list: readonly { map: string; id: string; ships: boolean; reason: ShipReason }[],
  ) => {
    const out = new Map<string, Verdict>();
    for (const v of list) merge(out, key(v.map, v.id), v);
    return out;
  };
  const regions = items(resolution.regions);
  const routes = items(resolution.routes);
  const sound = items(resolution.sound);

  const mapModels = new Map(model.worlds.flatMap((w) => w.maps.map((m) => [m.id, m] as const)));
  const pins = new Map<string, boolean[]>();
  for (const v of resolution.pins) {
    const pin = mapModels.get(v.map)?.pins?.[v.index];
    if (!pin || pin.note !== v.note) continue;
    const k = key(v.note, v.map, pin.x, pin.y);
    const queue = pins.get(k) ?? [];
    queue.push(v.ships);
    pins.set(k, queue);
  }

  const hidden = (c: NameCollision) => `${c.hidden.kind} "${c.hidden.id}"`;
  const shipped = (c: NameCollision) => `${c.shipped.kind} "${c.shipped.id}"`;

  return {
    resolution,
    noteShips: (id) => notes.get(id)?.ships === true,
    mapShips: (id) => maps.get(id)?.ships === true,
    regionVerdict: (map, id) => regions.get(key(map, id)),
    routeVerdict: (map, id) => routes.get(key(map, id)),
    soundShips: (map, id) => sound.get(key(map, id))?.ships === true,
    takePin: (note, map, x, y) => pins.get(key(note, map, x, y))?.shift() === true,
    collisions: resolution.collisions,
    orphanEntries: resolution.orphanEntries,
    collisionMessages: resolution.collisions.map(
      (c) =>
        `name collision (rule 8): DM-only ${hidden(c)} and shipped ${shipped(c)} share the name "${c.name}" — rename one`,
    ),
    orphanMessages: resolution.orphanEntries.map(
      (o) => `world "${o.world}": notes: entry "${o.entry}" matches no note — fix or remove it`,
    ),
    badHidingRegionMessages: resolution.badHidingRegions.map(
      (b) =>
        `map "${b.map}": hidden region "${b.region}" has fewer than 3 finite points or no area, so what lies inside it can't be tested (rule 9) — fix its points`,
    ),
    hiddenPinNoteMessages: resolution.hiddenPinNotes.map(
      (h) =>
        `note "${h.note}" ships, but every pin of it lies in a hidden region (rule 9): ${h.regions
          .map((r) => `map "${r.map}" region "${r.region}"`)
          .join(", ")} — it ships with no pin`,
    ),
  };
}

/** Load the content through R-12's loader and resolve the v1 campaign (`main`). Throws `AtlasModelError`. */
export function loadPlayerResolution(
  contentDir: string,
  config: LoadAtlasModelConfig,
  root: string,
): PlayerResolution {
  const { model, notes } = loadAtlasModel(contentDir, config, { root });
  return playerResolution(model, resolveCampaign(model, notes, V1_CAMPAIGN_ID));
}

/**
 * v1 only: regions `loadWorldConfig` dropped before the resolver could see
 * them (a repeated id, fewer than 3 points). One whose visibility isn't
 * explicitly `player` may have been meant to hide what lies inside it (rule
 * 9), so the player build fails on it as on a bad hiding region (exit 12).
 * The DM build is unchanged. Messages name DM-only regions.
 */
export function droppedRegionMessages(dropped: readonly DroppedRegion[] | undefined): string[] {
  return (dropped ?? [])
    .filter((d) => d.visibility !== "player")
    .map(
      (d) =>
        `map "${d.mapId}": region "${d.id}" was dropped (${d.why}) and isn't marked visibility: player, so what it may hide can't be tested (rule 9) — fix it, or mark it player`,
    );
}

/**
 * The resolver's own gates on a player build, strict or not: a rule-8 name
 * collision (exit 10), an orphan `notes:` entry (exit 11), and a hidden
 * region too malformed to test for rule 9 (exit 12). Every message names
 * DM-only items: callers keep them out of the shipped report.
 */
export function resolverFailure(
  r: Pick<PlayerResolution, "collisionMessages" | "orphanMessages" | "badHidingRegionMessages">,
): { exitCode: number; message: string } | undefined {
  if (r.collisionMessages.length > 0) {
    return {
      exitCode: 10,
      message: `Player build: ${r.collisionMessages.length} name collision(s) between DM-only and shipped items. Failing build.\n  ${r.collisionMessages.join("\n  ")}`,
    };
  }
  if (r.orphanMessages.length > 0) {
    return {
      exitCode: 11,
      message: `Player build: ${r.orphanMessages.length} orphan notes: entr${r.orphanMessages.length === 1 ? "y" : "ies"}. Failing build.\n  ${r.orphanMessages.join("\n  ")}`,
    };
  }
  if (r.badHidingRegionMessages.length > 0) {
    return {
      exitCode: 12,
      message: `Player build: ${r.badHidingRegionMessages.length} hidden region(s) too malformed to test. Failing build.\n  ${r.badHidingRegionMessages.join("\n  ")}`,
    };
  }
  return undefined;
}
