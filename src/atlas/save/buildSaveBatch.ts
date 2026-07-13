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

export interface BuildWorldYamlContentInputs {
  /** The map whose layers/regions/routes/fog get the draft overlay applied. */
  activeMap: MapDocument;
  /** Every map in the project (canon). Only the entry matching `activeMap.id`
   *  is replaced; every other map is passed through byte-identical. */
  maps: MapDocument[];
  calendar?: WorldCalendar;
  schemaVersion?: number;
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
    const target = local.targetPath ?? `public/atlas/assets/maps/${l.id}.png`;
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
    existing: existingRaw,
    credits,
    assetCredits,
  });
}

/**
 * Build the asset-binary FileChange entries for every upload-origin layer
 * on the active map. Each carries the upload's dataUrl (which the layer
 * captured when the file was dragged in) plus its targetPath under
 * public/atlas/assets/maps/. Uploads with no dataUrl (rare — quota
 * pressure clears it from localStorage on reload) are skipped silently;
 * the world.yaml emission still references them so the DM sees the
 * mismatch in the diff modal.
 */
export function buildAssetBinaryChanges(localLayers: LocalLayer[]): FileChange[] {
  const changes: FileChange[] = [];
  for (const local of localLayers) {
    if (local.origin !== "upload") continue;
    if (!local.dataUrl) continue;
    const target = local.targetPath ?? `public/atlas/assets/maps/${local.id}.png`;
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
