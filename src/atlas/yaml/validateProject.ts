/**
 * Project-wide validation with severity levels.
 *
 * Used by the Publish Check dashboard to give the DM a single
 * "what would break / what should I look at" report. Pure, no I/O.
 *
 * The report is assembled by running an ordered list of independent
 * `rule` functions (see `RULES` below). Each rule receives a read-only
 * `ValidationContext` (the project plus a few precomputed lookup sets) and
 * returns the issues and/or "passed" checks it found. Keeping each check in
 * its own small named function makes the individual rules readable and
 * testable in isolation; the driver in `validateProject` just concatenates
 * their output in order and tallies the counts.
 *
 * What ships (R-11c): every "does it reach players" question about notes,
 * regions, routes and sound areas is answered by the one resolver for campaign
 * `main` (`resolveProject.ts`: the v1 adapter, then `resolveCampaign`), so the
 * leak rules below block exactly when the strict player build fails. This file
 * keeps only the presentation: categories, messages, locators.
 */
import type { AtlasProject, MapDocument, Entity } from "@/atlas/content/schema";
import { findDmMarkup } from "@/atlas/content/dmMarkup";
import {
  PLAYER_VISIBLE_VISIBILITY,
  VALID_VISIBILITY,
  isSecretVisibility,
} from "@/atlas/content/visibility";
import {
  shipsIn,
  type CampaignResolution,
  type ItemVerdict,
} from "@/atlas/content/resolveCampaign";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { PlacementOverride } from "./buildPatches";
import { PUBLISH_CHECK_CAMPAIGN, resolveProject } from "./resolveProject";

export type Severity = "blocking" | "warning" | "suggestion" | "passed";

export type IssueCategory = "safety" | "yaml" | "map" | "draft";

export interface IssueAction {
  /** "go-entity" | "go-map" | "show-fix" */
  kind: "go-entity" | "go-map" | "show-fix";
  label: string;
  /** Free-form payload — for "show-fix" this is the suggested patch text. */
  payload?: string;
}

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  /** Plain-language explanation the DM can act on without reading YAML. */
  hint?: string;
  /** Tab the issue belongs to in the Publish Check dashboard. */
  category?: IssueCategory;
  /** Where in the editor the problem lives. */
  scope?: { mapId?: string; entityId?: string };
  /** Suggested actions the dashboard can render as buttons. */
  actions?: IssueAction[];
}

export interface ValidationReport {
  issues: Issue[];
  counts: Record<Exclude<Severity, "passed">, number>;
  passedChecks: string[];
  /** Snapshot metadata shown at the top of the Publish Check dashboard. */
  meta: {
    generatedAt: string;
    atlasVersion?: string;
    builtAt?: string;
    entityCount: number;
    mapCount: number;
    draftPlacementCount: number;
    pendingAssetCount: number;
  };
}

export interface ValidateProjectOpts {
  project: AtlasProject;
  /** Drafts the DM is about to export. */
  draftPlacements: PlacementOverride[];
  draftMap?: MapDocument;
  draftLocalLayers?: LocalLayer[];
}

/**
 * Read-only bundle every rule receives. The lookup sets are precomputed once
 * so individual rules don't each re-scan the whole project.
 */
interface ValidationContext {
  project: AtlasProject;
  draftPlacements: PlacementOverride[];
  draftMap?: MapDocument;
  draftLocalLayers: LocalLayer[];
  /** All map ids in the project. */
  mapIds: Set<string>;
  /** All entity ids (slugs) in the project. */
  entityIds: Set<string>;
  /**
   * The resolver's verdicts for campaign `main` (`resolveProject`), or `null`
   * when the project couldn't be resolved (then nothing ships: fail closed).
   */
  resolution: CampaignResolution | null;
  /** Why `resolution` is null. */
  resolutionError?: string;
  /**
   * True when the note with this id ships (the resolver says so for every
   * note with the id). A wikilink, relationship, region or route waypoint to
   * an id that doesn't ship leaks, as in the build.
   */
  noteShips: (id: string) => boolean;
  /** Visibilities that are shown to players (player | rumor). */
  playerVisibleVis: Set<string>;
  /** The complete set of accepted visibility values. */
  validVis: Set<string>;
  /** id → entity, for cheap title lookups when reporting. */
  entityById: Map<string, Entity>;
}

/** What a single rule contributes to the report. */
interface RuleOutput {
  issues?: Issue[];
  passed?: string[];
}

type Rule = (ctx: ValidationContext) => RuleOutput;

/** Why a linked note doesn't reach players, for leak messages. */
function describeHiddenTarget(target: Entity | undefined): string {
  if (!target) return "unknown or folder-excluded note";
  if (isSecretVisibility(target.visibility)) return `${target.visibility} entity`;
  return "atlas.publish: false";
}

/** How a region or route leak names its target: "dm entity", "unknown entity". */
function hiddenTargetLabel(target: Entity | undefined): string {
  if (!target) return "unknown entity";
  if (isSecretVisibility(target.visibility)) return `${target.visibility} entity`;
  return "unpublished entity (atlas.publish: false)";
}

/** The resolver's verdicts for one region, route or sound area (duplicate ids give several). */
function verdictsFor(
  list: readonly ItemVerdict[] | undefined,
  mapId: string,
  id: string,
): ItemVerdict[] {
  return (list ?? []).filter((v) => v.map === mapId && v.id === id);
}

/**
 * Would this item ship but for what it links? With verdicts, the resolver
 * decides: it judges the item's own visibility and map first, so any other
 * reason means the item's own call is "ship". Without (an item the adapter
 * skips, or no resolution), the item's own visibility for campaign `main`.
 */
function itemWouldShip(verdicts: ItemVerdict[], visibility: unknown): boolean {
  if (verdicts.length === 0) return shipsIn(visibility, PUBLISH_CHECK_CAMPAIGN);
  return verdicts.some((v) => v.reason !== "visibility" && v.reason !== "map-hidden");
}

// 1. Duplicate map IDs across project
const checkMapIdUniqueness: Rule = (ctx) => {
  const issues: Issue[] = [];
  const seenMap = new Set<string>();
  for (const m of ctx.project.maps) {
    if (seenMap.has(m.id))
      issues.push({
        severity: "blocking",
        code: "duplicate-map-id",
        category: "yaml",
        message: `Duplicate map id "${m.id}"`,
        hint: "Two maps share the same id. Rename one in world.yaml — ids must be unique.",
        scope: { mapId: m.id },
      });
    seenMap.add(m.id);
  }
  const passed: string[] = [];
  if (!seenMap.size || ctx.project.maps.length === seenMap.size) passed.push("Unique map IDs");
  return { issues, passed };
};

// 2. Per-map: duplicate layer IDs, empty maps, layer asset checks
const checkMapLayers: Rule = (ctx) => {
  const issues: Issue[] = [];
  for (const m of ctx.project.maps) {
    const seen = new Set<string>();
    for (const l of m.layers) {
      if (seen.has(l.id))
        issues.push({
          severity: "blocking",
          code: "duplicate-layer-id",
          category: "yaml",
          message: `Duplicate layer "${l.id}" in map "${m.id}"`,
          hint: "Two layers under this map share an id. Rename one in the Maps tab.",
          scope: { mapId: m.id },
        });
      seen.add(l.id);
      if (!l.src) {
        issues.push({
          severity: "blocking",
          code: "missing-layer-src",
          category: "map",
          message: `Layer "${l.id}" in map "${m.name}" has no image source`,
          hint: "Set an image path in the Maps → Layers tab, or remove the layer.",
          scope: { mapId: m.id },
        });
      } else if (/^https?:\/\//i.test(l.src)) {
        issues.push({
          severity: "warning",
          code: "external-asset",
          category: "map",
          message: `Layer "${l.id}" loads from an external URL`,
          hint: "External images break offline use and may disappear. Download to public/atlas/assets/maps/ and reference the local path.",
          scope: { mapId: m.id },
        });
      } else if (!/^(\/?atlas\/|\/?public\/atlas\/|\/atlas\/)/i.test(l.src)) {
        issues.push({
          severity: "suggestion",
          code: "unusual-asset-path",
          category: "map",
          message: `Layer "${l.id}" image path "${l.src}" is outside atlas/assets/`,
          hint: "Map images normally live under public/atlas/assets/maps/ so the publish workflow can find them.",
          scope: { mapId: m.id },
        });
      }
      if (l.width <= 0 || l.height <= 0) {
        issues.push({
          severity: "blocking",
          code: "invalid-layer-size",
          category: "map",
          message: `Layer "${l.id}" has non-positive size`,
          hint: "Layer width and height must be > 0. Adjust in the Maps tab.",
          scope: { mapId: m.id },
        });
      }
      if (typeof l.opacity === "number" && (l.opacity < 0 || l.opacity > 1)) {
        issues.push({
          severity: "warning",
          code: "invalid-opacity",
          category: "map",
          message: `Layer "${l.id}" opacity ${l.opacity} is outside 0–1`,
          scope: { mapId: m.id },
        });
      }
    }
    if (m.layers.length === 0) {
      issues.push({
        severity: "warning",
        code: "empty-map",
        category: "map",
        message: `Map "${m.name}" has no layers`,
        hint: "This map will render as a blank ocean colour. Add at least one base image layer.",
        scope: { mapId: m.id },
      });
    }
    if ((m.routes ?? []).length > 0 && !m.scale) {
      issues.push({
        severity: "suggestion",
        code: "route-no-scale",
        category: "map",
        message: `Map "${m.name}" has routes but no scale`,
        hint: "Without map.scale (unitsPerPixel + unitLabel) routes can't show distance or travel time.",
        scope: { mapId: m.id },
      });
    }
  }
  return { issues };
};

// 3. Region/route uniqueness + geometry checks
const checkRegionsAndRoutes: Rule = (ctx) => {
  const issues: Issue[] = [];
  // Region ids must be unique across the whole project, so this set spans maps.
  const seenRegion = new Set<string>();
  for (const m of ctx.project.maps) {
    for (const r of m.regions ?? []) {
      if (seenRegion.has(r.id))
        issues.push({
          severity: "blocking",
          code: "duplicate-region-id",
          category: "yaml",
          message: `Duplicate region "${r.id}"`,
          hint: "Two regions share the same id. Rename one in the Regions tab.",
          scope: { mapId: m.id },
        });
      seenRegion.add(r.id);
      if (r.points.length < 3)
        issues.push({
          severity: "blocking",
          code: "region-too-few-points",
          category: "map",
          message: `Region "${r.name}" has fewer than 3 points`,
          hint: "A polygon needs at least 3 points. Edit it in the Regions tab.",
          scope: { mapId: m.id },
        });
      if (r.entityId && !ctx.entityIds.has(r.entityId)) {
        issues.push({
          severity: "warning",
          code: "unknown-entity",
          category: "yaml",
          message: `Region "${r.name}" references unknown entity "${r.entityId}"`,
          hint: "The linked entity does not exist. Either create the markdown file, fix the slug, or unlink in the Regions tab.",
          scope: { mapId: m.id, entityId: r.entityId },
        });
      }
      // A region that would ship but links a note that doesn't (the resolver
      // drops it as `link-hidden`) leaks: the strict build fails (exit 6).
      if (
        r.entityId &&
        !ctx.noteShips(r.entityId) &&
        itemWouldShip(verdictsFor(ctx.resolution?.regions, m.id, r.id), r.visibility)
      ) {
        issues.push({
          severity: "blocking",
          code: "spoiler-leak-region",
          category: "safety",
          message: `Player-visible region "${r.name}" links to ${hiddenTargetLabel(ctx.entityById.get(r.entityId))} "${r.entityId}"`,
          hint: "Players would see the region polygon and the entity title would leak. Either hide the region (visibility: dm) or unlink the entity.",
          scope: { mapId: m.id, entityId: r.entityId },
        });
      }
      // points outside map bounds
      const oob = r.points.find(([x, y]) => x < 0 || y < 0 || x > m.width || y > m.height);
      if (oob) {
        issues.push({
          severity: "warning",
          code: "region-out-of-bounds",
          category: "map",
          message: `Region "${r.name}" has points outside ${m.width}×${m.height}`,
          hint: "Drag those vertices back inside the map in the Regions tab.",
          scope: { mapId: m.id },
        });
      }
    }
    // Route ids only need to be unique within a single map.
    const seenRoute = new Set<string>();
    for (const route of m.routes ?? []) {
      if (seenRoute.has(route.id))
        issues.push({
          severity: "blocking",
          code: "duplicate-route-id",
          category: "yaml",
          message: `Duplicate route "${route.id}"`,
          scope: { mapId: m.id },
        });
      seenRoute.add(route.id);
      const routeWouldShip = itemWouldShip(
        verdictsFor(ctx.resolution?.routes, m.id, route.id),
        route.visibility,
      );
      if (route.waypoints.length < 2)
        issues.push({
          severity: "blocking",
          code: "route-too-few-waypoints",
          category: "map",
          message: `Route "${route.name}" has fewer than 2 waypoints`,
          scope: { mapId: m.id },
        });
      for (const w of route.waypoints) {
        if (typeof w === "object" && "entityId" in w) {
          if (!ctx.entityIds.has(w.entityId)) {
            issues.push({
              severity: "warning",
              code: "route-waypoint-unresolved",
              category: "map",
              message: `Route "${route.name}" references unknown entity "${w.entityId}"`,
              hint: "Fix the entity slug, create the markdown file, or replace the waypoint with raw coordinates.",
              scope: { mapId: m.id, entityId: w.entityId },
            });
          }
          // A waypoint on a note that doesn't ship, on a route that would
          // otherwise ship, is a route leak: the strict build fails (exit 7).
          if (routeWouldShip && !ctx.noteShips(w.entityId)) {
            issues.push({
              severity: "blocking",
              code: "spoiler-leak-route",
              category: "safety",
              message: `Player-visible route "${route.name}" routes through ${hiddenTargetLabel(ctx.entityById.get(w.entityId))} "${w.entityId}"`,
              hint: "The waypoint label would expose a DM-only or missing entity to players. Fix the slug, hide the route, or replace the waypoint with raw coordinates.",
              scope: { mapId: m.id, entityId: w.entityId },
            });
          }
        }
      }
    }
  }
  return { issues };
};

// 4. Entity visibility sanity, duplicate slugs, missing summaries/types
const checkEntities: Rule = (ctx) => {
  const issues: Issue[] = [];
  const seenSlug = new Map<string, number>();
  for (const e of ctx.project.entities) {
    seenSlug.set(e.id, (seenSlug.get(e.id) ?? 0) + 1);
    // Whether this note reaches players, from the resolver.
    const ships = ctx.noteShips(e.id);
    // The DM build reads an invalid `atlas.visibility` as "dm" (with a
    // warning), so the written value is checked too: the strict player build
    // fails on it (exit 3).
    const writtenVis = (e.frontmatter?.atlas as { visibility?: unknown } | undefined)?.visibility;
    const badVis = !ctx.validVis.has(e.visibility)
      ? e.visibility
      : typeof writtenVis === "string" && !ctx.validVis.has(writtenVis)
        ? writtenVis
        : undefined;
    if (badVis !== undefined) {
      issues.push({
        severity: "blocking",
        code: "invalid-visibility",
        category: "safety",
        message: `Entity "${e.title}" has invalid visibility "${badVis}"`,
        hint: "Visibility must be one of player | dm | hidden | rumor. Unknown values default to dm in the build, but strict mode will fail.",
        scope: { entityId: e.id },
      });
    }
    if (!e.type) {
      issues.push({
        severity: "warning",
        code: "missing-type",
        category: "yaml",
        message: `Entity "${e.title}" has no type`,
        hint: "Add atlas.type in the markdown frontmatter (e.g. settlement, npc, faction).",
        scope: { entityId: e.id },
      });
    }
    if (!e.summary) {
      issues.push({
        severity: "suggestion",
        code: "missing-summary",
        category: "yaml",
        message: `Entity "${e.title}" has no summary`,
        hint: "Add atlas.summary so the side panel and search results have a useful one-liner.",
        scope: { entityId: e.id },
      });
    }
    // DM markup in a player-visible source body. The build strips it, but the
    // source markdown still holds DM notes. Flag it to encourage cleanup.
    const markup = ships ? findDmMarkup(e.body || "") : null;
    if (markup === "%%" || markup === ":::dm") {
      issues.push({
        severity: "warning",
        code: "dm-block-in-player-body",
        category: "safety",
        message: `Player-visible entity "${e.title}" still contains ${markup} DM blocks`,
        hint: "The build strips these, but leaving DM notes in player-visible files is risky if someone reads the source markdown. Move sensitive notes to a DM-only entity.",
        scope: { entityId: e.id },
      });
    }
    // Image embeds (![[image.ext]]) in player-visible body are silently dropped
    // by the player projection (no embed-to-img conversion there). Warn so the
    // DM can fix before publishing.
    if (ships) {
      for (const m of (e.body || "").matchAll(/!\[\[([^[\]\n]+?)\]\]/g)) {
        const target = m[1].split("|")[0].trim();
        if (/\.(?:png|jpe?g|gif|webp|svg|avif)$/i.test(target)) {
          issues.push({
            severity: "warning",
            code: "dropped-image-embed",
            category: "yaml",
            message: `Image embed \`![[${target}]]\` won't appear in the player view.`,
            hint: "Add the image through the editor's image field so it's published with the note.",
            scope: { entityId: e.id },
            actions: [{ kind: "go-entity", label: "Go to note", payload: e.id }],
          });
        }
      }
    }

    // Player-visible wikilinks to a note players don't get (dm/hidden,
    // `publish: false`, or folder-excluded) leak its name. The strict player
    // build redacts them and fails (cross-ref leak, exit 8), so this blocks.
    // Only notes that ship are judged: the build skips the rest.
    if (ships && Array.isArray(e.links)) {
      for (const link of e.links) {
        if (!link.resolvedId) continue;
        if (ctx.noteShips(link.resolvedId)) continue;
        const target = ctx.entityById.get(link.resolvedId);
        issues.push({
          severity: "blocking",
          code: "spoiler-leak-wikilink",
          category: "safety",
          message: `Player-visible "${e.title}" wikilinks to "${target?.title ?? link.resolvedId}", which players don't get (${describeHiddenTarget(target)})`,
          hint: "The strict player build fails on this: the link text names the hidden note. Rewrite the sentence or remove the link.",
          scope: { entityId: e.id },
        });
      }
    }
    // Broken wikilinks in player-visible entities render as dead, non-clickable
    // text to players. Aggregate all broken targets into one suggestion per
    // entity so the Publish Check stays sleek (not one issue per link).
    if (ships && Array.isArray(e.links)) {
      const broken = e.links.filter((l) => l.broken);
      if (broken.length > 0) {
        const CAP = 3;
        const listed = broken
          .slice(0, CAP)
          .map((l) => `[[${l.target}]]`)
          .join(", ");
        const extra = broken.length > CAP ? ` …and ${broken.length - CAP} more` : "";
        issues.push({
          severity: "suggestion",
          code: "broken-wikilink",
          category: "yaml",
          message: `Players will see dead text for ${broken.length} broken link${broken.length === 1 ? "" : "s"} in "${e.title}": ${listed}${extra}.`,
          hint: "Create the linked note, fix the spelling, or remove the link so players don't see dead text.",
          scope: { entityId: e.id },
          actions: [{ kind: "go-entity", label: "Open note", payload: e.id }],
        });
      }
    }
    // Player-visible relationships pointing at DM-only entities leak too.
    if (ships && Array.isArray(e.relationships)) {
      for (const rel of e.relationships) {
        // Schema field is `entity` (the target slug). Older code used `targetId`
        // — accept both for back-compat with any in-flight YAML.
        const targetId =
          (rel as { entity?: string }).entity ?? (rel as { targetId?: string }).targetId;
        const relVis = (rel as { visibility?: string }).visibility ?? "player";
        if (!targetId) continue;
        if (!ctx.entityIds.has(targetId)) {
          issues.push({
            severity: "warning",
            code: "relationship-unresolved",
            category: "yaml",
            message: `Entity "${e.title}" has relationship to unknown "${targetId}"`,
            scope: { entityId: e.id },
          });
        }
        // As the build's filterRelationshipsForPlayer: a player-visible
        // relationship to a note that doesn't ship (unknown ones included) is
        // a relationship leak, which fails the strict player build (exit 5).
        // Only on notes that ship: the build skips the rest.
        if (ctx.playerVisibleVis.has(relVis) && !ctx.noteShips(targetId)) {
          issues.push({
            severity: "blocking",
            code: "spoiler-leak-relationship",
            category: "safety",
            message: `Player-visible relationship on "${e.title}" points to "${targetId}", which players don't get (${describeHiddenTarget(ctx.entityById.get(targetId))})`,
            hint: "Either mark the relationship visibility: dm, or unlink it. The strict player build fails on it (relationship leak).",
            scope: { entityId: e.id },
          });
        }
      }
    }
  }
  for (const [slug, count] of seenSlug) {
    if (count > 1) {
      issues.push({
        severity: "blocking",
        code: "duplicate-slug",
        category: "yaml",
        message: `${count} entities share slug "${slug}"`,
        hint: "Two markdown files produce the same slug. Rename one or set atlas.id to disambiguate.",
        scope: { entityId: slug },
      });
    }
  }
  return { issues };
};

// 4b. What the resolver itself reports: a project it can't resolve, orphan
// `notes:` entries, and sound areas fog keeps from players.
const checkWhatShips: Rule = (ctx) => {
  const issues: Issue[] = [];
  if (!ctx.resolution) {
    issues.push({
      severity: "blocking",
      code: "visibility-unresolved",
      category: "safety",
      message: `Couldn't work out what reaches players: ${ctx.resolutionError ?? "unknown error"}`,
      hint: "Until this is fixed the Publish Check treats every note as hidden: note checks are skipped and every region or route that links a note is flagged. Fix the problem named here (often two maps sharing an id) first.",
    });
    return { issues };
  }
  for (const o of ctx.resolution.orphanEntries) {
    issues.push({
      severity: "blocking",
      code: "orphan-notes-entry",
      category: "safety",
      message: `world.yaml of world "${o.world}" has a notes: entry "${o.entry}" that matches no note of that world`,
      hint: "A typo, a renamed note or an entry in the wrong world: the note it was meant to narrow may ship. Fix the key to the note's id, or remove the entry.",
    });
  }
  for (const m of ctx.project.maps) {
    for (const a of m.soundscape?.areas ?? []) {
      if (a.regionId) continue; // ride-on areas follow their region
      const fogged = verdictsFor(ctx.resolution.sound, m.id, a.id).some(
        (v) => v.reason === "fogged",
      );
      if (!fogged) continue;
      issues.push({
        // The player build asks the same resolver and leaves this area out
        // (arch-02, R-11b); the build doesn't fail on it, so neither does this.
        severity: "warning",
        code: "sound-area-fogged",
        category: "map",
        message: `Sound area "${a.name ?? a.id}" is left out of the player atlas: part of its shape is under fog, so players won't hear it`,
        hint: "Reveal its whole shape in the Fog tab, or shrink it to the revealed part, so it keeps playing for players.",
        scope: { mapId: m.id },
      });
    }
  }
  return { issues };
};

// 5. Draft placement checks: known map, in-bounds coords
const checkDraftPlacements: Rule = (ctx) => {
  const issues: Issue[] = [];
  for (const p of ctx.draftPlacements) {
    if (!ctx.mapIds.has(p.mapId)) {
      issues.push({
        severity: "blocking",
        code: "unknown-map",
        category: "draft",
        message: `Placement targets unknown map "${p.mapId}"`,
        scope: { mapId: p.mapId, entityId: p.entityId },
      });
      continue;
    }
    if (!ctx.entityIds.has(p.entityId)) {
      issues.push({
        severity: "warning",
        code: "unknown-entity",
        category: "draft",
        message: `Placement for unknown entity "${p.entityId}"`,
        scope: { entityId: p.entityId },
      });
      continue;
    }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      issues.push({
        severity: "blocking",
        code: "invalid-coord",
        category: "draft",
        message: `Placement for "${p.entityId}" has non-numeric coords`,
        scope: { entityId: p.entityId },
      });
      continue;
    }
    const m = ctx.project.maps.find((mm) => mm.id === p.mapId)!;
    if (p.x < 0 || p.y < 0 || p.x > m.width || p.y > m.height) {
      issues.push({
        severity: "warning",
        code: "pin-out-of-bounds",
        category: "draft",
        message: `Pin for "${p.entityId}" is outside map bounds (${p.x},${p.y} on ${m.width}×${m.height})`,
        hint: "Drag the pin back onto the map in the Pins tab, or adjust the map's width/height.",
        scope: { entityId: p.entityId, mapId: p.mapId },
      });
    }
  }
  return { issues };
};

// 6. Draft layer asset checks
const checkDraftLayers: Rule = (ctx) => {
  const issues: Issue[] = [];
  if (ctx.draftMap && ctx.draftLocalLayers.length) {
    for (const l of ctx.draftLocalLayers) {
      if (l.origin === "upload" && !l.dataUrl && !l.src.startsWith("blob:")) {
        issues.push({
          severity: "warning",
          code: "missing-asset",
          category: "map",
          message: `Uploaded layer "${l.id}" has no preview data — re-upload before exporting`,
          scope: { mapId: ctx.draftMap.id },
        });
      }
      if (/^https?:\/\//i.test(l.src)) {
        issues.push({
          severity: "suggestion",
          code: "external-asset-draft",
          category: "map",
          message: `Layer "${l.id}" uses an external URL — won't work offline`,
          scope: { mapId: ctx.draftMap.id },
        });
      }
    }
  }
  return { issues };
};

// 7. (Removed) Draft/export staleness. The Export Patch flow was removed —
// the unified Save writes drafts straight to disk, so a "not exported"
// warning would point at a button that no longer exists. Surfacing unsaved
// draft state is the job of the save-status UI, not the validator.
const checkUploadedAssetsPending: Rule = (ctx) => {
  const issues: Issue[] = [];
  if (ctx.draftLocalLayers.some((l) => l.origin === "upload")) {
    issues.push({
      severity: "suggestion",
      code: "uploaded-assets-pending",
      category: "draft",
      message: `Uploaded map images are local until you Save`,
      hint: "Click Save — the image files are written alongside world.yaml.",
    });
  }
  return { issues };
};

// 8. Build-report-derived passed checks (atlas was built recently / safe)
const checkBuildReport: Rule = (ctx) => {
  const passed: string[] = [];
  const br = ctx.project.buildReport;
  if (br) {
    if (br.brokenLinks === 0) passed.push("No broken wikilinks in build");
    if ((br.duplicateSlugs ?? 0) === 0) passed.push("No duplicate slugs in build");
    if ((br.missingAssets ?? 0) === 0) passed.push("All map assets present in build");
    if ((br.externalAssets ?? 0) === 0) passed.push("No external map assets in build");
  }
  return { passed };
};

/**
 * Ordered list of checks. Order matters: it fixes the order issues appear in
 * the report and the report markdown, so keep new rules in a sensible slot
 * rather than appending blindly.
 */
const RULES: Rule[] = [
  checkMapIdUniqueness,
  checkMapLayers,
  checkRegionsAndRoutes,
  checkEntities,
  checkWhatShips,
  checkDraftPlacements,
  checkDraftLayers,
  checkUploadedAssetsPending,
  checkBuildReport,
];

export function validateProject(opts: ValidateProjectOpts): ValidationReport {
  const { project, draftPlacements, draftMap, draftLocalLayers = [] } = opts;

  const entityById = new Map(project.entities.map((e) => [e.id, e] as const));
  let resolution: CampaignResolution | null = null;
  let resolutionError: string | undefined;
  try {
    resolution = resolveProject(project);
  } catch (e) {
    resolutionError = e instanceof Error ? e.message : String(e);
  }
  const noteVerdicts = new Map<string, boolean>();
  for (const v of resolution?.notes ?? []) {
    noteVerdicts.set(v.id, (noteVerdicts.get(v.id) ?? true) && v.ships);
  }
  const ctx: ValidationContext = {
    project,
    draftPlacements,
    draftMap,
    draftLocalLayers,
    mapIds: new Set(project.maps.map((m) => m.id)),
    entityIds: new Set(project.entities.map((e) => e.id)),
    resolution,
    resolutionError,
    noteShips: (id) => noteVerdicts.get(id) === true,
    playerVisibleVis: new Set<string>(PLAYER_VISIBLE_VISIBILITY),
    validVis: new Set<string>(VALID_VISIBILITY),
    entityById,
  };

  const issues: Issue[] = [];
  const passedChecks: string[] = [];
  for (const rule of RULES) {
    const out = rule(ctx);
    if (out.issues) issues.push(...out.issues);
    if (out.passed) passedChecks.push(...out.passed);
  }

  const counts = {
    blocking: issues.filter((i) => i.severity === "blocking").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    suggestion: issues.filter((i) => i.severity === "suggestion").length,
  };

  if (counts.blocking === 0) passedChecks.push("No blocking issues");
  if (counts.warning === 0) passedChecks.push("No warnings");
  if (!issues.some((i) => i.code.startsWith("spoiler-leak")))
    passedChecks.push("No DM-content leakage detected");

  return {
    issues,
    counts,
    passedChecks,
    meta: {
      generatedAt: new Date().toISOString(),
      atlasVersion: project.version,
      builtAt: project.publishedAt,
      entityCount: project.entities.length,
      mapCount: project.maps.length,
      draftPlacementCount: draftPlacements.length,
      pendingAssetCount: draftLocalLayers.filter((l) => l.origin === "upload").length,
    },
  };
}

/** Build a downloadable Markdown publish report (for handoff / archival). */
export function buildPublishReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`# Atlas Publish Check`);
  lines.push("");
  lines.push(`Generated: ${report.meta.generatedAt}`);
  if (report.meta.atlasVersion) lines.push(`Atlas version: \`${report.meta.atlasVersion}\``);
  if (report.meta.builtAt) lines.push(`Built at: ${report.meta.builtAt}`);
  lines.push(`Entities: ${report.meta.entityCount} · Maps: ${report.meta.mapCount}`);
  lines.push(
    `Draft placements: ${report.meta.draftPlacementCount} · Pending uploads: ${report.meta.pendingAssetCount}`,
  );
  lines.push("");
  lines.push(
    `**${report.counts.blocking} blocking · ${report.counts.warning} warnings · ${report.counts.suggestion} suggestions**`,
  );
  lines.push("");
  for (const sev of ["blocking", "warning", "suggestion"] as const) {
    const list = report.issues.filter((i) => i.severity === sev);
    if (!list.length) continue;
    lines.push(`## ${sev.charAt(0).toUpperCase()}${sev.slice(1)} (${list.length})`);
    lines.push("");
    for (const i of list) {
      const where = i.scope?.mapId
        ? ` _(map: ${i.scope.mapId})_`
        : i.scope?.entityId
          ? ` _(entity: ${i.scope.entityId})_`
          : "";
      lines.push(`- **[${i.code}]** ${i.message}${where}`);
      if (i.hint) lines.push(`  - ${i.hint}`);
    }
    lines.push("");
  }
  if (report.passedChecks.length) {
    lines.push(`## Passed`);
    lines.push("");
    for (const p of report.passedChecks) lines.push(`- ✅ ${p}`);
  }
  return lines.join("\n");
}

/** Stable category ordering used by the dashboard. */
export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  safety: "Player Safety",
  yaml: "YAML & Content",
  map: "Maps & Geometry",
  draft: "Drafts & Export",
};
