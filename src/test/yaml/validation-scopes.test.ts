/**
 * Coverage for buildValidationScopes — the pure per-scope (pin/map/region/route)
 * issue-count derivation extracted out of AtlasPlacementEditor's tab badges.
 *
 * Deliberately includes issues that match MULTIPLE scopes (e.g. "route-no-scale"
 * is both an exact-match map issue and matches the route scope's `.includes("route")`
 * check) to lock in the current overlap behavior verbatim.
 */
import { describe, it, expect } from "vitest";
import { buildValidationScopes } from "@/atlas/yaml/validationScopes";
import type { Issue } from "@/atlas/yaml/validateProject";

const fixture: Issue[] = [
  // --- pin scope ---
  { severity: "blocking", code: "placement-conflict", message: "placement conflict" },
  { severity: "warning", code: "pin-out-of-bounds", message: "pin out of bounds" },
  { severity: "blocking", code: "invalid-coord", message: "invalid coord" },

  // --- map scope ---
  { severity: "warning", code: "duplicate-layer-id", message: "duplicate layer id" },
  { severity: "blocking", code: "empty-map", message: "empty map" },
  { severity: "warning", code: "missing-asset", message: "missing asset" },
  { severity: "blocking", code: "external-asset", message: "external asset" },
  { severity: "warning", code: "invalid-layer-size", message: "invalid layer size" },
  { severity: "blocking", code: "missing-layer-src", message: "missing layer src" },
  // overlaps map (exact-match) and route (.includes("route"))
  { severity: "warning", code: "route-no-scale", message: "route has no scale" },

  // --- region scope ---
  { severity: "blocking", code: "region-locked", message: "region locked" },
  // matches both the `.includes("region")` and `=== "spoiler-leak-region"` arms
  { severity: "warning", code: "spoiler-leak-region", message: "spoiler leak region" },

  // --- route scope ---
  { severity: "blocking", code: "route-broken", message: "route broken" },

  // --- matches nothing ---
  { severity: "suggestion", code: "unrelated-code", message: "unrelated" },
];

describe("buildValidationScopes", () => {
  it("derives pin/map/region/route counts, honoring overlaps between scopes", () => {
    const scopes = buildValidationScopes(fixture);

    expect(scopes.pinIssues).toEqual({ blocking: 2, warning: 1 });
    expect(scopes.mapIssues).toEqual({ blocking: 3, warning: 4 });
    expect(scopes.regionIssues).toEqual({ blocking: 1, warning: 1 });
    expect(scopes.routeIssues).toEqual({ blocking: 1, warning: 1 });
  });

  it("returns all-zero counts for an empty issue list", () => {
    const scopes = buildValidationScopes([]);

    expect(scopes.pinIssues).toEqual({ blocking: 0, warning: 0 });
    expect(scopes.mapIssues).toEqual({ blocking: 0, warning: 0 });
    expect(scopes.regionIssues).toEqual({ blocking: 0, warning: 0 });
    expect(scopes.routeIssues).toEqual({ blocking: 0, warning: 0 });
  });
});
