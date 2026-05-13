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

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  /** Where in the editor the problem lives. */
  scope?: { mapId?: string; entityId?: string };
}

export interface ValidationReport {
  issues: Issue[];
  counts: Record<Exclude<Severity, "passed">, number>;
  passedChecks: string[];
}

export interface ValidateProjectOpts {
  project: AtlasProject;
  /** Drafts the DM is about to export. */
  draftPlacements: PlacementOverride[];
  draftMap?: MapDocument;
  draftLocalLayers?: LocalLayer[];
}

export function validateProject(opts: ValidateProjectOpts): ValidationReport {
  const issues: Issue[] = [];
  const passedChecks: string[] = [];
  const { project, draftPlacements, draftMap, draftLocalLayers = [] } = opts;

  const mapIds = new Set(project.maps.map((m) => m.id));
  const entityIds = new Set(project.entities.map((e) => e.id));
  const dmEntityIds = new Set(
    project.entities.filter((e) => e.visibility === "dm" || e.visibility === "hidden").map((e) => e.id)
  );
  const validVis = new Set(["player", "dm", "hidden", "rumor"]);

  // 1. Duplicate map IDs across project
  const seenMap = new Set<string>();
  for (const m of project.maps) {
    if (seenMap.has(m.id)) issues.push({ severity: "blocking", code: "duplicate-map-id", message: `Duplicate map id "${m.id}"` });
    seenMap.add(m.id);
  }
  if (!seenMap.size || project.maps.length === seenMap.size) passedChecks.push("Unique map IDs");

  // 2. Per-map: duplicate layer IDs, empty maps, layer asset checks
  for (const m of project.maps) {
    const seen = new Set<string>();
    for (const l of m.layers) {
      if (seen.has(l.id)) issues.push({ severity: "blocking", code: "duplicate-layer-id", message: `Duplicate layer "${l.id}" in map "${m.id}"`, scope: { mapId: m.id } });
      seen.add(l.id);
    }
    if (m.layers.length === 0) {
      issues.push({ severity: "warning", code: "empty-map", message: `Map "${m.name}" has no layers`, scope: { mapId: m.id } });
    }
  }

  // 3. Region/route uniqueness + geometry checks
  const seenRegion = new Set<string>();
  for (const m of project.maps) {
    for (const r of m.regions ?? []) {
      if (seenRegion.has(r.id)) issues.push({ severity: "blocking", code: "duplicate-region-id", message: `Duplicate region "${r.id}"`, scope: { mapId: m.id } });
      seenRegion.add(r.id);
      if (r.points.length < 3) issues.push({ severity: "blocking", code: "region-too-few-points", message: `Region "${r.name}" has fewer than 3 points`, scope: { mapId: m.id } });
      if (r.entityId && !entityIds.has(r.entityId)) {
        issues.push({ severity: "warning", code: "unknown-entity", message: `Region "${r.name}" references unknown entity "${r.entityId}"`, scope: { mapId: m.id } });
      }
      if (r.visibility === "player" && r.entityId && dmEntityIds.has(r.entityId)) {
        issues.push({ severity: "blocking", code: "spoiler-leak", message: `Player-visible region "${r.name}" links to DM-only entity "${r.entityId}"`, scope: { mapId: m.id, entityId: r.entityId } });
      }
    }
    const seenRoute = new Set<string>();
    for (const route of m.routes ?? []) {
      if (seenRoute.has(route.id)) issues.push({ severity: "blocking", code: "duplicate-route-id", message: `Duplicate route "${route.id}"`, scope: { mapId: m.id } });
      seenRoute.add(route.id);
      if (route.waypoints.length < 2) issues.push({ severity: "blocking", code: "route-too-few-waypoints", message: `Route "${route.name}" has fewer than 2 waypoints`, scope: { mapId: m.id } });
      for (const w of route.waypoints) {
        if (typeof w === "object" && "entityId" in w && !entityIds.has(w.entityId)) {
          issues.push({ severity: "warning", code: "unknown-entity", message: `Route "${route.name}" references unknown entity "${w.entityId}"`, scope: { mapId: m.id } });
        }
      }
    }
  }

  // 4. Entity visibility sanity
  for (const e of project.entities) {
    if (!validVis.has(e.visibility)) {
      issues.push({ severity: "blocking", code: "invalid-visibility", message: `Entity "${e.title}" has invalid visibility "${e.visibility}"`, scope: { entityId: e.id } });
    }
  }

  // 5. Draft placement checks: known map, in-bounds coords
  for (const p of draftPlacements) {
    if (!mapIds.has(p.mapId)) {
      issues.push({ severity: "blocking", code: "unknown-map", message: `Placement targets unknown map "${p.mapId}"`, scope: { mapId: p.mapId, entityId: p.entityId } });
      continue;
    }
    if (!entityIds.has(p.entityId)) {
      issues.push({ severity: "warning", code: "unknown-entity", message: `Placement for unknown entity "${p.entityId}"`, scope: { entityId: p.entityId } });
      continue;
    }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      issues.push({ severity: "blocking", code: "invalid-coord", message: `Placement for "${p.entityId}" has non-numeric coords`, scope: { entityId: p.entityId } });
      continue;
    }
    const m = project.maps.find((mm) => mm.id === p.mapId)!;
    if (p.x < 0 || p.y < 0 || p.x > m.width || p.y > m.height) {
      issues.push({ severity: "warning", code: "out-of-bounds", message: `Placement for "${p.entityId}" is outside map bounds (${p.x},${p.y} on ${m.width}×${m.height})`, scope: { entityId: p.entityId, mapId: p.mapId } });
    }
  }

  // 6. Draft layer asset checks
  if (draftMap && draftLocalLayers.length) {
    for (const l of draftLocalLayers) {
      if (l.origin === "upload" && !l.dataUrl && !l.src.startsWith("blob:")) {
        issues.push({ severity: "warning", code: "missing-asset", message: `Uploaded layer "${l.id}" has no preview data — re-upload before exporting`, scope: { mapId: draftMap.id } });
      }
      if (/^https?:\/\//i.test(l.src)) {
        issues.push({ severity: "suggestion", code: "external-asset", message: `Layer "${l.id}" uses an external URL — won't work offline`, scope: { mapId: draftMap.id } });
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
