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
  MapLayer,
  Region,
  Route,
  WorldCalendar,
} from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { FileChange } from "@/atlas/save/localFsSave";
import { buildFullWorldYaml } from "@/atlas/yaml/buildFullWorldYaml";
import { mapLayerTargetPath } from "@/atlas/assets/mapLayerTarget";

export interface BuildWorldYamlContentInputs {
  /** The map whose layers/regions/routes/fog get the draft overlay applied. */
  activeMap: MapDocument;
  /** Every map in the project (canon). Only the entry matching `activeMap.id`
   *  is replaced; every other map is passed through byte-identical. */
  maps: MapDocument[];
  calendar?: WorldCalendar;
  schemaVersion?: number;
  /** Optional world display name; forwarded byte-for-byte, same drift-sensitivity
   *  as `credits` — this is what lets the World Details panel's name edit reach
   *  world.yaml at all. */
  name?: string;
  /** The active map's layers with local edits/uploads/URL-adds merged in
   *  (`useMapLayers().mergedLayers`). */
  mergedLayers: MapLayer[];
  /** The active map's local layer overrides (`useMapLayers().localLayers`),
   *  used to resolve which merged layers are upload-origin. */
  localLayers: LocalLayer[];
  /** Effective (canon + draft) regions/routes for the active map. */
  regionsEffective: Region[];
  routesEffective: Route[];
  /** Effective fog overlay for the active map. */
  fog: FogOverlay;
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

/**
 * Compose the full world.yaml content for the active world by overlaying
 * the editor's per-tab draft state onto the canonical project.maps array.
 * Other maps in the world stay byte-identical to canon. The active map
 * gets its mapOverride applied with the merged layers and the effective
 * region / route / fog drafts.
 *
 * Upload-origin layers (binaries dragged into the browser) get their `src`
 * rewritten to the eventual on-disk path (e.g. `atlas/assets/maps/foo.png`)
 * so the YAML never carries a blob: URL. Their binaries ride along in the
 * save batch as separate `asset-binary` FileChange entries — the build
 * the endpoint runs after writes can then resolve every layer src.
 */
export function buildWorldYamlContent(inputs: BuildWorldYamlContentInputs): string {
  const {
    activeMap,
    maps,
    calendar,
    schemaVersion,
    name,
    mergedLayers,
    localLayers,
    regionsEffective,
    routesEffective,
    fog,
    existingRaw,
    credits,
    assetCredits,
  } = inputs;
  const remappedLayers: MapLayer[] = mergedLayers.map((l) => {
    const local = localLayers.find((ll) => ll.id === l.id);
    if (!local || local.origin !== "upload") return l;
    // upload: rewrite src to the canonical "atlas/assets/maps/<file>" form
    // (strip the public/ prefix). The actual binary is written by the
    // asset-binary FileChange we add in onSaveClick.
    const target = mapLayerTargetPath(local);
    const src = target.replace(/^public\//, "");
    return { ...l, src };
  });
  const updatedMaps: MapDocument[] = maps.map((m) => {
    if (m.id !== activeMap.id) return m;
    return {
      ...activeMap,
      layers: remappedLayers,
      regions: regionsEffective,
      routes: routesEffective,
      fog,
    };
  });
  return buildFullWorldYaml({
    maps: updatedMaps,
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
