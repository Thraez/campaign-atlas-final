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
import { CURRENT_ATLAS_SCHEMA_VERSION } from "../../../scripts/atlas/schemaVersion";

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
    if (sv > CURRENT_ATLAS_SCHEMA_VERSION) {
      throw new Error(
        `${source} was built for schema v${sv}, but this app only understands up to ` +
          `v${CURRENT_ATLAS_SCHEMA_VERSION}. Update the app, or rebuild the atlas with a matching version.`,
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

  return data as AtlasProject;
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
