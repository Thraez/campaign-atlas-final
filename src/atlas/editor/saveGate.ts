/**
 * The editor's single save-gate decision, lifted out of AtlasPlacementEditor's
 * onSaveClick so it can be exercised without mounting the (Leaflet-heavy) page.
 *
 * Save asks one question before opening the review modal: "is there anything to
 * write, and if so, which placements?" Two QA findings live in that answer:
 *
 *  - B3: only the placements the DM actually overrode this session are queued
 *    (filterDirtyPlacements). buildDraftPlacements() returns a draft for every
 *    *effective* placement — saving all of them would rewrite every placed
 *    entity's .md on every Save even when nothing changed.
 *  - The "nothing to save" gate: when dirty placements and the world.yaml dirty
 *    flag are both empty, the caller shows "No changes to save" and must NOT
 *    open the multi-file diff modal.
 *
 * Pure and synchronous — no React, no toast, no disk. The page wires the result
 * to its toast / modal; tests assert the result directly.
 */
import type { Entity } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { FileChange } from "@/atlas/save/localFsSave";
import type { WorldYamlBaseline } from "@/atlas/save/useWorldYamlBaseline";
import { buildAssetBinaryChanges } from "@/atlas/save/buildSaveBatch";
import {
  buildCanonicalPlacementChanges,
  type CanonicalSaveDeps,
  type PlacementDraft,
} from "@/atlas/save/canonicalPlacementSave";
import { filterDirtyPlacements } from "./dirtyPlacements";

export interface SavePlanInput<TDraft extends { entityId: string }> {
  /** Every effective placement on the active map (canon + local overrides). */
  allDraftPlacements: readonly TDraft[];
  /** Session override map; key presence (`${mapId}:${entityId}`) marks a placement dirty. */
  overrides: Record<string, unknown>;
  activeMapId: string;
  /** True when any map / region / route / fog / layer tab has a dirty draft. */
  worldYamlDirty: boolean;
}

export interface SavePlan<TDraft> {
  /** Placements the DM actually overrode this session (B3 gate applied). */
  dirtyPlacements: TDraft[];
  /** True when there is genuinely nothing to write. */
  isEmpty: boolean;
}

export function buildSavePlan<TDraft extends { entityId: string }>(
  input: SavePlanInput<TDraft>,
): SavePlan<TDraft> {
  const dirtyPlacements = filterDirtyPlacements(
    input.allDraftPlacements,
    input.overrides,
    input.activeMapId,
  );
  const isEmpty = dirtyPlacements.length === 0 && !input.worldYamlDirty;
  return { dirtyPlacements, isEmpty };
}

export interface UnifiedSaveState {
  /** Every effective placement on the active map (canon + local overrides). */
  allDraftPlacements: readonly PlacementDraft[];
  /** Session override map; key presence (`${mapId}:${entityId}`) marks a placement dirty. */
  overrides: Record<string, unknown>;
  activeMapId: string;
  /** N100: overrides keyed to a map other than the active one. */
  foreignMapDrafts: readonly PlacementDraft[];
  entitiesById: Map<string, Entity>;
  /** True when any map / region / route / fog / layer tab has a dirty draft. */
  worldYamlDirty: boolean;
  /** world.yaml path for the active world, or null when there is none. */
  worldYamlPath: string | null;
  worldYamlBaseline: Pick<WorldYamlBaseline, "loading" | "error" | "hash">;
  /** Called only once every refusal check has passed. */
  buildWorldYamlContent: () => string | null;
  /** The active map's local layers; upload-origin ones need their bytes. */
  localLayers: readonly LocalLayer[];
  deps?: CanonicalSaveDeps;
}

export type UnifiedSavePlan =
  | { kind: "nothing-to-save"; message: string }
  | { kind: "refused"; reason: string; detail?: string }
  | { kind: "save"; changes: FileChange[] };

/**
 * The whole unified Save decision: which files to write, or why to write none.
 * A refusal carries no changes, so the page cannot write half a batch.
 *
 * eval-12: an upload-origin layer with no `dataUrl` (localStorage quota clears
 * it on reload) refuses the save; world.yaml would otherwise point at a file
 * whose bytes never land. Refusal checks run before any entity file is read.
 *
 * Throws CanonicalSaveError when an entity .md can't be rewritten (unchanged).
 */
export async function planUnifiedSave(state: UnifiedSaveState): Promise<UnifiedSavePlan> {
  const plan = buildSavePlan({
    allDraftPlacements: state.allDraftPlacements,
    overrides: state.overrides,
    activeMapId: state.activeMapId,
    worldYamlDirty: state.worldYamlDirty,
  });
  if (plan.isEmpty && state.foreignMapDrafts.length === 0) {
    return { kind: "nothing-to-save", message: "No changes to save" };
  }

  const worldYamlPath = state.worldYamlDirty ? state.worldYamlPath : null;
  if (worldYamlPath !== null) {
    const { loading, error } = state.worldYamlBaseline;
    if (loading) {
      return {
        kind: "refused",
        reason: "Still loading world.yaml baseline — try again in a moment.",
      };
    }
    if (error) return { kind: "refused", reason: `Cannot save world.yaml: ${error}` };
    const missing = state.localLayers.filter((l) => l.origin === "upload" && !l.dataUrl);
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
    state.deps,
  );

  if (worldYamlPath !== null) {
    const content = state.buildWorldYamlContent();
    if (!content) return { kind: "refused", reason: "Cannot build world.yaml content" };
    // Asset bytes land before the world.yaml that references them; the
    // endpoint's temp+rename rolls the batch back together on failure.
    changes.push(...buildAssetBinaryChanges([...state.localLayers]));
    changes.push({
      path: worldYamlPath,
      content,
      kind: "world-yaml",
      // null when world.yaml doesn't yet exist (fresh world → create-only write).
      baseHash: state.worldYamlBaseline.hash,
    });
  }

  if (changes.length === 0) {
    return { kind: "nothing-to-save", message: "No canonical changes to write" };
  }
  return { kind: "save", changes };
}
