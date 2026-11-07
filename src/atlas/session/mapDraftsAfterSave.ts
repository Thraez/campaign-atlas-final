/**
 * eval-30: which map drafts a save clears, as pure functions the editor's
 * `onSaved` uses (and tests cover without mounting the page).
 *
 * world.yaml holds every project map, so a save that wrote it has written
 * every project map's layer, metadata and region/route/fog drafts. Drafts kept
 * under an id the project no longer has (a renamed or removed map: an orphan)
 * were not written; they are left as they are, never silently deleted.
 */
import { slicesDirtyCount, type MapSlices } from "./useEditorSession";

const EMPTY = { edits: {}, added: [], deleted: [] };

export interface MapDraftStores<L, M> {
  /** Layer drafts by map (`useMapLayers`' store). */
  layerByMap: Record<string, L[]>;
  /** Map metadata drafts by map. */
  mapOverride: Record<string, M | undefined>;
  /** Region/route/fog drafts by map (`session.mapDrafts()`). */
  slices: Record<string, MapSlices>;
}

/** Ids that hold a non-empty draft in any store. */
export function draftMapIds<L, M>(d: MapDraftStores<L, M>): string[] {
  const ids = new Set<string>();
  for (const [id, layers] of Object.entries(d.layerByMap)) if (layers.length > 0) ids.add(id);
  for (const [id, o] of Object.entries(d.mapOverride))
    if (o && Object.keys(o as object).length > 0) ids.add(id);
  for (const [id, sl] of Object.entries(d.slices)) if (slicesDirtyCount(sl) > 0) ids.add(id);
  return [...ids].sort();
}

/** Ids holding a draft that are not in the project's maps. */
export function orphanDraftMapIds<L, M>(
  d: MapDraftStores<L, M>,
  projectMapIds: readonly string[],
): string[] {
  return draftMapIds(d).filter((id) => !projectMapIds.includes(id));
}

export interface MapDraftsAfterSave<L, M> {
  /** Maps whose drafts this save wrote (and so are now clean). */
  writtenMapIds: string[];
  nextLayerByMap: Record<string, L[]>;
  nextMapOverride: Record<string, M | undefined>;
  /** Clean region/route/fog slices for the written maps that had any: what
   *  the save-boundary redo puts back via `session.restoreOtherMapDrafts`. */
  cleanSlices: Record<string, MapSlices>;
}

export function mapDraftsAfterSave<L, M>(
  worldYamlWritten: boolean,
  projectMapIds: readonly string[],
  pre: MapDraftStores<L, M>,
): MapDraftsAfterSave<L, M> {
  if (!worldYamlWritten) {
    return {
      writtenMapIds: [],
      nextLayerByMap: pre.layerByMap,
      nextMapOverride: pre.mapOverride,
      cleanSlices: {},
    };
  }
  const nextLayerByMap = { ...pre.layerByMap };
  const nextMapOverride = { ...pre.mapOverride };
  const cleanSlices: Record<string, MapSlices> = {};
  for (const id of projectMapIds) {
    delete nextLayerByMap[id];
    delete nextMapOverride[id];
    if (id in pre.slices) cleanSlices[id] = { region: EMPTY, route: EMPTY, fog: null };
  }
  return { writtenMapIds: [...projectMapIds], nextLayerByMap, nextMapOverride, cleanSlices };
}
