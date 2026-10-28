/**
 * Shared draft shapes for the editor's Save flow.
 *
 * {@link PlacementOverride} is the placement-draft shape consumed by
 * validateProject and the placement editor.
 */

// --------------------------------------------------------------------------
// PLACEMENT OVERRIDE — contract between the placement editor and
// validateProject. Save writes placements via canonicalPlacementSave.ts.
// --------------------------------------------------------------------------

export interface PlacementOverride {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
  /** Optional label override (defaults to entity.title at render time). */
  label?: string;
  /** Optional pin styling — only diff vs. the type preset is emitted. */
  pin?: import("@/atlas/pins/presets").PinOverride;
}
