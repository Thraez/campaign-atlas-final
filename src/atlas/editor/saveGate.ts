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
 *  - The "nothing to save" gate: when dirty placements, frontmatter patches,
 *    and the world.yaml dirty flag are all empty, the caller shows "No changes
 *    to save" and must NOT open the multi-file diff modal.
 *
 * Pure and synchronous — no React, no toast, no disk. The page wires the result
 * to its toast / modal; tests assert the result directly.
 */
import type { Entity } from "@/atlas/content/schema";
import type { EntityFrontmatterPatch } from "@/atlas/yaml/buildPatches";
import { entityFrontmatterPatches, type FrontmatterDraft } from "@/atlas/save/canonicalEntitySave";
import { filterDirtyPlacements } from "./dirtyPlacements";

export interface SavePlanInput<TDraft extends { entityId: string }> {
  /** Every effective placement on the active map (canon + local overrides). */
  allDraftPlacements: readonly TDraft[];
  /** Session override map; key presence (`${mapId}:${entityId}`) marks a placement dirty. */
  overrides: Record<string, unknown>;
  activeMapId: string;
  /** Entities-tab frontmatter drafts, keyed by entity id. */
  entityDrafts: Record<string, FrontmatterDraft>;
  projectEntities: Entity[];
  /** True when any map / region / route / fog / layer tab has a dirty draft. */
  worldYamlDirty: boolean;
}

export interface SavePlan<TDraft> {
  /** Placements the DM actually overrode this session (B3 gate applied). */
  dirtyPlacements: TDraft[];
  /** Frontmatter patches derived from the Entities-tab drafts. */
  frontmatterPatches: EntityFrontmatterPatch[];
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
  const frontmatterPatches = entityFrontmatterPatches(input.entityDrafts, input.projectEntities);
  const isEmpty =
    dirtyPlacements.length === 0 &&
    frontmatterPatches.length === 0 &&
    !input.worldYamlDirty;
  return { dirtyPlacements, frontmatterPatches, isEmpty };
}
