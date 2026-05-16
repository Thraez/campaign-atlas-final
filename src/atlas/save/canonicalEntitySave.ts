/**
 * Unified canonical entity-frontmatter save.
 *
 * The DM editor produces two independent streams of edits that both land in
 * the same entity `.md` files:
 *
 *   1. Pin placements (Pins tab) — `atlas.placements[]`.
 *   2. Frontmatter edits (Entities tab) — visibility, summary, aliases,
 *      images, profile, relationships, type.
 *
 * Previously only stream 1 went through the unified Save; stream 2 could
 * only leave the editor via an "Export Patch" download the DM had to apply
 * by hand. This module closes that gap so a single Save writes everything.
 *
 * Correctness requirement: an entity can be edited in BOTH streams in one
 * session. The /__atlas/save endpoint rejects a batch with two entries for
 * the same path (duplicate-path 400). So this builder reads, parses, and
 * hashes each entity's file exactly once, applies the placement merge AND
 * the frontmatter merge to the same parsed document, and emits exactly one
 * FileChange per path.
 */
import type { Entity, EntityVisibility } from "@/atlas/content/schema";
import type { EntityProfile, EntityRelationship } from "@/atlas/profiles/profileTypes";
import { compactProfile } from "@/atlas/profiles/profileBuild";
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";
import type { EntityFrontmatterPatch } from "@/atlas/yaml/buildPatches";
import type { FileChange } from "./localFsSave";
import { hashContent } from "./localFsSave";
import {
  CanonicalSaveError,
  type CanonicalSaveDeps,
  type PlacementDraft,
  mergePlacementsIntoFrontmatter,
  readSourceFile,
} from "./canonicalPlacementSave";

/**
 * Per-entity frontmatter draft, keyed by entity id in the editor. Mirrors
 * the fields the Entities tab can edit. Shared between the tab (which is now
 * a controlled component) and the save builder so the shape can't drift.
 */
export interface FrontmatterDraft {
  visibility?: EntityVisibility;
  summary?: string;
  aliases?: string[];
  images?: string[];
  type?: string;
  profile?: EntityProfile;
  relationships?: EntityRelationship[];
}

/**
 * Derive the canonical `EntityFrontmatterPatch[]` from the editor's draft
 * map. Each patch carries the FULL desired `atlas:` block (drafted value or
 * the entity's current value as fallback) — identical to the logic the
 * Entities tab used for its now-removed export, kept here as the single
 * source of truth.
 */
export function entityFrontmatterPatches(
  drafts: Record<string, FrontmatterDraft>,
  entities: Entity[],
): EntityFrontmatterPatch[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const out: EntityFrontmatterPatch[] = [];
  for (const [id, d] of Object.entries(drafts)) {
    const e = byId.get(id);
    if (!e) continue;
    const profile = compactProfile(d.profile ?? e.profile);
    const relationships = d.relationships ?? e.relationships;
    out.push({
      sourcePath: e.sourcePath,
      title: e.title,
      atlas: {
        id: e.id,
        type: d.type ?? e.type,
        visibility: d.visibility ?? e.visibility,
        summary: d.summary ?? e.summary,
        aliases: d.aliases ?? e.aliases,
        images: d.images ?? e.images,
        profile,
        relationships: relationships?.length ? relationships : undefined,
      },
    });
  }
  return out;
}

/** Merge a frontmatter patch's `atlas:` fields into parsed frontmatter data. */
function mergeFrontmatterFields(
  data: Record<string, unknown>,
  patch: EntityFrontmatterPatch,
): Record<string, unknown> {
  const atlas: Record<string, unknown> = {
    ...((data.atlas as Record<string, unknown>) ?? {}),
  };
  // Same strip rule as buildEntityFrontmatterPatch: omit undefined and empty
  // arrays so we don't write noise. `atlas.placements` is never a patch key,
  // so any placement merge applied earlier is preserved by the spread above.
  for (const [k, v] of Object.entries(patch.atlas)) {
    if (v !== undefined && !(Array.isArray(v) && v.length === 0)) atlas[k] = v;
  }
  const next: Record<string, unknown> = { ...data, atlas };
  if (patch.title && next.title === undefined) next.title = patch.title;
  return next;
}

export interface BuildCanonicalEntityChangesInput {
  /** Pin placement drafts (Pins tab). */
  placements: PlacementDraft[];
  /** Frontmatter patches (Entities tab), via {@link entityFrontmatterPatches}. */
  frontmatter: EntityFrontmatterPatch[];
}

/**
 * Build FileChange[] for the combined placement + frontmatter edits — exactly
 * one entry per affected entity `.md` path. The file is read, parsed, and
 * hashed once; both merges are applied to that single parsed document before
 * it is re-serialized.
 *
 * @throws CanonicalSaveError if an entity is unknown or has no sourcePath
 *   (e.g. the editor was loaded against a player build, which strips it).
 */
export async function buildCanonicalEntityChanges(
  input: BuildCanonicalEntityChangesInput,
  entitiesById: Map<string, Entity>,
  deps?: CanonicalSaveDeps,
): Promise<FileChange[]> {
  const fetchFn = deps?.fetchFn ?? fetch;

  const placementsByEntity = new Map<string, PlacementDraft[]>();
  for (const d of input.placements) {
    const list = placementsByEntity.get(d.entityId) ?? [];
    list.push(d);
    placementsByEntity.set(d.entityId, list);
  }
  const patchByEntity = new Map<string, EntityFrontmatterPatch>();
  for (const p of input.frontmatter) {
    // Patches are keyed to entities by sourcePath; resolve the id so both
    // streams group on the same key.
    const entity = [...entitiesById.values()].find((e) => e.sourcePath === p.sourcePath);
    if (entity) patchByEntity.set(entity.id, p);
  }

  const touchedIds = new Set<string>([
    ...placementsByEntity.keys(),
    ...patchByEntity.keys(),
  ]);
  if (touchedIds.size === 0) return [];

  const changes: FileChange[] = [];
  for (const entityId of touchedIds) {
    const entity = entitiesById.get(entityId);
    if (!entity) {
      throw new CanonicalSaveError(`Unknown entity: ${entityId}`, entityId);
    }
    const sourcePath = entity.sourcePath;
    if (!sourcePath) {
      throw new CanonicalSaveError(
        `Entity "${entity.title}" has no sourcePath. Rebuild the atlas in DM mode (npm run atlas:build) before editing.`,
        entityId,
      );
    }

    const currentRaw = await readSourceFile(sourcePath, fetchFn);
    const baseHash = await hashContent(currentRaw);
    const parsed = parseFrontmatter(currentRaw);

    let data = parsed.data;
    const entityPlacements = placementsByEntity.get(entityId);
    if (entityPlacements && entityPlacements.length > 0) {
      data = mergePlacementsIntoFrontmatter(data, entityPlacements);
    }
    const patch = patchByEntity.get(entityId);
    if (patch) {
      data = mergeFrontmatterFields(data, patch);
    }

    const nextRaw = stringifyFrontmatter(parsed.content, data);
    changes.push({ path: sourcePath, content: nextRaw, kind: "entity-md", baseHash });
  }

  return changes;
}
