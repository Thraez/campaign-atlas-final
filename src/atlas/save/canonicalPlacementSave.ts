/**
 * Build canonical entity-frontmatter changes for placement drafts.
 *
 * The /atlas/edit save flow used to write a side YAML patch file under
 * content/<world>/_atlas/ that the build script never consumed — the DM had
 * to copy it into the entity .md frontmatter by hand. This helper closes
 * the loop: for each draft, it reads the entity's current .md (via the
 * dev-only /__atlas/read endpoint), patches `atlas.placements` while
 * preserving placements on other maps, and returns FileChange[] suitable
 * for the existing /__atlas/save endpoint.
 *
 * Mirrors the merge rules in scripts/apply-placements.ts:
 *   - placements on maps NOT in this draft are preserved
 *   - placements on maps that ARE in this draft are replaced
 *   - legacy atlas.x / atlas.y are removed once a placements[] is written
 *     (single source of truth)
 *
 * Each FileChange carries the `baseHash` of the .md file at read time so
 * the Save endpoint can detect "the file changed under us" before writing.
 */
import type { Entity } from "@/atlas/content/schema";
import type { PinOverride } from "@/atlas/pins/presets";
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";
import type { FileChange } from "./localFsSave";
import { hashContent } from "./localFsSave";
import { isWritableSourcePath } from "./sourcePathAllowlist";

export interface PlacementDraft {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
  label?: string;
  pin?: PinOverride;
}

export class CanonicalSaveError extends Error {
  constructor(message: string, public readonly entityId?: string) {
    super(message);
    this.name = "CanonicalSaveError";
  }
}

export interface CanonicalSaveDeps {
  /** Defaults to global fetch. Injectable for tests. */
  fetchFn?: typeof fetch;
}

/** Fetch the current on-disk contents of an allowlisted source file. */
async function readSourceFile(
  relPath: string,
  fetchFn: typeof fetch,
): Promise<string> {
  if (!isWritableSourcePath(relPath)) {
    throw new CanonicalSaveError(`Path not in source allowlist: ${relPath}`);
  }
  const url = `/__atlas/read?path=${encodeURIComponent(relPath)}`;
  const res = await fetchFn(url, { method: "GET" });
  if (res.status === 404) {
    throw new CanonicalSaveError(`Source file not found: ${relPath}`);
  }
  if (!res.ok) {
    throw new CanonicalSaveError(`Failed to read ${relPath}: status ${res.status}`);
  }
  const body = (await res.json()) as { contents?: unknown };
  if (typeof body.contents !== "string") {
    throw new CanonicalSaveError(`Malformed read response for ${relPath}`);
  }
  return body.contents;
}

/** Internal: merge a set of per-map drafts into an entity's parsed frontmatter. */
export function mergePlacementsIntoFrontmatter(
  data: Record<string, unknown>,
  drafts: PlacementDraft[],
): Record<string, unknown> {
  const atlas = ((data.atlas as Record<string, unknown>) ?? {});
  const existing = Array.isArray(atlas.placements)
    ? (atlas.placements as Array<Record<string, unknown>>)
    : [];

  const touchedMapIds = new Set(drafts.map((d) => d.mapId));
  const preserved = existing.filter(
    (e) => typeof e.mapId === "string" && !touchedMapIds.has(e.mapId),
  );

  const fresh = drafts.map((d) => {
    const o: Record<string, unknown> = { mapId: d.mapId, x: d.x, y: d.y };
    if (d.label) o.label = d.label;
    if (d.pin && Object.keys(d.pin).length > 0) o.pin = d.pin;
    return o;
  });

  const next = [...preserved, ...fresh].sort((a, b) =>
    String(a.mapId).localeCompare(String(b.mapId)),
  );

  const nextAtlas: Record<string, unknown> = { ...atlas, placements: next };
  // Legacy x/y is now redundant — drop it so we don't carry two sources of truth.
  delete nextAtlas.x;
  delete nextAtlas.y;

  return { ...data, atlas: nextAtlas };
}

/**
 * Build FileChange[] for the supplied placement drafts. One entry per
 * affected entity .md file. Existing placements on maps not in the draft
 * set are preserved. Each FileChange's `baseHash` is the SHA-256 of the
 * .md content at read time — the Save endpoint uses it to refuse writes
 * when the source file has changed under the editor (see A5 conflict
 * protection in the Phase 1A plan).
 *
 * @throws CanonicalSaveError if any entity has no sourcePath (e.g. the
 *   editor was loaded against a player build, which strips it).
 */
export async function buildCanonicalPlacementChanges(
  drafts: PlacementDraft[],
  entitiesById: Map<string, Entity>,
  deps?: CanonicalSaveDeps,
): Promise<FileChange[]> {
  if (drafts.length === 0) return [];
  const fetchFn = deps?.fetchFn ?? fetch;

  // Group drafts by entity. One file write per entity, however many maps it
  // appears on in the draft set.
  const byEntity = new Map<string, PlacementDraft[]>();
  for (const d of drafts) {
    const list = byEntity.get(d.entityId) ?? [];
    list.push(d);
    byEntity.set(d.entityId, list);
  }

  const changes: FileChange[] = [];
  for (const [entityId, entityDrafts] of byEntity) {
    const entity = entitiesById.get(entityId);
    if (!entity) {
      throw new CanonicalSaveError(`Unknown entity: ${entityId}`, entityId);
    }
    const sourcePath = entity.sourcePath;
    if (!sourcePath) {
      // Player builds strip sourcePath. The editor only runs in dev builds,
      // but guard so a misconfigured fetch doesn't silently drop edits.
      throw new CanonicalSaveError(
        `Entity "${entity.title}" has no sourcePath. Rebuild the atlas in DM mode (npm run atlas:build) before editing.`,
        entityId,
      );
    }

    const currentRaw = await readSourceFile(sourcePath, fetchFn);
    const baseHash = await hashContent(currentRaw);
    const parsed = parseFrontmatter(currentRaw);
    const nextData = mergePlacementsIntoFrontmatter(parsed.data, entityDrafts);
    const nextRaw = stringifyFrontmatter(parsed.content, nextData);
    changes.push({ path: sourcePath, content: nextRaw, kind: "entity-md", baseHash });
  }

  return changes;
}
