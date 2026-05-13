/**
 * Project-wide validation with severity levels.
 *
 * Used by the central Export DM Changes modal to give the DM a single
 * "what would break / what should I look at" report. Pure, no I/O.
 */
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { PlacementOverride } from "./buildPatches";

export type Severity = "blocking" | "warning" | "suggestion" | "passed";

export type IssueCategory = "safety" | "yaml" | "map" | "draft";

export interface IssueAction {
  /** "go-entity" | "go-map" | "show-fix" | "export-patch" */
  kind: "go-entity" | "go-map" | "show-fix" | "export-patch";
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
    lastExportAt: number | null;
  };
}

export interface ValidateProjectOpts {
  project: AtlasProject;
  /** Drafts the DM is about to export. */
  draftPlacements: PlacementOverride[];
  draftMap?: MapDocument;
  draftLocalLayers?: LocalLayer[];
  /** Last patch export timestamp (ms). Used to flag un-exported drafts. */
  lastExportAt?: number | null;
}

export function validateProject(opts: ValidateProjectOpts): ValidationReport {
  const issues: Issue[] = [];
  const passedChecks: string[] = [];
  const { project, draftPlacements, draftMap, draftLocalLayers = [], lastExportAt = null } = opts;

  const mapIds = new Set(project.maps.map((m) => m.id));
  const entityIds = new Set(project.entities.map((e) => e.id));
  const dmEntityIds = new Set(
    project.entities.filter((e) => e.visibility === "dm" || e.visibility === "hidden").map((e) => e.id)
  );
  const playerVisibleVis = new Set(["player", "rumor"]);
  const validVis = new Set(["player", "dm", "hidden", "rumor"]);
  const entityById = new Map(project.entities.map((e) => [e.id, e] as const));

  // 1. Duplicate map IDs across project
  const seenMap = new Set<string>();
  for (const m of project.maps) {
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
  if (!seenMap.size || project.maps.length === seenMap.size) passedChecks.push("Unique map IDs");

  // 2. Per-map: duplicate layer IDs, empty maps, layer asset checks
  for (const m of project.maps) {
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

  // 3. Region/route uniqueness + geometry checks
  const seenRegion = new Set<string>();
  for (const m of project.maps) {
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
      if (r.entityId && !entityIds.has(r.entityId)) {
        issues.push({
          severity: "warning",
          code: "unknown-entity",
          category: "yaml",
          message: `Region "${r.name}" references unknown entity "${r.entityId}"`,
          hint: "The linked entity does not exist. Either create the markdown file, fix the slug, or unlink in the Regions tab.",
          scope: { mapId: m.id, entityId: r.entityId },
        });
      }
      if (r.visibility === "player" && r.entityId && dmEntityIds.has(r.entityId)) {
        issues.push({
          severity: "blocking",
          code: "spoiler-leak-region",
          category: "safety",
          message: `Player-visible region "${r.name}" links to DM-only entity "${r.entityId}"`,
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
          if (!entityIds.has(w.entityId)) {
            issues.push({
              severity: "warning",
              code: "route-waypoint-unresolved",
              category: "map",
              message: `Route "${route.name}" references unknown entity "${w.entityId}"`,
              hint: "Fix the entity slug, create the markdown file, or replace the waypoint with raw coordinates.",
              scope: { mapId: m.id, entityId: w.entityId },
            });
          } else if (route.visibility === "player" && dmEntityIds.has(w.entityId)) {
            issues.push({
              severity: "blocking",
              code: "spoiler-leak-route",
              category: "safety",
              message: `Player-visible route "${route.name}" routes through DM-only entity "${w.entityId}"`,
              hint: "The waypoint label would expose the DM-only entity to players. Hide the route or replace the waypoint with raw coordinates.",
              scope: { mapId: m.id, entityId: w.entityId },
            });
          }
        }
      }
    }
  }

  // 4. Entity visibility sanity, duplicate slugs, missing summaries/types
  const seenSlug = new Map<string, number>();
  for (const e of project.entities) {
    seenSlug.set(e.id, (seenSlug.get(e.id) ?? 0) + 1);
    if (!validVis.has(e.visibility)) {
      issues.push({
        severity: "blocking",
        code: "invalid-visibility",
        category: "safety",
        message: `Entity "${e.title}" has invalid visibility "${e.visibility}"`,
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
    // DM block leakage in body — %% ... %% should already be stripped by the
    // build, but if any literal "%%" pair remains in a player-visible entity
    // it will be visible. Flag it as a suggestion to encourage cleanup.
    if (playerVisibleVis.has(e.visibility) && /%%[\s\S]+?%%/.test(e.body || "")) {
      issues.push({
        severity: "warning",
        code: "dm-block-in-player-body",
        category: "safety",
        message: `Player-visible entity "${e.title}" still contains %% DM blocks %%`,
        hint: "The build strips these, but leaving DM notes in player-visible files is risky if someone reads the source markdown. Move sensitive notes to a DM-only entity.",
        scope: { entityId: e.id },
      });
    }
    // Player-visible wikilinks pointing at DM-only entities leak titles via
    // tooltips / autocomplete. The strict build already drops them but warn.
    if (playerVisibleVis.has(e.visibility) && Array.isArray(e.links)) {
      for (const link of e.links) {
        if (link.resolvedId && dmEntityIds.has(link.resolvedId)) {
          const target = entityById.get(link.resolvedId);
          issues.push({
            severity: "warning",
            code: "wikilink-to-dm",
            category: "safety",
            message: `Player-visible "${e.title}" wikilinks to DM-only entity "${target?.title ?? link.resolvedId}"`,
            hint: "The link text would be rendered as plain text in the player build, but consider rewriting it so players don't see hints about hidden content.",
            scope: { entityId: e.id },
          });
        }
      }
    }
    // Player-visible relationships pointing at DM-only entities leak too.
    if (playerVisibleVis.has(e.visibility) && Array.isArray(e.relationships)) {
      for (const rel of e.relationships) {
        const targetId = (rel as { targetId?: string }).targetId;
        const relVis = (rel as { visibility?: string }).visibility ?? "player";
        if (!targetId) continue;
        if (!entityIds.has(targetId)) {
          issues.push({
            severity: "warning",
            code: "relationship-unresolved",
            category: "yaml",
            message: `Entity "${e.title}" has relationship to unknown "${targetId}"`,
            scope: { entityId: e.id },
          });
        } else if (playerVisibleVis.has(relVis) && dmEntityIds.has(targetId)) {
          issues.push({
            severity: "blocking",
            code: "spoiler-leak-relationship",
            category: "safety",
            message: `Player-visible relationship on "${e.title}" points to DM-only entity "${targetId}"`,
            hint: "Either mark the relationship visibility: dm, or unlink it. The strict player build will drop it but flagging here prevents accidental hints.",
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

  // 5. Draft placement checks: known map, in-bounds coords
  for (const p of draftPlacements) {
    if (!mapIds.has(p.mapId)) {
      issues.push({
        severity: "blocking",
        code: "unknown-map",
        category: "draft",
        message: `Placement targets unknown map "${p.mapId}"`,
        scope: { mapId: p.mapId, entityId: p.entityId },
      });
      continue;
    }
    if (!entityIds.has(p.entityId)) {
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
    const m = project.maps.find((mm) => mm.id === p.mapId)!;
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

  // 6. Draft layer asset checks
  if (draftMap && draftLocalLayers.length) {
    for (const l of draftLocalLayers) {
      if (l.origin === "upload" && !l.dataUrl && !l.src.startsWith("blob:")) {
        issues.push({
          severity: "warning",
          code: "missing-asset",
          category: "map",
          message: `Uploaded layer "${l.id}" has no preview data — re-upload before exporting`,
          scope: { mapId: draftMap.id },
        });
      }
      if (/^https?:\/\//i.test(l.src)) {
        issues.push({
          severity: "suggestion",
          code: "external-asset-draft",
          category: "map",
          message: `Layer "${l.id}" uses an external URL — won't work offline`,
          scope: { mapId: draftMap.id },
        });
      }
    }
  }

  // 7. Draft / export staleness
  if (draftPlacements.length > 0) {
    if (!lastExportAt) {
      issues.push({
        severity: "warning",
        code: "draft-not-exported",
        category: "draft",
        message: `${draftPlacements.length} draft placement(s) have never been exported`,
        hint: "Click Export DM Changes to download a YAML patch you can commit.",
      });
    } else if (Date.now() - lastExportAt > 1000 * 60 * 30) {
      issues.push({
        severity: "suggestion",
        code: "export-stale",
        category: "draft",
        message: `Last export was over 30 minutes ago — drafts may be stale`,
      });
    }
  }
  if (draftLocalLayers.some((l) => l.origin === "upload")) {
    issues.push({
      severity: "suggestion",
      code: "uploaded-assets-pending",
      category: "draft",
      message: `Uploaded map images are local-only until you download the asset zip`,
      hint: "Use Export DM Changes → asset zip, then commit the files under public/atlas/assets/maps/.",
    });
  }

  // 8. Build-report-derived passed checks (atlas was built recently / safe)
  const br = project.buildReport;
  if (br) {
    if (br.brokenLinks === 0) passedChecks.push("No broken wikilinks in build");
    if ((br.duplicateSlugs ?? 0) === 0) passedChecks.push("No duplicate slugs in build");
    if ((br.missingAssets ?? 0) === 0) passedChecks.push("All map assets present in build");
    if ((br.externalAssets ?? 0) === 0) passedChecks.push("No external map assets in build");
  }

  const counts = {
    blocking: issues.filter((i) => i.severity === "blocking").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    suggestion: issues.filter((i) => i.severity === "suggestion").length,
  };

  if (counts.blocking === 0) passedChecks.push("No blocking issues");
  if (counts.warning === 0) passedChecks.push("No warnings");
  if (!issues.some((i) => i.code.startsWith("spoiler-leak"))) passedChecks.push("No DM-content leakage detected");

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
      lastExportAt,
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
  lines.push(`Draft placements: ${report.meta.draftPlacementCount} · Pending uploads: ${report.meta.pendingAssetCount}`);
  lines.push("");
  lines.push(`**${report.counts.blocking} blocking · ${report.counts.warning} warnings · ${report.counts.suggestion} suggestions**`);
  lines.push("");
  for (const sev of ["blocking", "warning", "suggestion"] as const) {
    const list = report.issues.filter((i) => i.severity === sev);
    if (!list.length) continue;
    lines.push(`## ${sev.charAt(0).toUpperCase()}${sev.slice(1)} (${list.length})`);
    lines.push("");
    for (const i of list) {
      const where = i.scope?.mapId ? ` _(map: ${i.scope.mapId})_` : i.scope?.entityId ? ` _(entity: ${i.scope.entityId})_` : "";
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

function _unused() {
  // intentional no-op to keep helper exports clean for tree-shaking
  return null;
}
/* eslint-disable @typescript-eslint/no-unused-vars */
function _legacy_endmarker(opts: ValidateProjectOpts) {
  const { project, draftPlacements, draftLocalLayers = [] } = opts;
  const issues: Issue[] = [];
  const counts = {
    blocking: 0,
    warning: 0,
    suggestion: 0,
  };
  return { issues, counts, passedChecks: [] };
}
/* eslint-enable @typescript-eslint/no-unused-vars */
/*
  // legacy returns (preserved during refactor — replaced by structured meta above)
  const counts = {
    blocking: issues.filter((i) => i.severity === "blocking").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    suggestion: issues.filter((i) => i.severity === "suggestion").length,
  };

  if (counts.blocking === 0) passedChecks.push("No blocking issues");
  if (counts.warning === 0) passedChecks.push("No warnings");

  return { issues, counts, passedChecks };
*/
      }
    }
  }

  const counts = {
    blocking: issues.filter((i) => i.severity === "blocking").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    suggestion: issues.filter((i) => i.severity === "suggestion").length,
  };

  if (counts.blocking === 0) passedChecks.push("No blocking issues");
  if (counts.warning === 0) passedChecks.push("No warnings");

  return { issues, counts, passedChecks };
}
