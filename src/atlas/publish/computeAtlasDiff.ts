/**
 * Compute a structured diff between two AtlasProject snapshots.
 *
 * Used by the editor's Publish Check tab to answer "what will my players see
 * that's new?" without the DM running git diff and mental-modeling YAML.
 *
 * The diff focuses on the changes that matter for a player experience:
 *   - Entities added / removed / visibility-flipped / body-substantially-changed.
 *   - Placements added / removed / moved (>1px).
 *   - Maps added / removed.
 *   - Regions / routes added / removed (per map).
 *
 * Body changes use a coarse heuristic: a hash-style length+prefix comparison.
 * Exact text diff is out of scope here — the user goes to git for that.
 */
// Inline shapes — avoids @/ import so this file is safe to import from Node scripts
// (esbuild bundles the vite config and can't resolve @/ aliases at that stage).
// The real types in @/atlas/content/schema are structurally assignable to these.
type AtlasProject = {
  entities: Entity[];
  placements: MapPlacement[];
  maps: MapDocument[];
  version?: string;
  publishedAt?: string;
};
type Entity = {
  id: string;
  title: string;
  visibility?: string;
  body?: string;
  summary?: string;
};
type MapDocument = {
  id: string;
  name: string;
  regions?: Array<{ id: string; name?: string }>;
  routes?: Array<{ id: string; name?: string }>;
};
type MapPlacement = { entityId: string; mapId: string; x: number; y: number };

export interface EntityChange {
  id: string;
  title: string;
  kind: "added" | "removed" | "visibility-changed" | "body-changed" | "summary-changed" | "title-changed";
  before?: string;
  after?: string;
}

export interface PlacementChange {
  entityId: string;
  entityTitle: string;
  mapId: string;
  kind: "added" | "removed" | "moved";
  before?: { x: number; y: number };
  after?: { x: number; y: number };
}

export interface MapChange {
  id: string;
  name: string;
  kind: "added" | "removed";
}

export interface OverlayChange {
  mapId: string;
  kind: "region-added" | "region-removed" | "route-added" | "route-removed";
  name?: string;
}

export interface AtlasDiff {
  /** Whether there are any changes at all. */
  hasChanges: boolean;
  /** Total counts for quick rendering. */
  counts: {
    entities: number;
    placements: number;
    maps: number;
    overlays: number;
  };
  entities: EntityChange[];
  placements: PlacementChange[];
  maps: MapChange[];
  overlays: OverlayChange[];
  /** Optional metadata for the panel header. */
  meta: {
    baselineVersion?: string;
    currentVersion?: string;
    baselinePublishedAt?: string;
    currentPublishedAt?: string;
  };
}

const EMPTY_DIFF: AtlasDiff = {
  hasChanges: false,
  counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
  entities: [],
  placements: [],
  maps: [],
  overlays: [],
  meta: {},
};

function bodySignature(e: Entity): string {
  // Coarse: length + first 80 chars + last 40 chars. Enough to detect a real
  // edit; ignores trailing whitespace tweaks.
  const b = (e.body ?? "").trim();
  return `${b.length}|${b.slice(0, 80)}|${b.slice(-40)}`;
}

function placementMoved(a: MapPlacement, b: MapPlacement): boolean {
  return Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1;
}

function indexBy<T>(items: T[], key: (t: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of items) m.set(key(item), item);
  return m;
}

export function computeAtlasDiff(
  baseline: AtlasProject | null,
  current: AtlasProject | null
): AtlasDiff {
  if (!baseline || !current) {
    return {
      ...EMPTY_DIFF,
      meta: {
        baselineVersion: baseline?.version,
        currentVersion: current?.version,
        baselinePublishedAt: baseline?.publishedAt,
        currentPublishedAt: current?.publishedAt,
      },
    };
  }

  const entities: EntityChange[] = [];
  const placements: PlacementChange[] = [];
  const maps: MapChange[] = [];
  const overlays: OverlayChange[] = [];

  // ---- Entities ----
  const baseEntities = indexBy(baseline.entities, (e) => e.id);
  const currEntities = indexBy(current.entities, (e) => e.id);

  for (const [id, ent] of currEntities) {
    if (!baseEntities.has(id)) {
      entities.push({ id, title: ent.title, kind: "added" });
      continue;
    }
    const prev = baseEntities.get(id)!;
    if (prev.visibility !== ent.visibility) {
      entities.push({
        id, title: ent.title, kind: "visibility-changed",
        before: prev.visibility, after: ent.visibility,
      });
    }
    if (prev.title !== ent.title) {
      entities.push({ id, title: ent.title, kind: "title-changed", before: prev.title, after: ent.title });
    }
    if ((prev.summary ?? "") !== (ent.summary ?? "")) {
      entities.push({ id, title: ent.title, kind: "summary-changed" });
    }
    if (bodySignature(prev) !== bodySignature(ent)) {
      entities.push({ id, title: ent.title, kind: "body-changed" });
    }
  }
  for (const [id, prev] of baseEntities) {
    if (!currEntities.has(id)) {
      entities.push({ id, title: prev.title, kind: "removed" });
    }
  }

  // ---- Placements ----
  const baselinePlc = indexBy(baseline.placements, (p) => `${p.entityId}@${p.mapId}`);
  const currentPlc = indexBy(current.placements, (p) => `${p.entityId}@${p.mapId}`);
  const titleOf = (eid: string) => currEntities.get(eid)?.title ?? baseEntities.get(eid)?.title ?? eid;

  for (const [key, plc] of currentPlc) {
    if (!baselinePlc.has(key)) {
      placements.push({
        entityId: plc.entityId, entityTitle: titleOf(plc.entityId), mapId: plc.mapId,
        kind: "added", after: { x: plc.x, y: plc.y },
      });
      continue;
    }
    const prev = baselinePlc.get(key)!;
    if (placementMoved(prev, plc)) {
      placements.push({
        entityId: plc.entityId, entityTitle: titleOf(plc.entityId), mapId: plc.mapId,
        kind: "moved", before: { x: prev.x, y: prev.y }, after: { x: plc.x, y: plc.y },
      });
    }
  }
  for (const [key, prev] of baselinePlc) {
    if (!currentPlc.has(key)) {
      placements.push({
        entityId: prev.entityId, entityTitle: titleOf(prev.entityId), mapId: prev.mapId,
        kind: "removed", before: { x: prev.x, y: prev.y },
      });
    }
  }

  // ---- Maps ----
  const baseMaps = indexBy(baseline.maps, (m: MapDocument) => m.id);
  const currMaps = indexBy(current.maps, (m: MapDocument) => m.id);
  for (const [id, m] of currMaps) {
    if (!baseMaps.has(id)) maps.push({ id, name: m.name, kind: "added" });
  }
  for (const [id, m] of baseMaps) {
    if (!currMaps.has(id)) maps.push({ id, name: m.name, kind: "removed" });
  }

  // ---- Overlays (regions / routes per map) ----
  for (const m of current.maps) {
    const prev = baseMaps.get(m.id);
    const prevRegions = new Set((prev?.regions ?? []).map((r) => r.id));
    const prevRoutes = new Set((prev?.routes ?? []).map((r) => r.id));
    for (const r of m.regions ?? []) {
      if (!prevRegions.has(r.id)) overlays.push({ mapId: m.id, kind: "region-added", name: r.name });
    }
    for (const r of m.routes ?? []) {
      if (!prevRoutes.has(r.id)) overlays.push({ mapId: m.id, kind: "route-added", name: r.name });
    }
    if (prev) {
      const currRegions = new Set((m.regions ?? []).map((r) => r.id));
      const currRoutes = new Set((m.routes ?? []).map((r) => r.id));
      for (const r of prev.regions ?? []) {
        if (!currRegions.has(r.id)) overlays.push({ mapId: m.id, kind: "region-removed", name: r.name });
      }
      for (const r of prev.routes ?? []) {
        if (!currRoutes.has(r.id)) overlays.push({ mapId: m.id, kind: "route-removed", name: r.name });
      }
    }
  }
  // Catch overlays on removed maps (their regions/routes also vanish).
  for (const m of baseline.maps) {
    if (currMaps.has(m.id)) continue;
    for (const r of m.regions ?? []) overlays.push({ mapId: m.id, kind: "region-removed", name: r.name });
    for (const r of m.routes ?? []) overlays.push({ mapId: m.id, kind: "route-removed", name: r.name });
  }

  return {
    hasChanges: entities.length + placements.length + maps.length + overlays.length > 0,
    counts: {
      entities: new Set(entities.map((e) => e.id)).size,
      placements: new Set(placements.map((p) => `${p.entityId}@${p.mapId}`)).size,
      maps: new Set(maps.map((m) => m.id)).size,
      overlays: overlays.length,
    },
    entities, placements, maps, overlays,
    meta: {
      baselineVersion: baseline.version,
      currentVersion: current.version,
      baselinePublishedAt: baseline.publishedAt,
      currentPublishedAt: current.publishedAt,
    },
  };
}
