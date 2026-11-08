/**
 * What ships for the old editor's project (R-11c): the DM atlas the editor
 * loads (`AtlasProject`), presented through the one v1 adapter (`v1Model.ts`)
 * and resolved for campaign `main` by the one resolver (`resolveCampaign.ts`,
 * ADR-0004). The old Publish Check asks this instead of re-deriving
 * visibility, so it gives the build's verdict by construction.
 *
 * Pure and browser-safe: no file IO; the adapter and the resolver are pure.
 * `publish-check-import-graph.test.ts` pins that no Node module is in the
 * import chain.
 */
import type { AtlasProject, Region } from "@/atlas/content/schema";
import {
  resolveCampaign,
  type CampaignResolution,
  type WorldNote,
} from "@/atlas/content/resolveCampaign";
import { V1_CAMPAIGN_ID, v1Model, type V1Pin, type V1Route } from "@/atlas/content/v1Model";
import { noteIsSecret } from "@/atlas/content/visibility";

export const PUBLISH_CHECK_CAMPAIGN = V1_CAMPAIGN_ID;

/** The world the v1 project's notes belong to: its one world (as the v1 build). */
function projectWorldId(project: AtlasProject): string {
  return project.worlds[0]?.id ?? project.maps[0]?.worldId ?? "world";
}

/** The note's `atlas:` block (`{}` when missing or not a mapping), as `readNote` reads it. */
function noteAtlas(frontmatter: Record<string, unknown> | undefined): Record<string, unknown> {
  const atlas = frontmatter?.atlas;
  return typeof atlas === "object" && atlas !== null && !Array.isArray(atlas)
    ? (atlas as Record<string, unknown>)
    : {};
}

/**
 * Resolve the project for campaign `main`. Throws the adapter's
 * `V1ModelError` (two maps sharing an id) or the resolver's error; the caller
 * fails closed on it.
 */
export function resolveProject(project: AtlasProject): CampaignResolution {
  const worldId = projectWorldId(project);
  const entityById = new Map(project.entities.map((e) => [e.id, e] as const));

  const regions: Region[] = [];
  const routes: V1Route[] = [];
  for (const m of project.maps) {
    for (const r of m.regions ?? []) regions.push({ ...r, mapId: m.id });
    for (const r of m.routes ?? []) {
      const { resolvedPoints: _drop, ...route } = r;
      routes.push({ ...route, mapId: m.id });
    }
  }

  // A pin's visibility is its note's, `dm` for a secret note or a placement
  // behind a secret lock (as `loadAtlasModel` reads v1 pins).
  const pins: V1Pin[] = project.placements.map((p) => {
    const e = entityById.get(p.entityId);
    const secret = !e || noteIsSecret(e.visibility, noteAtlas(e.frontmatter));
    return {
      note: p.entityId,
      mapId: p.mapId,
      x: p.x,
      y: p.y,
      visibility: secret || p.secretId !== undefined ? "dm" : p.visibility,
    };
  });

  const { model } = v1Model({
    worldId,
    name: project.worlds[0]?.name,
    // Water doesn't decide visibility; dropping it keeps maps whose water
    // differs (fine in v1) from being refused by the adapter.
    maps: project.maps.map(({ regions: _r, routes: _t, fog: _f, water: _w, ...rest }) => rest),
    regions,
    routes,
    fogs: project.maps.flatMap((m) => (m.fog ? [{ ...m.fog, mapId: m.id }] : [])),
    pins,
  });

  const notes: WorldNote[] = project.entities.map((e) => ({
    world: worldId,
    note: {
      id: e.id,
      title: e.title,
      aliases: e.aliases ?? [],
      visibility: e.visibility,
      atlas: noteAtlas(e.frontmatter),
    },
  }));

  return resolveCampaign(model, notes, PUBLISH_CHECK_CAMPAIGN);
}
