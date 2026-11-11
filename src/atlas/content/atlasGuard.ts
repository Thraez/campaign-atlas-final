// Runtime validation for the built atlas artifacts.
//
// atlas.json / search-index.json are the app's most-traveled boundary: they
// are fetched over the network and were previously blind-cast to their types.
// A stale, truncated, or wrong file then crashed somewhere deep and confusing
// (e.g. "cannot read 'maps' of undefined") instead of failing here with a
// message the DM can act on. These guards run once per load and turn a bad
// artifact into a clear "rebuild the atlas" error.

import type { AtlasProject } from "./schema";
import type { SearchIndexEntry } from "./loader";
// Single source of truth for the schema version the build stamps into the
// artifact — imported (not re-declared) so runtime and build cannot drift.
import { MAX_ATLAS_SCHEMA_VERSION } from "../../../scripts/atlas/schemaVersion";

/** Top-level lists an AtlasProject must always carry (possibly empty). */
const REQUIRED_ARRAYS = ["worlds", "maps", "entities", "placements", "assets"] as const;

/**
 * Validate a parsed atlas.json payload and return it typed as AtlasProject.
 * Throws an Error with an actionable, DM-readable message when the payload is
 * not a usable atlas.
 */
export function parseAtlasProject(data: unknown, source = "atlas.json"): AtlasProject {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      `${source} is not a valid atlas file (expected a JSON object). ` +
        `It may be corrupt, truncated, or the wrong file — rebuild the atlas.`,
    );
  }

  const obj = data as Record<string, unknown>;

  const sv = obj.schemaVersion;
  if (sv !== undefined) {
    if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 1) {
      throw new Error(
        `${source} has an invalid schemaVersion (${JSON.stringify(sv)}). Rebuild the atlas.`,
      );
    }
    if (sv > MAX_ATLAS_SCHEMA_VERSION) {
      throw new Error(
        `${source} was built for schema v${sv}, but this app only understands up to ` +
          `v${MAX_ATLAS_SCHEMA_VERSION}. Update the app, or rebuild the atlas with a matching version.`,
      );
    }
  }

  if (typeof obj.version !== "string") {
    throw new Error(
      `${source} is missing its build version stamp — it looks incomplete. Rebuild the atlas.`,
    );
  }

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(obj[key])) {
      throw new Error(
        `${source} is missing the "${key}" list — it looks incomplete or from an older ` +
          `format. Rebuild the atlas.`,
      );
    }
  }

  dropMalformedV2Fields(obj);

  return data as AtlasProject;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validOcean(v: unknown): boolean {
  return (
    isRecord(v) &&
    isNum(v.width) &&
    v.width > 0 &&
    isNum(v.height) &&
    v.height > 0 &&
    typeof v.sea === "string" &&
    Array.isArray(v.onOcean)
  );
}

function validPlacement(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.map === "string" &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.scale) &&
    v.scale > 0 &&
    isNum(v.rotation)
  );
}

function validFrame(v: unknown): boolean {
  return (
    isRecord(v) &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.width) &&
    v.width > 0 &&
    isNum(v.height) &&
    v.height > 0 &&
    isNum(v.rotation)
  );
}

function validZoom(v: unknown): boolean {
  return isRecord(v) && isNum(v.min) && isNum(v.max) && v.min <= v.max;
}

/**
 * Type-check the optional schema v2 output fields (ocean, campaign, and each
 * map's parent, frame, enterZoom, zoom). A malformed one is dropped, not fatal: the
 * map tree then leaves out whatever depended on it (fail closed). Edits the
 * freshly parsed payload in place; a well-formed payload is untouched.
 */
function dropMalformedV2Fields(obj: Record<string, unknown>): void {
  if (obj.ocean !== undefined) {
    if (!validOcean(obj.ocean)) delete obj.ocean;
    else {
      const ocean = obj.ocean as { onOcean: unknown[] };
      if (!ocean.onOcean.every(validPlacement)) ocean.onOcean = ocean.onOcean.filter(validPlacement);
    }
  }
  if (
    obj.campaign !== undefined &&
    !(isRecord(obj.campaign) && typeof obj.campaign.id === "string" && typeof obj.campaign.name === "string")
  ) {
    delete obj.campaign;
  }
  for (const m of obj.maps as unknown[]) {
    if (!isRecord(m)) continue;
    if (m.parent !== undefined && typeof m.parent !== "string") delete m.parent;
    if (m.frame !== undefined && !validFrame(m.frame)) delete m.frame;
    if (m.enterZoom !== undefined && !isNum(m.enterZoom)) delete m.enterZoom;
    if (m.zoom !== undefined && !validZoom(m.zoom)) delete m.zoom;
  }
}

/**
 * Validate a parsed search-index.json payload (a flat list of entries).
 */
export function parseSearchIndex(data: unknown, source = "search-index.json"): SearchIndexEntry[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `${source} is not a valid search index (expected a list). It may be corrupt — rebuild the atlas.`,
    );
  }
  // Every entry must carry the core searchable fields. A truncated or
  // wrong-format file often parses as an array of the wrong shape, which would
  // otherwise crash deep in the search UI; fail here with an actionable message.
  data.forEach((entry, i) => {
    const e = entry as Record<string, unknown> | null;
    if (
      !e ||
      typeof e !== "object" ||
      typeof e.id !== "string" ||
      typeof e.title !== "string" ||
      typeof e.type !== "string"
    ) {
      throw new Error(
        `${source} entry ${i} is missing required id/title/type fields — it looks corrupt or ` +
          `from an older format. Rebuild the atlas.`,
      );
    }
  });
  return data as SearchIndexEntry[];
}
