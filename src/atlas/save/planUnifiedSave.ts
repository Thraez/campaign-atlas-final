/**
 * The unified Save batch: which files the editor's Save writes, or why it
 * writes none. Lifted out of AtlasPlacementEditor's onSaveClick (eval-12) so it
 * can be tested without mounting the page.
 *
 * Pure apart from two things the caller supplies: `deps.fetchFn`, which reads
 * the current entity .md files, and `worldYaml.buildContent`, which composes
 * world.yaml from the page's draft state. No React, no toast, no writes.
 */
import type { Entity } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { FileChange } from "@/atlas/save/localFsSave";
import type { WorldYamlBaseline } from "@/atlas/save/useWorldYamlBaseline";
import { buildAssetBinaryChanges, uploadsMissingBytes } from "@/atlas/save/buildSaveBatch";
import {
  buildCanonicalPlacementChanges,
  type PlacementDraft,
} from "@/atlas/save/canonicalPlacementSave";
import { buildSavePlan } from "@/atlas/editor/saveGate";

export interface UnifiedSaveState {
  /** Every effective placement on the active map (canon + local overrides). */
  allDraftPlacements: readonly PlacementDraft[];
  /** Session override map; key presence (`${mapId}:${entityId}`) marks a placement dirty. */
  overrides: Record<string, unknown>;
  activeMapId: string;
  /** N100: overrides keyed to a map other than the active one. */
  foreignMapDrafts: readonly PlacementDraft[];
  entitiesById: Map<string, Entity>;
  /** null when no map / region / route / fog / layer tab has a dirty draft. */
  worldYaml: null | {
    /** world.yaml path for the active world; null when there is no active world. */
    path: string | null;
    baseline: Pick<WorldYamlBaseline, "loading" | "error" | "hash">;
    /** Called only once every refusal check has passed. */
    buildContent: () => string | null;
  };
  /** The active map's local layers; upload-origin ones need their bytes. */
  localLayers: readonly LocalLayer[];
}

export interface UnifiedSaveDeps {
  /** Reads the current entity .md files the placement changes rewrite. */
  fetchFn: typeof fetch;
}

export type UnifiedSavePlan =
  | { kind: "nothing-to-save"; message: string }
  | { kind: "refused"; reason: string; detail?: string }
  | { kind: "save"; changes: FileChange[] };

/**
 * A refusal carries no changes, so the page cannot write half a batch.
 *
 * eval-12: an upload-origin layer with no `dataUrl` (localStorage quota clears
 * it on reload) refuses the save; world.yaml would otherwise point at a file
 * whose bytes never land. Refusal checks run before any entity file is read.
 *
 * Throws CanonicalSaveError when an entity .md can't be rewritten (unchanged).
 */
export async function planUnifiedSave(
  state: UnifiedSaveState,
  deps: UnifiedSaveDeps,
): Promise<UnifiedSavePlan> {
  const { worldYaml } = state;
  const plan = buildSavePlan({
    allDraftPlacements: state.allDraftPlacements,
    overrides: state.overrides,
    activeMapId: state.activeMapId,
    worldYamlDirty: worldYaml !== null,
  });
  if (plan.isEmpty && state.foreignMapDrafts.length === 0) {
    return { kind: "nothing-to-save", message: "No changes to save" };
  }

  // Dirty map edits with no active world have nowhere to go; as before, they
  // are left out of the batch.
  const yamlPath = worldYaml?.path ?? null;
  if (worldYaml && yamlPath !== null) {
    const { loading, error } = worldYaml.baseline;
    if (loading) {
      return {
        kind: "refused",
        reason: "Still loading world.yaml baseline — try again in a moment.",
      };
    }
    if (error) return { kind: "refused", reason: `Cannot save world.yaml: ${error}` };
    const missing = uploadsMissingBytes(state.localLayers);
    if (missing.length > 0) {
      const n = missing.length;
      return {
        kind: "refused",
        reason: `Save refused: ${n} uploaded image${n === 1 ? " has" : "s have"} no bytes`,
        detail: `Likely cleared by localStorage quota. Re-upload before saving: ${missing
          .map((l) => l.filename ?? l.id)
          .join(", ")}`,
      };
    }
  }

  // One FileChange per entity .md path, however many maps it is placed on.
  const changes: FileChange[] = await buildCanonicalPlacementChanges(
    [...plan.dirtyPlacements, ...state.foreignMapDrafts],
    state.entitiesById,
    { fetchFn: deps.fetchFn },
  );

  if (worldYaml && yamlPath !== null) {
    const content = worldYaml.buildContent();
    if (!content) return { kind: "refused", reason: "Cannot build world.yaml content" };
    // Asset bytes land before the world.yaml that references them; the
    // endpoint's temp+rename rolls the batch back together on failure.
    changes.push(...buildAssetBinaryChanges(state.localLayers));
    changes.push({
      path: yamlPath,
      content,
      kind: "world-yaml",
      // null when world.yaml doesn't yet exist (fresh world → create-only write).
      baseHash: worldYaml.baseline.hash,
    });
  }

  if (changes.length === 0) {
    return {
      kind: "nothing-to-save",
      message:
        worldYaml && yamlPath === null
          ? "Map changes not saved: no active world to write world.yaml for"
          : "No canonical changes to write",
    };
  }
  return { kind: "save", changes };
}
