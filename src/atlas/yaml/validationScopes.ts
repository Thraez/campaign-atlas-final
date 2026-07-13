/**
 * Per-scope (pin/map/region/route) validation-issue counting.
 *
 * Extracted verbatim out of AtlasPlacementEditor, which uses these counts to
 * badge each tab in the Publish Check dashboard with its blocking/warning
 * totals. Pure, no I/O — see validateProject.ts for how issues are produced.
 */
import type { Issue } from "@/atlas/yaml/validateProject";

export interface ScopeCounts {
  blocking: number;
  warning: number;
}

export interface ValidationScopes {
  pinIssues: ScopeCounts;
  mapIssues: ScopeCounts;
  regionIssues: ScopeCounts;
  routeIssues: ScopeCounts;
}

export function buildValidationScopes(issues: Issue[]): ValidationScopes {
  const issuesByScope = (predicate: (i: Issue) => boolean): ScopeCounts => {
    const list = issues.filter(predicate);
    return {
      blocking: list.filter((i) => i.severity === "blocking").length,
      warning: list.filter((i) => i.severity === "warning").length,
    };
  };
  const pinIssues = issuesByScope(
    (i) =>
      i.code.includes("placement") || i.code === "pin-out-of-bounds" || i.code === "invalid-coord",
  );
  const mapIssues = issuesByScope(
    (i) =>
      i.code === "duplicate-layer-id" ||
      i.code === "empty-map" ||
      i.code === "missing-asset" ||
      i.code === "external-asset" ||
      i.code === "invalid-layer-size" ||
      i.code === "missing-layer-src" ||
      i.code === "route-no-scale",
  );
  const regionIssues = issuesByScope(
    (i) => i.code.includes("region") || i.code === "spoiler-leak-region",
  );
  const routeIssues = issuesByScope((i) => i.code.includes("route"));

  return { pinIssues, mapIssues, regionIssues, routeIssues };
}
