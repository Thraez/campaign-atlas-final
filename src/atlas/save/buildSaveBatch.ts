/**
 * Pure content builders for the unified Save flow, extracted from
 * AtlasPlacementEditor (Task 7, Step 1 of the editor teardown). Each takes
 * explicit inputs instead of reading React state directly — same input,
 * same output, no React, no fetch — so the world.yaml / asset-binary
 * assembly logic can be unit tested without mounting the editor page.
 *
 * The page keeps thin `useCallback` wrappers around these that supply the
 * `!project || !activeMap` null-guard and pull the live values off React
 * state/hooks; onSaveClick calls the wrappers exactly as before.
 */
import type {
  AssetCredit,
  CreditsConfig,
  FogOverlay,
  MapDocument,
  Region,
  Route,
  WorldCalendar,
} from "@/atlas/content/schema";
import { mergeMapLayers, type LocalLayer } from "@/atlas/useMapLayers";
import { applyCollectionDraft } from "@/atlas/editor/useDraftCore";
import type { FileChange } from "@/atlas/save/localFsSave";
import { buildFullWorldYaml } from "@/atlas/yaml/buildFullWorldYaml";
import { mapLayerTargetPath } from "@/atlas/assets/mapLayerTarget";

/**
 * One map's unsaved drafts, as the editor session keeps them per map. Every
 * field is optional: a missing field means "no draft, keep canon".
 */
export interface MapDraft {
  /** Map metadata patch (size, ocean, grid, soundscape...). */
  mapOverride?: Partial<MapDocument>;
  /** Local layer drafts (edits of built-ins, uploads, URL adds). */
  localLayers?: readonly LocalLayer[];
  region?: CollectionDraft<Region>;
  route?: CollectionDraft<Route>;
  /** null = no fog override for this map. */
  fog?: FogOverlay | null;
}

interface CollectionDraft<I> {
  edits: Record<string, Partial<I>>;
  added: I[];
  deleted: string[];
}

export interface BuildWorldYamlContentInputs {
  /** Every map in the project (canon). A map with no entry in `drafts` is
   *  passed through byte-identical. */
  maps: MapDocument[];
  /** Unsaved drafts keyed by map id, for every map (not only the active one). */
  drafts: Record<string, MapDraft>;
  calendar?: WorldCalendar;
  schemaVersion?: number;
  /** Optional world display name; forwarded byte-for-byte, same drift-sensitivity
   *  as `credits` — this is what lets the World Details panel's name edit reach
   *  world.yaml at all. */
  name?: string;
  /** Current on-disk world.yaml contents, or null if it doesn't exist yet —
   *  forwarded to buildFullWorldYaml to preserve the leading comment block. */
  existingRaw: string | null;
  /** Optional site-wide credits config; forwarded byte-for-byte. This is a
   *  known drift-sensitive line — world-level credits MUST keep flowing
   *  through to buildFullWorldYaml or a save silently drops credit badges. */
  credits?: CreditsConfig;
  /** Optional per-asset credit registry; forwarded byte-for-byte, same
   *  drift-sensitivity as `credits`. */
  assetCredits?: Record<string, AssetCredit>;
}

/** A map with its drafts applied, as world.yaml should store it. */
export function applyMapDraft(canon: MapDocument, draft: MapDraft | undefined): MapDocument {
  if (!draft) return canon;
  const base: MapDocument = draft.mapOverride ? { ...canon, ...draft.mapOverride } : canon;
  const out: MapDocument = { ...base };
  if (draft.localLayers && draft.localLayers.length > 0) {
    out.layers = mergeMapLayers(base, draft.localLayers).map((l) => {
      const local = draft.localLayers!.find((ll) => ll.id === l.id);
      if (!local || local.origin !== "upload") return l;
      // upload: rewrite src to the canonical "atlas/assets/maps/<file>" form
      // (strip the public/ prefix). The actual binary is written by the
      // asset-binary FileChange built by buildAssetBinaryChanges.
      return { ...l, src: mapLayerTargetPath(local).replace(/^public\//, "") };
    });
  }
  if (draft.region) out.regions = applyCollectionDraft(base.regions ?? [], draft.region);
  if (draft.route) out.routes = applyCollectionDraft(base.routes ?? [], draft.route);
  if (draft.fog) out.fog = draft.fog;
  return out;
}

/**
 * Compose the full world.yaml content by overlaying the editor's per-map
 * drafts onto the canonical project.maps array. Every map's drafts are
 * applied, not only the active map's: all maps share one world.yaml, so a
 * save that wrote only the active map would drop the others' work.
 *
 * Upload-origin layers (binaries dragged into the browser) get their `src`
 * rewritten to the eventual on-disk path (e.g. `atlas/assets/maps/foo.png`)
 * so the YAML never carries a blob: URL. Their binaries ride along in the
 * save batch as separate `asset-binary` FileChange entries — the build
 * the endpoint runs after writes can then resolve every layer src.
 */
export function buildWorldYamlContent(inputs: BuildWorldYamlContentInputs): string {
  const { maps, drafts, calendar, schemaVersion, name, existingRaw, credits, assetCredits } =
    inputs;
  return buildFullWorldYaml({
    maps: maps.map((m) => applyMapDraft(m, drafts[m.id])),
    calendar,
    schemaVersion,
    name,
    existing: existingRaw,
    credits,
    assetCredits,
  });
}

type UploadWithBytes = LocalLayer & { origin: "upload"; dataUrl: string };

function isUploadWithBytes(layer: LocalLayer): layer is UploadWithBytes {
  return layer.origin === "upload" && !!layer.dataUrl;
}

/**
 * Upload-origin layers whose bytes (`dataUrl`) are gone, e.g. cleared by
 * localStorage quota on reload. buildAssetBinaryChanges skips these and
 * planUnifiedSave refuses the save over them.
 */
export function uploadsMissingBytes(localLayers: readonly LocalLayer[]): LocalLayer[] {
  return localLayers.filter((l) => l.origin === "upload" && !isUploadWithBytes(l));
}

/**
 * Build the asset-binary FileChange entries for every upload-origin layer
 * on the active map. Each carries the upload's dataUrl (which the layer
 * captured when the file was dragged in) plus its targetPath under
 * public/atlas/assets/maps/. Uploads with no dataUrl (rare — quota
 * pressure clears it from localStorage on reload) are skipped here;
 * planUnifiedSave (src/atlas/save/planUnifiedSave.ts) refuses the whole save
 * before this runs, so world.yaml never points at bytes that don't land.
 */
export function buildAssetBinaryChanges(localLayers: readonly LocalLayer[]): FileChange[] {
  const changes: FileChange[] = [];
  for (const local of localLayers.filter(isUploadWithBytes)) {
    const target = mapLayerTargetPath(local);
    changes.push({
      path: target,
      content: local.dataUrl,
      kind: "asset-binary",
      // null = create-only. If the DM has uploaded a file that collides
      // with an existing asset on disk, the endpoint returns 409
      // already-exists and the toast surfaces the path.
      baseHash: null,
    });
  }
  return changes;
}
