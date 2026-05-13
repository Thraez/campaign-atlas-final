/**
 * Validate generated YAML patches BEFORE the user downloads them.
 *
 * This is the safety net for the "tool generates YAML, never asks the DM to
 * write it" contract. If we ever produce malformed YAML, we want to catch it
 * here — not after the DM has pasted it into world.yaml and broken the build.
 *
 * Rules enforced:
 *  - Must be parseable as YAML.
 *  - Must NOT contain markdown code fences (```), which `loadWorldConfig`
 *    rejects at build time.
 *  - For map patches: must contain a `maps:` array with at least one entry
 *    holding a string `id`.
 *  - For placement patches: each `atlas:` block must have a `placements:`
 *    array of `{mapId, x, y}` objects.
 *
 * Comments (`# ...`) are allowed and stripped before structural checks.
 */

import yaml from "js-yaml";

export type PatchKind = "map" | "placement" | "settings" | "world-map" | "entity-frontmatter";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const FENCE_RE = /^\s*```/m;

export function validatePatchYaml(content: string, kind: PatchKind): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (FENCE_RE.test(content)) {
    errors.push("Patch contains a markdown code fence (```). Strip fences before pasting into world.yaml.");
  }

  // Split out non-comment YAML chunks. Patches may concatenate multiple
  // documents separated by blank lines + comment headers per entity.
  const chunks = splitYamlChunks(content);
  if (chunks.length === 0) {
    errors.push("Patch is empty after removing comments.");
    return { ok: false, errors, warnings };
  }

  let firstError: string | null = null;
  let parsed: unknown[] = [];
  for (const chunk of chunks) {
    try {
      // Frontmatter blocks commonly use `---` document delimiters; loadAll
      // accepts both single- and multi-document streams without throwing on
      // the "expected a single document" case.
      const docs = yaml.loadAll(chunk);
      for (const d of docs) if (d !== undefined && d !== null) parsed.push(d);
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
  }
  if (firstError) errors.push(`YAML parse error: ${firstError}`);

  if (kind === "map" || kind === "settings" || kind === "world-map") {
    const mapsDoc = parsed.find((d): d is { maps: unknown } =>
      !!d && typeof d === "object" && Array.isArray((d as { maps?: unknown }).maps)
    );
    if (!mapsDoc) {
      errors.push("Map patch must contain a top-level `maps:` array.");
    } else {
      const arr = (mapsDoc as { maps: Array<Record<string, unknown>> }).maps;
      if (arr.length === 0) errors.push("`maps:` array is empty.");
      for (const m of arr) {
        if (typeof m?.id !== "string" || !m.id) {
          errors.push("Each map entry must have a string `id`.");
          break;
        }
      }
    }
  }

  if (kind === "placement") {
    const placementDocs = parsed.filter((d): d is { atlas: { placements: unknown } } =>
      !!d && typeof d === "object" &&
      typeof (d as { atlas?: unknown }).atlas === "object" &&
      Array.isArray((d as { atlas: { placements?: unknown } }).atlas.placements)
    );
    if (placementDocs.length === 0) {
      errors.push("Placement patch must contain at least one `atlas: { placements: [...] }` block.");
    }
    for (const doc of placementDocs) {
      const ps = doc.atlas.placements as Array<Record<string, unknown>>;
      for (const p of ps) {
        if (typeof p?.mapId !== "string") {
          warnings.push("A placement is missing `mapId` — it will fall back to the default map.");
        }
        if (typeof p?.x !== "number" || typeof p?.y !== "number") {
          errors.push("Each placement must have numeric `x` and `y`.");
          break;
        }
      }
    }
  }

  if (kind === "entity-frontmatter") {
    const VALID_VIS = new Set(["player", "dm", "hidden", "rumor"]);
    const blocks = parsed.filter(
      (d): d is Record<string, unknown> => !!d && typeof d === "object" && !Array.isArray(d)
    );
    if (blocks.length === 0) {
      errors.push("Entity-frontmatter patch must contain at least one frontmatter block.");
    }
    for (const block of blocks) {
      const atlas = (block as { atlas?: unknown }).atlas;
      if (atlas === undefined) {
        // Top-level title-only blocks are tolerated (some imports stage title before atlas), but warn.
        warnings.push("Frontmatter block has no `atlas:` section.");
        continue;
      }
      if (!atlas || typeof atlas !== "object" || Array.isArray(atlas)) {
        errors.push("`atlas:` must be a mapping (object).");
        continue;
      }
      const a = atlas as Record<string, unknown>;
      if (a.visibility !== undefined && (typeof a.visibility !== "string" || !VALID_VIS.has(a.visibility))) {
        errors.push(`atlas.visibility must be one of player|dm|hidden|rumor (got "${String(a.visibility)}").`);
      }
      if (a.type !== undefined && typeof a.type !== "string") {
        errors.push("atlas.type must be a string.");
      }
      if (a.summary !== undefined && typeof a.summary !== "string") {
        warnings.push("atlas.summary should be a string.");
      }
      if (a.aliases !== undefined && !Array.isArray(a.aliases)) {
        errors.push("atlas.aliases must be an array.");
      }
      if (a.images !== undefined && !Array.isArray(a.images)) {
        errors.push("atlas.images must be an array.");
      }
      if (a.placements !== undefined) {
        if (!Array.isArray(a.placements)) {
          errors.push("atlas.placements must be an array.");
        } else {
          for (const p of a.placements as Array<Record<string, unknown>>) {
            if (typeof p?.mapId !== "string") warnings.push("atlas.placements[].mapId should be a string.");
            if (typeof p?.x !== "number" || typeof p?.y !== "number") {
              errors.push("atlas.placements[] entries must have numeric x and y.");
              break;
            }
          }
        }
      }
      if (a.relationships !== undefined && !Array.isArray(a.relationships)) {
        errors.push("atlas.relationships must be an array.");
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Split a multi-section patch into individual YAML documents. The export
 * format intersperses `# entity:` comment headers between blocks, so we
 * group lines by blank-line + comment-header boundaries.
 */
function splitYamlChunks(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const chunks: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    // Drop chunks that are entirely comments / empty.
    const hasYaml = text.split("\n").some((l) => l.trim() && !l.trim().startsWith("#"));
    if (hasYaml) chunks.push(text);
    buf = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" && buf.length === 0) continue;
    if (trimmed.startsWith("# entity:") || trimmed.startsWith("# file:")) {
      // entity header marks a new document boundary.
      if (buf.some((l) => l.trim() && !l.trim().startsWith("#"))) flush();
      continue;
    }
    if (trimmed.startsWith("#")) continue;
    buf.push(line);
  }
  flush();
  return chunks;
}
