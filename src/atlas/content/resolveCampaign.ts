/**
 * The one per-campaign visibility resolver (ADR-0004). For one campaign it
 * decides which worlds, maps, frames, regions, routes, pins, sound areas and
 * notes ship, and returns that campaign's must-not-ship set and any name
 * collisions (rule 8). Pure: no file IO, no clock, no globals.
 *
 * Every rule fails closed. A missing, invalid or unnamed visibility is `dm`; a
 * map with a broken tree (unknown or cross-world parent, cycle, duplicate id,
 * no frame) doesn't ship; a malformed fog polygon fogs its whole map; an
 * unknown campaign id throws rather than returning a partial answer.
 *
 * Rules (ADR-0004 numbering):
 *   1. `visibilityFor`: one value, or a per-campaign map; `player` and `rumor`
 *      ship.
 *   2. A map ships only if its visibility ships, its state in the campaign file
 *      is `open` or `fogged` (not listed means `unknown`), and its parent ships.
 *   3. On a `fogged` map: a pin under fog doesn't ship, nor does a region or
 *      sound-only area with any part of its area under fog (`areaUnderFog`, so
 *      a fogged strip between lit corners counts), nor a route with any part
 *      of its path under fog (`pathUnderFog`: every segment, so a fog gap
 *      between lit waypoints counts). Ride-on sound areas follow their region.
 *      Points are tested with `isLit` (`src/atlas/fog/effectiveLit.ts`).
 *   4. A child map whose frame has any part of its area under its fogged
 *      parent's fog doesn't ship, with its subtree. Tested over the frame's
 *      whole area (`frameUnderFog`), not only its corners.
 *   5. A world ships only if one of its maps ships; otherwise none of its notes
 *      ship.
 *   6. Notes: the frontmatter value (`noteIsSecret`, `visibility.ts`) can only be
 *      narrowed by a `world.yaml` `notes:` entry; a stale entry (`basedOn`
 *      missing or different) is `dm` everywhere. An orphan entry (a key matching
 *      no note of its world) is reported and narrows any note whose id matches
 *      it case- and space-blind. A note id shared by two notes ships for
 *      neither. The campaign's `notes:` mode
 *      (`hidden`, the fail-closed default, or `vault`) decides notes with no
 *      entry naming the campaign.
 *   7. A pin ships only if its note and map ship, its own visibility ships, and
 *      it is not under fog.
 *   8. A name, title, alias or id of something that doesn't ship that equals one
 *      of something that ships is a collision. A hidden region linking a note
 *      that ships keeps that note's id, title and aliases out of must-not-ship.
 *      A pin adds its location, never its note's name.
 *   9. Containment: on a map that ships, a *hiding region* is a region that
 *      doesn't ship for its own sake (`visibility`, or `link-hidden`); one
 *      dropped only by fog, or only by this rule, hides nothing (no cascade).
 *      It hides, with `in-hidden-region`: a pin inside it or on its edge; a
 *      route with any vertex inside it or on its edge, or any segment meeting
 *      its edge (crossing in, touching, running along); a sound-only area or
 *      region that touches it (shares interior, `polygonsTouch`) without
 *      wholly containing it (`polygonContainsStrictly`: an identical area or
 *      one sharing any boundary is no container). A frame (either quad of a
 *      rotated one) that touches it without wholly containing it hides its
 *      child map with `frame-in-hidden-region`, and the subtree with it.
 *      Hidden wins over any shipped region covering the same point. Geometry
 *      is even-odd, in the map's pixels (`src/atlas/geometry/polygon.ts`). A
 *      hiding region with fewer than 3 finite points is reported in
 *      `badHidingRegions` and hides everything on its map that this rule
 *      tests. Region own-verdicts come before pins, so a route's pin waypoint
 *      hidden here makes it `waypoint-hidden`. Maps, worlds, notes and region
 *      own-verdicts are re-decided until no frame is newly hidden.
 *
 * `warnings` and `staleEntries` name DM content: callers keep them out of
 * every player artifact.
 */
import { isLit } from "../fog/effectiveLit";
import {
  pathReachesPolygon,
  pointInOrOnPolygon,
  pointInPolygon,
  polygonContainsStrictly,
  polygonsTouch,
} from "../geometry/polygon";
import { slugify } from "./slugify";
import type { MapModel, ModelNote, WorldModel } from "./atlasModel";
import type { Note } from "./readNote";
import type { EntityVisibility, FogOverlay, Point } from "./schema";
import type {
  CampaignFileV2,
  CampaignId,
  FrameV2,
  MapId,
  NoteId,
  NoteOverride,
  WorldId,
} from "./schemaV2";
import { isPlayerVisible, isValidVisibility, noteIsSecret } from "./visibility";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * The in-memory model the resolver reads: every world and every campaign of
 * R-12's atlas model (`AtlasModel`; v1 comes through its one adapter), so
 * `loadAtlasModel`'s `model` passes straight in. A v2 `WorldFileV2` (a
 * `WorldModel` plus its `schemaVersion`) fits too.
 */
export interface CampaignResolverModel {
  worlds: readonly WorldModel[];
  campaigns: readonly CampaignFileV2[];
}

/** The parts of a `readNote` result the resolver reads. */
export type ResolverNote = Pick<Note, "id" | "title" | "aliases" | "visibility" | "atlas">;

/**
 * A note and the world it belongs to (its entity's world): the loader's
 * `ModelNote`, of which the resolver reads only `world` and these note fields,
 * so `loadAtlasModel`'s `notes` pass straight in.
 */
export interface WorldNote extends Pick<ModelNote, "world"> {
  note: ResolverNote;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Why something ships or doesn't. `ships` is the only shipping reason. */
export type ShipReason =
  | "ships"
  /** Its own visibility doesn't ship in this campaign (rule 1). */
  | "visibility"
  /** The map's state in this campaign is `unknown` or it isn't listed (rule 2). */
  | "unknown-state"
  /** The parent map doesn't ship (rule 2). */
  | "parent-hidden"
  /** Unknown or cross-world parent, or a cycle. */
  | "bad-parent"
  /** A child map with no usable frame. */
  | "no-frame"
  /** Part of the frame is under the parent's fog (rule 4). */
  | "frame-fogged"
  /** Two maps, worlds or notes share an id; none of them can be resolved safely. */
  | "duplicate-id"
  /** The world has no map that ships here (rule 5). */
  | "no-map-ships"
  /** The item's map doesn't ship (rule 2). */
  | "map-hidden"
  /** A point, or the pin, is under fog (rule 3). */
  | "fogged"
  /** The note's world doesn't ship, or isn't a known world (rule 5). */
  | "world-hidden"
  /** The note's frontmatter doesn't ship anywhere (`noteIsSecret`, rule 6). */
  | "secret"
  /** The note's `notes:` entry has no `basedOn` or a different one (rule 6). */
  | "stale-entry"
  /** The note's `notes:` entry doesn't ship in this campaign (rule 6). */
  | "entry"
  /** `notes: hidden` and no entry names this campaign (rule 6). */
  | "not-named"
  /** A `notes:` entry matching no note has this note's id (case- and space-blind) and doesn't ship it. */
  | "orphan-entry"
  /** The pin's note doesn't ship (rule 7). */
  | "note-hidden"
  /** A region links a note that doesn't ship, or a note that doesn't exist. */
  | "link-hidden"
  /** A route waypoint's pin doesn't ship, or doesn't exist on the map. */
  | "waypoint-hidden"
  /** A ride-on sound area's region doesn't ship, or doesn't exist on the map. */
  | "region-hidden"
  /** No geometry to place or fog-check (a route under 2 points, an area with none). */
  | "no-geometry"
  /** Inside, on the edge of, or reaching into a region hidden for its own sake (rule 9). */
  | "in-hidden-region"
  /** The frame touches a hiding region on the parent without wholly containing it (rule 9). */
  | "frame-in-hidden-region";

export interface Verdict {
  ships: boolean;
  reason: ShipReason;
}

export interface WorldVerdict extends Verdict {
  id: WorldId;
}
export interface MapVerdict extends Verdict {
  id: MapId;
  world: WorldId;
}
/** A child map's frame on its parent. Ships exactly when the child ships. */
export interface FrameVerdict extends Verdict {
  map: MapId;
  parent: MapId;
}
export interface ItemVerdict extends Verdict {
  id: string;
  map: MapId;
}
export interface PinVerdict extends Verdict {
  map: MapId;
  /** The pin's index in its map's `pins` list. */
  index: number;
  note: NoteId;
}
export interface NoteVerdict extends Verdict {
  id: NoteId;
  world: WorldId;
}

/** Where a dropped pin was: guarded instead of its note's name (rule 8). */
export interface PinLocation {
  map: MapId;
  index: number;
  x: number;
  y: number;
}

/** Everything about this campaign that must not appear in its player output. */
export interface MustNotShip {
  /** Ids of every world, map, region, route, sound area and note that doesn't ship. */
  ids: string[];
  /** Their names, titles and aliases. */
  names: string[];
  /** Image paths (`src`, `tileSrc`, as written and normalised by `normalizePath`) of every layer of a map that doesn't ship; its layer ids are in `ids` unless a shipped map's layer uses the same id. */
  paths: string[];
  /** Pins that don't ship, by location. */
  pinLocations: PinLocation[];
}

export type ResolvedKind = "world" | "map" | "layer" | "region" | "route" | "sound" | "note";

/** A name shared by something that doesn't ship and something that does (rule 8). */
export interface NameCollision {
  /** The name as the hidden side wrote it. */
  name: string;
  hidden: { kind: ResolvedKind; id: string };
  shipped: { kind: ResolvedKind; id: string };
}

/** A shipped note none of whose pins ships, some hidden by rule 9, and the regions that hid them. DM-only. */
export interface HiddenPinNote {
  note: NoteId;
  regions: { map: MapId; region: string }[];
}

export interface CampaignResolution {
  campaign: CampaignId;
  worlds: WorldVerdict[];
  maps: MapVerdict[];
  frames: FrameVerdict[];
  regions: ItemVerdict[];
  routes: ItemVerdict[];
  sound: ItemVerdict[];
  pins: PinVerdict[];
  notes: NoteVerdict[];
  mustNotShip: MustNotShip;
  collisions: NameCollision[];
  /** `notes:` entries whose `basedOn` is missing or differs from the frontmatter (rule 6). */
  staleEntries: { world: WorldId; note: NoteId }[];
  /**
   * `notes:` keys that match no note of their world (a typo, a case change, a
   * retitled note, an entry in the wrong world). The build should fail on them.
   */
  orphanEntries: { world: WorldId; entry: string }[];
  /**
   * Hiding regions (rule 9) with fewer than 3 finite points, so nothing can be
   * tested against them. The player build fails on them; everything on their
   * map that rule 9 tests is hidden meanwhile.
   */
  badHidingRegions: { map: MapId; region: string }[];
  /** Shipped notes whose every pin is hidden, some by rule 9: the build warns. DM-only. */
  hiddenPinNotes: HiddenPinNote[];
  /** DM-facing; never shipped. */
  warnings: string[];
}

export class ResolveCampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolveCampaignError";
  }
}

// ---------------------------------------------------------------------------
// Rule 1
// ---------------------------------------------------------------------------

/**
 * A written visibility for one campaign (rule 1): a valid single value; a
 * per-campaign map's valid value for this campaign; anything else (missing,
 * invalid, a campaign not named) is `dm`.
 */
export function visibilityFor(value: unknown, campaign: CampaignId): EntityVisibility {
  if (typeof value === "string") return isValidVisibility(value) ? value : "dm";
  if (isRecord(value) && hasOwn(value, campaign)) {
    const v = value[campaign];
    return isValidVisibility(v) ? v : "dm";
  }
  return "dm";
}

/** True when a written visibility ships to this campaign. */
export function shipsIn(value: unknown, campaign: CampaignId): boolean {
  return isPlayerVisible(visibilityFor(value, campaign));
}

// ---------------------------------------------------------------------------
// Fog geometry
// ---------------------------------------------------------------------------

/**
 * The fog a map has in a campaign, or `null` when the map is open. A polygon
 * with a non-finite coordinate can't be tested, so the whole map reads as
 * fogged (no reveals).
 */
function campaignFog(mapId: MapId, campaign: CampaignFileV2): FogOverlay | null {
  const entry = hasOwn(campaign.maps, mapId) ? campaign.maps[mapId] : undefined;
  if (!entry || entry.state !== "fogged") return null;
  const polys = (v: unknown): Point[][] | null => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return null;
    const out: Point[][] = [];
    for (const poly of v) {
      if (!Array.isArray(poly)) return null;
      for (const p of poly) if (!isFinitePoint(p)) return null;
      out.push(poly as Point[]);
    }
    return out;
  };
  const reveals = polys(entry.reveals);
  const conceals = polys(entry.conceals);
  if (!reveals || !conceals) return { mapId, enabled: true, reveals: [] };
  return { mapId, enabled: true, reveals, conceals };
}

function pointUnderFog(p: unknown, fog: FogOverlay | null): boolean {
  if (!fog) return false;
  if (!isFinitePoint(p)) return true;
  return !isLit(p[0], p[1], fog);
}

/**
 * True when any part of the path through `points` is under `fog`: its points,
 * and every segment between them. Exact, not sampled: along a segment lit-ness
 * only changes where it crosses a reveal or conceal edge, so the segment is cut
 * at every such crossing and the middle of each piece is tested. No points, or
 * a point that isn't a pair of finite numbers, on a fogged map counts as under
 * fog (fail closed).
 */
export function pathUnderFog(points: readonly unknown[] | undefined, fog: FogOverlay | null): boolean {
  if (!fog) return false;
  if (!points || points.length === 0) return true;
  if (!points.every(isFinitePoint)) return true;
  const pts = points as Point[];
  if (pts.some((p) => pointUnderFog(p, fog))) return true;
  const edges: Segment[] = [];
  for (const poly of [...fog.reveals, ...(fog.conceals ?? [])]) {
    if (poly.length >= 3) edges.push(...edgesOf(poly));
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const ts = [0, 1];
    for (const e of edges) {
      const t = crossingT([a, b], e);
      if (t !== null) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1] - ts[k] <= EPS) continue;
      const t = (ts[k] + ts[k + 1]) / 2;
      if (!isLit(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), fog)) return true;
    }
  }
  return false;
}

/**
 * True when any part of the polygon `points` is under `fog`: its points, and
 * its whole area (`frameUnderFog`'s exact arrangement test, which holds for
 * any simple polygon, not only quads), and its outline (`pathUnderFog` of the
 * closed ring), so a zero-area or sliver polygon drawn across fog counts too.
 * No points, or a point that isn't a pair of finite numbers, on a fogged map
 * counts as under fog (fail closed).
 */
export function areaUnderFog(points: readonly unknown[] | undefined, fog: FogOverlay | null): boolean {
  if (!fog) return false;
  if (!points || points.length === 0) return true;
  if (!points.every(isFinitePoint)) return true;
  const pts = points as Point[];
  return frameUnderFog(pts, fog) || pathUnderFog([...pts, pts[0]], fog);
}

/**
 * The frame's corners in the parent's pixels. The pivot of `rotation`
 * (degrees, clockwise on screen) isn't fixed by ADR-0003 yet, so a rotated
 * frame is tested twice, turned about its centre and about its top-left
 * corner; fog over either hides the child (fail closed).
 */
function frameQuads(frame: FrameV2): Point[][] | null {
  const { x, y, width, height, rotation } = frame;
  const nums = [x, y, width, height, rotation ?? 0];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  const rect: Point[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const turns = ((rotation ?? 0) % 360) + 0;
  if (turns === 0) return [rect];
  const rad = (turns * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const turn = (cx: number, cy: number): Point[] =>
    rect.map(([px, py]) => [cx + (px - cx) * cos - (py - cy) * sin, cy + (px - cx) * sin + (py - cy) * cos]);
  return [turn(x + width / 2, y + height / 2), turn(x, y)];
}

type Segment = [Point, Point];

const EPS = 1e-9;

/**
 * True when any part of the convex quad `quad` is under `fog` (rule 4).
 *
 * Exact over the area, not a sample: lit-ness only changes across a reveal or
 * conceal edge, so the quad is cut into vertical slabs at every vertex and
 * every crossing of two edges (no edges cross inside a slab), and each slab
 * into the trapezoids between the edges that span it. One test point inside
 * each trapezoid that lies in the quad covers every face of the arrangement.
 * The quad's corners are tested too.
 */
export function frameUnderFog(quad: readonly Point[], fog: FogOverlay | null): boolean {
  if (!fog) return false;
  if (quad.some((p) => pointUnderFog(p, fog))) return true;

  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const segments: Segment[] = edgesOf(quad);
  for (const poly of [...fog.reveals, ...(fog.conceals ?? [])]) {
    if (poly.length < 3) continue; // pointInPolygon ignores these, so they can't change lit-ness
    for (const s of edgesOf(poly)) {
      const sMinX = Math.min(s[0][0], s[1][0]);
      const sMaxX = Math.max(s[0][0], s[1][0]);
      const sMinY = Math.min(s[0][1], s[1][1]);
      const sMaxY = Math.max(s[0][1], s[1][1]);
      if (sMaxX < minX || sMinX > maxX || sMaxY < minY || sMinY > maxY) continue;
      segments.push(s);
    }
  }

  const cuts = new Set<number>();
  const addCut = (x: number) => {
    if (x >= minX && x <= maxX) cuts.add(x);
  };
  for (const s of segments) {
    addCut(s[0][0]);
    addCut(s[1][0]);
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const x = crossingX(segments[i], segments[j]);
      if (x !== null) addCut(x);
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);

  for (let i = 0; i + 1 < sorted.length; i++) {
    const x0 = sorted[i];
    const x1 = sorted[i + 1];
    if (x1 - x0 <= EPS) continue;
    const xm = (x0 + x1) / 2;
    const hits: number[] = [];
    for (const [a, b] of segments) {
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (xm <= lo || xm >= hi) continue;
      hits.push(a[1] + ((b[1] - a[1]) * (xm - a[0])) / (b[0] - a[0]));
    }
    hits.sort((a, b) => a - b);
    for (let k = 0; k + 1 < hits.length; k++) {
      const y0 = hits[k];
      const y1 = hits[k + 1];
      if (y1 - y0 <= EPS) continue;
      const ym = (y0 + y1) / 2;
      if (!pointInPolygon(xm, ym, quad as Point[])) continue;
      if (!isLit(xm, ym, fog)) return true;
    }
  }
  return false;
}

function edgesOf(poly: readonly Point[]): Segment[] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as Segment);
}

/** Where along the first segment (0..1) two segments cross, or null. */
function crossingT([p1, p2]: Segment, [p3, p4]: Segment): number | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (d === 0) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return Math.min(1, Math.max(0, t));
}

/** The x of the single point where two segments cross, or null. */
function crossingX(s1: Segment, s2: Segment): number | null {
  const t = crossingT(s1, s2);
  return t === null ? null : s1[0][0] + t * (s1[1][0] - s1[0][0]);
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

interface MapEntry {
  map: MapModel;
  world: WorldModel;
}

type RegionModel = NonNullable<MapModel["regions"]>[number];

/** A region hiding things on its map (rule 9); `points` is null when it can't be tested. */
interface HidingRegion {
  region: RegionModel;
  points: Point[] | null;
}

/** At least 3 points, each a pair of finite numbers; otherwise null. */
function testablePolygon(points: unknown): Point[] | null {
  if (!Array.isArray(points) || points.length < 3 || !points.every(isFinitePoint)) return null;
  return points as Point[];
}

/** The hiding regions a pin's point is inside or on the edge of. A point that isn't finite is hidden by all. */
function pointHiddenBy(p: unknown, hiding: readonly HidingRegion[]): HidingRegion[] {
  if (hiding.length === 0) return [];
  if (!isFinitePoint(p)) return [...hiding];
  return hiding.filter((h) => !h.points || pointInOrOnPolygon(p[0], p[1], h.points));
}

/** The hiding regions a route's resolved path reaches (a vertex in or on, or a segment meeting an edge). */
function pathHiddenBy(points: readonly unknown[], hiding: readonly HidingRegion[]): HidingRegion[] {
  if (hiding.length === 0) return [];
  if (!points.every(isFinitePoint)) return [...hiding];
  return hiding.filter((h) => !h.points || pathReachesPolygon(points as Point[], h.points));
}

/** The hiding regions an area touches without wholly containing. An area that isn't finite is hidden by all. */
function areaHiddenBy(points: readonly unknown[] | undefined, hiding: readonly HidingRegion[]): HidingRegion[] {
  if (hiding.length === 0) return [];
  if (!points || points.length === 0 || !points.every(isFinitePoint)) return [...hiding];
  const pts = points as Point[];
  return hiding.filter(
    (h) => !h.points || (polygonsTouch(pts, h.points) && !polygonContainsStrictly(pts, h.points)),
  );
}

/**
 * Resolve one campaign. Throws `ResolveCampaignError` when `campaignId` names
 * no campaign file, or more than one.
 */
export function resolveCampaign(
  model: CampaignResolverModel,
  notes: readonly WorldNote[],
  campaignId: CampaignId,
): CampaignResolution {
  const matching = model.campaigns.filter((c) => c.id === campaignId);
  if (matching.length !== 1) {
    throw new ResolveCampaignError(
      matching.length === 0
        ? `no campaign file for campaign "${campaignId}"`
        : `${matching.length} campaign files for campaign "${campaignId}"`,
    );
  }
  const campaign = matching[0];

  const worldCounts = countBy(model.worlds.map((w) => w.world.id));
  const mapsById = new Map<MapId, MapEntry[]>();
  const entries: MapEntry[] = [];
  for (const world of model.worlds) {
    for (const map of world.maps ?? []) {
      const list = mapsById.get(map.id) ?? [];
      const entry = { map, world };
      list.push(entry);
      mapsById.set(map.id, list);
      entries.push(entry);
    }
  }
  const worldFileById = new Map<WorldId, WorldModel>();
  for (const w of model.worlds) if (worldCounts.get(w.world.id) === 1) worldFileById.set(w.world.id, w);
  const noteIdCounts = countBy(notes.map(({ note }) => note.id));

  // Rule 9 for frames needs the parent's hiding regions; a region hides by a
  // hidden linked note, which needs note verdicts, world verdicts (rule 5)
  // and map verdicts. So maps, worlds, notes and region own-verdicts are
  // decided in a pass, then frames are tested against their parent's hiding
  // regions; a frame so hidden hides its map, and the pass runs again until no
  // frame is newly hidden. Each pass only hides more, so it ends.
  const frameHidden = new Set<MapEntry>();
  let pass = decidePass(frameHidden);
  for (;;) {
    let grew = false;
    for (const entry of entries) {
      if (frameHidden.has(entry) || entry.map.parent === undefined || !pass.mapShips.get(entry)) continue;
      const parent = (mapsById.get(entry.map.parent) ?? [])[0];
      const hiding = parent ? pass.hiding.get(parent) : undefined;
      const quads = entry.map.frame ? frameQuads(entry.map.frame) : null;
      if (!hiding || hiding.length === 0) continue;
      if (!quads || quads.some((q) => areaHiddenBy(q, hiding).length > 0)) {
        frameHidden.add(entry);
        grew = true;
      }
    }
    if (!grew) break;
    pass = decidePass(frameHidden);
  }
  const { maps, frames, mapShips, worlds, worldShipsById, noteVerdicts, notesById, noteIdShips, regionOwn, hiding } =
    pass;
  const { staleEntries, orphanEntries, warnings } = pass;

  /**
   * One pass over maps (rules 2, 4 and 9 for frames), worlds (rule 5), notes
   * (rules 5 and 6) and each region's own verdict (visibility, link, fog), with
   * each shipped map's hiding regions (rule 9). `frameHidden` lists the maps
   * whose frame an earlier pass found touching a hiding region on the parent.
   */
  function decidePass(frameHidden: ReadonlySet<MapEntry>) {
    const warnings: string[] = [];

    // --- Maps (rules 2, 4 and 9) ---------------------------------------------
    const mapVerdict = new Map<MapEntry, Verdict>();
    const resolving = new Set<MapEntry>();
    const resolveMap = (entry: MapEntry): Verdict => {
      const done = mapVerdict.get(entry);
      if (done) return done;
      if (resolving.has(entry)) return { ships: false, reason: "bad-parent" }; // a cycle
      resolving.add(entry);
      const v = decideMap(entry);
      resolving.delete(entry);
      mapVerdict.set(entry, v);
      return v;
    };
    const decideMap = (entry: MapEntry): Verdict => {
      const { map, world } = entry;
      if ((mapsById.get(map.id)?.length ?? 0) !== 1 || (worldCounts.get(world.world.id) ?? 0) !== 1) {
        return { ships: false, reason: "duplicate-id" };
      }
      if (map.parent !== undefined) {
        const parents = mapsById.get(map.parent) ?? [];
        if (parents.length !== 1 || parents[0].world !== world) return { ships: false, reason: "bad-parent" };
        const parent = resolveMap(parents[0]);
        if (!parent.ships) {
          return { ships: false, reason: parent.reason === "bad-parent" ? "bad-parent" : "parent-hidden" };
        }
      }
      if (!shipsIn(map.visibility, campaignId)) return { ships: false, reason: "visibility" };
      const state = hasOwn(campaign.maps, map.id) ? campaign.maps[map.id]?.state : undefined;
      if (state !== "open" && state !== "fogged") return { ships: false, reason: "unknown-state" };
      if (map.parent !== undefined) {
        const quads = map.frame ? frameQuads(map.frame) : null;
        if (!quads) return { ships: false, reason: "no-frame" };
        const parentFog = campaignFog(map.parent, campaign);
        if (quads.some((q) => frameUnderFog(q, parentFog))) return { ships: false, reason: "frame-fogged" };
        if (frameHidden.has(entry)) return { ships: false, reason: "frame-in-hidden-region" };
      }
      return { ships: true, reason: "ships" };
    };

    const maps: MapVerdict[] = [];
    const frames: FrameVerdict[] = [];
    const mapShips = new Map<MapEntry, boolean>();
    for (const entry of entries) {
      const { map, world } = entry;
      const v = resolveMap(entry);
      mapShips.set(entry, v.ships);
      maps.push({ id: map.id, world: world.world.id, ...v });
      if (map.parent !== undefined) frames.push({ map: map.id, parent: map.parent, ...v });
    }

    // --- Worlds (rule 5) ------------------------------------------------------
    const worlds: WorldVerdict[] = [];
    const worldShipsById = new Map<WorldId, boolean>();
    for (const world of model.worlds) {
      const id = world.world.id;
      let v: Verdict;
      if ((worldCounts.get(id) ?? 0) !== 1) v = { ships: false, reason: "duplicate-id" };
      else {
        const any = (world.maps ?? []).some((m) => mapsById.get(m.id)?.some((e) => e.map === m && mapShips.get(e)));
        v = any ? { ships: true, reason: "ships" } : { ships: false, reason: "no-map-ships" };
      }
      worlds.push({ id, ...v });
      worldShipsById.set(id, (worldShipsById.get(id) ?? true) && v.ships);
    }

    // --- Notes (rules 5 and 6) -----------------------------------------------
    const staleEntries: { world: WorldId; note: NoteId }[] = [];
    const noteVerdicts: NoteVerdict[] = [];

    // Orphan entries: a `notes:` key with no note of that id in that world. Each
    // one may have been meant to narrow a note (a typo, a case change, a
    // retitle, the wrong world's file), so it narrows every note whose id
    // matches it case- and space-blind or by slug, in any world, unless it
    // would ship that note here.
    const orphanEntries: { world: WorldId; entry: string }[] = [];
    const orphansByKey = new Map<string, NoteOverride[]>();
    for (const w of model.worlds) {
      if (!isRecord(w.notes)) continue;
      for (const key of Object.keys(w.notes)) {
        const owned = notes.some((n) => n.world === w.world.id && n.note.id === key);
        if (owned && worldFileById.get(w.world.id) === w) continue;
        orphanEntries.push({ world: w.world.id, entry: key });
        warnings.push(`world "${w.world.id}": notes: entry "${key}" matches no note of that world`);
        for (const k of orphanKeys(key)) orphansByKey.set(k, [...(orphansByKey.get(k) ?? []), w.notes[key]]);
      }
    }
    const orphanBlocks = (note: ResolverNote): boolean =>
      [...new Set(orphanKeys(note.id).flatMap((k) => orphansByKey.get(k) ?? []))].some(
        (e) =>
          !isRecord(e) ||
          e.basedOn === undefined ||
          e.basedOn !== note.visibility ||
          !shipsIn(e.visibility, campaignId),
      );

    for (const { world, note } of notes) {
      const worldFile = worldFileById.get(world);
      const entry: NoteOverride | undefined =
        worldFile?.notes && hasOwn(worldFile.notes, note.id) ? worldFile.notes[note.id] : undefined;
      let v = decideNote(note, entry, worldFile !== undefined && worldShipsById.get(world) === true);
      if ((noteIdCounts.get(note.id) ?? 0) !== 1) v = { ...v, ships: false, reason: "duplicate-id" };
      else if (v.ships && orphanBlocks(note)) v = { ...v, ships: false, reason: "orphan-entry" };
      if (v.stale) staleEntries.push({ world, note: note.id });
      if (v.widenAttempt) {
        warnings.push(
          `note "${note.id}": its notes: entry names campaign "${campaignId}" as player, but its frontmatter doesn't ship; the entry can only narrow`,
        );
      }
      noteVerdicts.push({ id: note.id, world, ships: v.ships, reason: v.reason });
    }

    // A note id ships only when every note with that id ships (duplicates fail closed).
    const notesById = new Map<NoteId, { note: ResolverNote; ships: boolean }[]>();
    notes.forEach(({ note }, i) => {
      const list = notesById.get(note.id) ?? [];
      list.push({ note, ships: noteVerdicts[i].ships });
      notesById.set(note.id, list);
    });
    const noteIdShips = (id: NoteId): boolean => {
      const list = notesById.get(id);
      return !!list && list.length > 0 && list.every((n) => n.ships);
    };

    // --- Region own-verdicts and hiding regions (rules 3 and 9) ---------------
    // A region's own verdict: its map, visibility, link and fog. A hiding region
    // is one on a shipped map that doesn't ship for its own sake (visibility or
    // link), not one dropped only by fog, nor one hidden only by rule 9.
    const regionOwn = new Map<RegionModel, Verdict>();
    const hiding = new Map<MapEntry, HidingRegion[]>();
    for (const entry of entries) {
      const onMap = mapShips.get(entry) === true;
      const fog = onMap ? campaignFog(entry.map.id, campaign) : null;
      const list: HidingRegion[] = [];
      for (const r of entry.map.regions ?? []) {
        let v: Verdict;
        if (!onMap) v = { ships: false, reason: "map-hidden" };
        else if (!shipsIn(r.visibility, campaignId)) v = { ships: false, reason: "visibility" };
        else if (r.entityId !== undefined && !noteIdShips(r.entityId)) v = { ships: false, reason: "link-hidden" };
        else if (areaUnderFog(r.points, fog)) v = { ships: false, reason: "fogged" };
        else v = { ships: true, reason: "ships" };
        regionOwn.set(r, v);
        if (onMap && (v.reason === "visibility" || v.reason === "link-hidden")) {
          list.push({ region: r, points: testablePolygon(r.points) });
        }
      }
      if (onMap) hiding.set(entry, list);
    }

    return {
      maps,
      frames,
      mapShips,
      worlds,
      worldShipsById,
      staleEntries,
      orphanEntries,
      warnings,
      noteVerdicts,
      notesById,
      noteIdShips,
      regionOwn,
      hiding,
    };
  }

  function decideNote(
    note: ResolverNote,
    entry: NoteOverride | undefined,
    worldShips: boolean,
  ): Verdict & { stale: boolean; widenAttempt: boolean } {
    const stale = entry !== undefined && (entry.basedOn === undefined || entry.basedOn !== note.visibility);
    const out = (ships: boolean, reason: ShipReason) => ({ ships, reason, stale, widenAttempt: false });
    if (noteIsSecret(note.visibility, note.atlas)) {
      const r = out(false, "secret");
      r.widenAttempt = entry !== undefined && shipsIn(entry.visibility, campaignId);
      return r;
    }
    if (stale) return out(false, "stale-entry");
    if (!worldShips) return out(false, "world-hidden");
    if (entry === undefined) {
      return campaign.notes === "vault" ? out(true, "ships") : out(false, "not-named");
    }
    const named = isRecord(entry.visibility) && hasOwn(entry.visibility, campaignId);
    if (campaign.notes !== "vault" && !named) return out(false, "not-named");
    return shipsIn(entry.visibility, campaignId) ? out(true, "ships") : out(false, "entry");
  }

  // Hiding regions too malformed to test (fewer than 3 finite points): the
  // player build fails on them; until then everything on their map that rule 9
  // tests is hidden (fail closed).
  const badHidingRegions: { map: MapId; region: string }[] = [];
  for (const [entry, list] of hiding) {
    for (const h of list) if (!h.points) badHidingRegions.push({ map: entry.map.id, region: h.region.id });
  }

  // --- Items on maps (rules 3, 7 and 9) ------------------------------------
  const pins: PinVerdict[] = [];
  const pinLocations: PinLocation[] = [];
  const regions: ItemVerdict[] = [];
  const routes: ItemVerdict[] = [];
  const sound: ItemVerdict[] = [];
  /** Hidden regions that link a note that ships: names to keep out of must-not-ship. */
  const regionExempt = new Map<string, Set<string>>();
  /** Per note id: whether any pin ships, and the hiding regions that hid its pins (rule 9). */
  const pinsByNote = new Map<NoteId, { anyShips: boolean; hiddenBy: { map: MapId; region: string }[] }>();
  const IN_HIDDEN: Verdict = { ships: false, reason: "in-hidden-region" };

  for (const entry of entries) {
    const { map } = entry;
    const onMap = mapShips.get(entry) === true;
    const fog = onMap ? campaignFog(map.id, campaign) : null;
    const hidingHere = hiding.get(entry) ?? [];

    const pinShips: boolean[] = [];
    (map.pins ?? []).forEach((pin, index) => {
      let v: Verdict;
      let hitBy: HidingRegion[] = [];
      if (!onMap) v = { ships: false, reason: "map-hidden" };
      else if (!shipsIn(pin.visibility, campaignId)) v = { ships: false, reason: "visibility" };
      else if (!noteIdShips(pin.note)) v = { ships: false, reason: "note-hidden" };
      else if (pointUnderFog([pin.x, pin.y], fog)) v = { ships: false, reason: "fogged" };
      else if ((hitBy = pointHiddenBy([pin.x, pin.y], hidingHere)).length > 0) v = IN_HIDDEN;
      else v = { ships: true, reason: "ships" };
      pinShips.push(v.ships);
      pins.push({ map: map.id, index, note: pin.note, ...v });
      if (!v.ships) pinLocations.push({ map: map.id, index, x: pin.x, y: pin.y });
      const seen = pinsByNote.get(pin.note) ?? { anyShips: false, hiddenBy: [] };
      seen.anyShips ||= v.ships;
      for (const h of hitBy) seen.hiddenBy.push({ map: map.id, region: h.region.id });
      pinsByNote.set(pin.note, seen);
    });

    const regionShips = new Map<string, boolean>();
    for (const r of map.regions ?? []) {
      let v = regionOwn.get(r)!;
      if (v.ships && areaHiddenBy(r.points, hidingHere).length > 0) v = IN_HIDDEN;
      regionShips.set(r.id, (regionShips.get(r.id) ?? true) && v.ships);
      regions.push({ id: r.id, map: map.id, ...v });
      if (!v.ships && r.entityId !== undefined && noteIdShips(r.entityId)) {
        const keys = regionExempt.get(regionKey(map.id, r.id)) ?? new Set<string>();
        for (const n of notesById.get(r.entityId) ?? []) {
          for (const name of [n.note.id, n.note.title, ...(n.note.aliases ?? [])]) {
            const k = normalizeName(name);
            if (k) keys.add(k);
          }
        }
        regionExempt.set(regionKey(map.id, r.id), keys);
      }
    }

    for (const route of map.routes ?? []) {
      let v: Verdict;
      if (!onMap) v = { ships: false, reason: "map-hidden" };
      else if (!shipsIn(route.visibility, campaignId)) v = { ships: false, reason: "visibility" };
      else {
        const points: Point[] = [];
        let waypointHidden = false;
        for (const w of route.waypoints ?? []) {
          if (Array.isArray(w)) {
            points.push(w as Point);
            continue;
          }
          const entityId = isRecord(w) ? w.entityId : undefined;
          const index = (map.pins ?? []).findIndex((p) => p.note === entityId);
          if (index < 0 || !pinShips[index]) {
            waypointHidden = true;
            break;
          }
          const pin = map.pins![index];
          points.push([pin.x, pin.y]);
        }
        if (waypointHidden) v = { ships: false, reason: "waypoint-hidden" };
        else if (points.length < 2) v = { ships: false, reason: "no-geometry" };
        else if (pathUnderFog(points, fog)) v = { ships: false, reason: "fogged" };
        else if (pathHiddenBy(points, hidingHere).length > 0) v = IN_HIDDEN;
        else v = { ships: true, reason: "ships" };
      }
      routes.push({ id: route.id, map: map.id, ...v });
    }

    for (const area of map.sound ?? []) {
      let v: Verdict;
      if (!onMap) v = { ships: false, reason: "map-hidden" };
      else if (area.regionId !== undefined) {
        v = regionShips.get(area.regionId) === true ? { ships: true, reason: "ships" } : { ships: false, reason: "region-hidden" };
      } else if (!shipsIn(area.visibility, campaignId)) v = { ships: false, reason: "visibility" };
      else if (!area.points || area.points.length === 0) v = { ships: false, reason: "no-geometry" };
      else if (areaUnderFog(area.points, fog)) v = { ships: false, reason: "fogged" };
      else if (areaHiddenBy(area.points, hidingHere).length > 0) v = IN_HIDDEN;
      else v = { ships: true, reason: "ships" };
      sound.push({ id: area.id, map: map.id, ...v });
    }
  }

  // A shipped note none of whose pins ships, with at least one hidden by rule 9:
  // the DM is told which region hid it (the note itself still ships, rule 6).
  const hiddenPinNotes: HiddenPinNote[] = [];
  for (const [note, seen] of pinsByNote) {
    if (seen.anyShips || seen.hiddenBy.length === 0 || !noteIdShips(note)) continue;
    const regions = seen.hiddenBy.filter(
      (h, i, all) => all.findIndex((o) => o.map === h.map && o.region === h.region) === i,
    );
    hiddenPinNotes.push({ note, regions });
  }

  // --- Must-not-ship and collisions (rule 8) --------------------------------
  // Items are matched by map and id; a duplicate id ships only if every copy does.
  const allShip = (list: readonly ItemVerdict[], map: MapId, id: string) =>
    list.filter((x) => x.map === map && x.id === id).every((x) => x.ships);
  
  const shippedIndex = new Map<string, { kind: ResolvedKind; id: string }>();
  const addShipped = (kind: ResolvedKind, id: string, names: readonly (string | undefined)[]) => {
    for (const n of [id, ...names]) {
      const k = normalizeName(n);
      if (k && !shippedIndex.has(k)) shippedIndex.set(k, { kind, id });
    }
  };
  const ids = new Set<string>();
  const names = new Set<string>();
  const paths = new Set<string>();
  /** Layer ids are per map: a hidden one another shipped map also uses is no secret. */
  const shippedLayerIds = new Set<string>();
  /** Shipped layers' image paths (normalised), to the map that ships them. */
  const shippedLayerPaths = new Map<string, MapId>();
  const hiddenLayers: { map: MapId; layer: string; paths: string[] }[] = [];
  const collisions: NameCollision[] = [];
  const seenCollision = new Set<string>();
  const addHidden = (
    kind: ResolvedKind,
    id: string,
    hiddenNames: readonly (string | undefined)[],
    exempt?: ReadonlySet<string>,
  ) => {
    const consider = (value: string | undefined, into: Set<string>) => {
      if (typeof value !== "string") return;
      const k = normalizeName(value);
      if (!k || exempt?.has(k)) return;
      into.add(value);
      pendingCollisions.push({ value, key: k, hidden: { kind, id } });
    };
    consider(id, ids);
    for (const n of hiddenNames) consider(n, names);
  };
  const pendingCollisions: { value: string; key: string; hidden: { kind: ResolvedKind; id: string } }[] = [];

  for (const world of model.worlds) {
    if (worldShipsById.get(world.world.id) === true) addShipped("world", world.world.id, [world.world.name]);
    else addHidden("world", world.world.id, [world.world.name]);

    for (const map of world.maps ?? []) {
      const entry = mapsById.get(map.id)!.find((e) => e.map === map)!;
      const onMap = mapShips.get(entry) === true;
      if (onMap) addShipped("map", map.id, [map.name]);
      else addHidden("map", map.id, [map.name]);
      for (const layer of map.layers ?? []) {
        const rawPaths = [layer.src, layer.tileSrc].filter((x): x is string => typeof x === "string" && x !== "");
        const layerPaths = rawPaths.map(normalizePath);
        if (onMap) {
          shippedLayerIds.add(normalizeName(layer.id));
          for (const path of layerPaths) shippedLayerPaths.set(path, map.id);
        } else {
          // Both as written and normalised, so an exact-match scan finds either.
          for (const path of [...rawPaths, ...layerPaths]) paths.add(path);
          hiddenLayers.push({ map: map.id, layer: layer.id, paths: layerPaths });
        }
      }

      for (const r of map.regions ?? []) {
        if (onMap && allShip(regions, map.id, r.id)) addShipped("region", r.id, [r.name]);
        else addHidden("region", r.id, [r.name], regionExempt.get(regionKey(map.id, r.id)));
      }
      for (const route of map.routes ?? []) {
        if (onMap && allShip(routes, map.id, route.id)) addShipped("route", route.id, [route.name]);
        else addHidden("route", route.id, [route.name]);
      }
      // A shipped sound area's id and name are rewritten in player output, so
      // only hidden ones count.
      for (const area of map.sound ?? []) {
        if (!(onMap && allShip(sound, map.id, area.id))) addHidden("sound", area.id, [area.name]);
      }
    }
  }
  for (const [id, list] of notesById) {
    if (list.every((n) => n.ships)) {
      for (const n of list) addShipped("note", id, [n.note.title, ...(n.note.aliases ?? [])]);
    }
  }
  for (const [id, list] of notesById) {
    if (list.every((n) => n.ships)) continue;
    for (const n of list) addHidden("note", id, [n.note.title, ...(n.note.aliases ?? [])]);
  }

  // A hidden map's layers: ids no shipped layer uses are secret; an image a
  // shipped layer also uses is a collision (the file ships anyway).
  for (const h of hiddenLayers) {
    if (!shippedLayerIds.has(normalizeName(h.layer))) ids.add(h.layer);
    for (const key of h.paths) {
      const shippedMap = shippedLayerPaths.get(key);
      if (shippedMap === undefined) continue;
      collisions.push({ name: key, hidden: { kind: "layer", id: `${h.map}/${h.layer}` }, shipped: { kind: "map", id: shippedMap } });
    }
  }
  for (const c of pendingCollisions) {
    const shipped = shippedIndex.get(c.key);
    if (!shipped) continue;
    const dedupe = `${c.key}\u0000${c.hidden.kind}\u0000${c.hidden.id}\u0000${shipped.kind}\u0000${shipped.id}`;
    if (seenCollision.has(dedupe)) continue;
    seenCollision.add(dedupe);
    collisions.push({ name: c.value, hidden: c.hidden, shipped });
  }

  return {
    campaign: campaignId,
    worlds,
    maps,
    frames,
    regions,
    routes,
    sound,
    pins,
    notes: noteVerdicts,
    mustNotShip: {
      ids: [...ids].sort(),
      names: [...names].sort(),
      paths: [...paths].sort(),
      pinLocations,
    },
    collisions,
    staleEntries,
    orphanEntries,
    badHidingRegions,
    hiddenPinNotes,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** How names compare for collisions and exemptions: Unicode-folded, trimmed, case-blind. */
export function normalizeName(name: string | undefined): string {
  if (typeof name !== "string") return "";
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Keys an orphan `notes:` entry and a note id are matched on: name-normalised and slug. */
function orphanKeys(id: string): string[] {
  return [`n:${normalizeName(id)}`, `s:${slugify(id)}`].filter((k) => k.length > 2);
}

/** Image paths compare without a leading `./` or `/`, with `//` collapsed, case-blind. */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(\.?\/)+/, "")
    .toLowerCase();
}

function regionKey(map: MapId, region: string): string {
  return `${map}\u0000${region}`;
}

function countBy(values: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function isFinitePoint(p: unknown): p is Point {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
