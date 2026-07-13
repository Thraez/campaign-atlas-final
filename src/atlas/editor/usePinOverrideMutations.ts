// src/atlas/editor/usePinOverrideMutations.ts
import { useCallback } from "react";
import { toast } from "sonner";
import type { AtlasProject, MapDocument, MapPlacement } from "@/atlas/content/schema";
import { type Overrides, type OverrideValue, overrideKey } from "@/atlas/editor/placementOverrides";
import type { PinOverride } from "@/atlas/pins/presets";

export interface UsePinOverrideMutationsArgs {
  /** Full atlas project (or null before load) — canonPlacement reads
   *  project.placements; duplicateToMap reads project.maps for its toast. */
  project: AtlasProject | null;
  /** Active map (with any in-session map-metadata override folded in). */
  activeMap: MapDocument | undefined;
  /** Current placement-override draft — the page's `overrides` state value. */
  overrides: Overrides;
  /** Page-owned undo-recording setter for `overrides`. The synchronous
   *  `overridesRef` mirror and this setter itself stay page-owned; this hook
   *  only reads the `overrides` state value and calls this setter, so the
   *  ref contract is untouched. */
  setOverridesUndoable: (compute: (prev: Overrides) => Overrides, label: string) => void;
}

export interface UsePinOverrideMutationsResult {
  canonPlacement: (mapId: string, entityId: string) => MapPlacement | null;
  effectivePlacement: (entityId: string) => OverrideValue | null;
  effectiveCoord: (entityId: string) => { x: number; y: number } | null;
  mutateOverride: (entityId: string, patch: Partial<OverrideValue>, label?: string) => void;
  setCoord: (entityId: string, coord: { x: number; y: number }) => void;
  setLabel: (entityId: string, label: string | undefined) => void;
  setPinOverride: (entityId: string, pin: PinOverride | undefined) => void;
  nudge: (entityId: string, dx: number, dy: number) => void;
  removeCoord: (entityId: string) => void;
  clearOverride: (entityId: string) => void;
  duplicateToMap: (entityId: string, targetMapId: string) => void;
}

/**
 * Pin placement resolvers (canon/effective) + the override-mutation API.
 * Moved verbatim out of AtlasPlacementEditor: `overrides` is the page's state
 * value and `setOverridesUndoable` is the page's undo-recording setter — the
 * synchronous `overridesRef` mirror lives in the page and is preserved by
 * routing every write through the passed-in setter.
 */
export function usePinOverrideMutations({
  project,
  activeMap,
  overrides,
  setOverridesUndoable,
}: UsePinOverrideMutationsArgs): UsePinOverrideMutationsResult {
  /** Read-only canon placement (built YAML value) for an entity on a map. */
  const canonPlacement = useCallback(
    (mapId: string, entityId: string) => {
      if (!project) return null;
      return project.placements.find((p) => p.entityId === entityId && p.mapId === mapId) ?? null;
    },
    [project],
  );

  /** Resolve effective placement values on the active map: local override wins, else canon. */
  const effectivePlacement = useCallback(
    (entityId: string): OverrideValue | null => {
      if (!activeMap) return null;
      const k = overrideKey(activeMap.id, entityId);
      if (k in overrides) {
        const v = overrides[k];
        return v;
      }
      const p = canonPlacement(activeMap.id, entityId);
      if (!p) return null;
      return { x: p.x, y: p.y, label: p.label, pin: p.pin as PinOverride | undefined };
    },
    [overrides, canonPlacement, activeMap],
  );

  const effectiveCoord = useCallback(
    (entityId: string): { x: number; y: number } | null => {
      const e = effectivePlacement(entityId);
      return e ? { x: e.x, y: e.y } : null;
    },
    [effectivePlacement],
  );

  /** Merge a partial override into the local draft. Undoable.
   *
   *  A "current" baseline is normally either a prior override or the canon
   *  placement. For a brand-new pin (no canon, no prior override), the caller
   *  must supply both x AND y in the patch — that's the create-from-scratch
   *  contract. Label-only / nudge / pin-style updates still require a
   *  baseline (and silently no-op without one, since they have nothing to
   *  attach to). The earlier behaviour dropped create-from-scratch on the
   *  floor while still firing the "Placed X" toast — see plan §2. */
  const mutateOverride = useCallback(
    (entityId: string, patch: Partial<OverrideValue>, label?: string) => {
      if (!activeMap) return;
      setOverridesUndoable(
        (o) => {
          const k = overrideKey(activeMap.id, entityId);
          const current = (k in o ? o[k] : null) ?? canonPlacement(activeMap.id, entityId);
          if (!current) {
            if (typeof patch.x !== "number" || typeof patch.y !== "number") return o;
            const fresh: OverrideValue = {
              x: patch.x,
              y: patch.y,
              label: patch.label,
              pin: patch.pin,
            };
            return { ...o, [k]: fresh };
          }
          const merged: OverrideValue = {
            x: patch.x ?? current.x,
            y: patch.y ?? current.y,
            label: patch.label !== undefined ? patch.label : (current as OverrideValue).label,
            pin: patch.pin !== undefined ? patch.pin : (current as OverrideValue).pin,
          };
          return { ...o, [k]: merged };
        },
        label ?? `pin ${entityId}`,
      );
    },
    [activeMap, canonPlacement, setOverridesUndoable],
  );

  const setCoord = (entityId: string, coord: { x: number; y: number }) =>
    mutateOverride(entityId, coord, `move pin ${entityId}`);
  const setLabel = (entityId: string, label: string | undefined) =>
    mutateOverride(entityId, { label }, `label pin ${entityId}`);
  const setPinOverride = (entityId: string, pin: PinOverride | undefined) =>
    mutateOverride(entityId, { pin }, `style pin ${entityId}`);
  const nudge = (entityId: string, dx: number, dy: number) => {
    const c = effectiveCoord(entityId);
    if (!c) return;
    mutateOverride(entityId, { x: c.x + dx, y: c.y + dy }, `nudge pin ${entityId}`);
  };
  const removeCoord = (entityId: string) => {
    if (!activeMap) return;
    setOverridesUndoable(
      (o) => ({ ...o, [overrideKey(activeMap.id, entityId)]: null }),
      `remove pin ${entityId}`,
    );
  };
  const clearOverride = (entityId: string) => {
    if (!activeMap) return;
    const k = overrideKey(activeMap.id, entityId);
    setOverridesUndoable((o) => {
      const next = { ...o };
      delete next[k];
      return next;
    }, `discard local pin edit ${entityId}`);
  };
  /** Duplicate a placement to another map: writes the same coords as a draft. Undoable. */
  const duplicateToMap = (entityId: string, targetMapId: string) => {
    const src = effectivePlacement(entityId);
    if (!src) return;
    setOverridesUndoable(
      (o) => ({
        ...o,
        [overrideKey(targetMapId, entityId)]: {
          x: src.x,
          y: src.y,
          label: src.label,
          pin: src.pin,
        },
      }),
      `duplicate pin ${entityId} → ${targetMapId}`,
    );
    toast.success(
      `Duplicated to ${project?.maps.find((m) => m.id === targetMapId)?.name ?? targetMapId}`,
    );
  };

  return {
    canonPlacement,
    effectivePlacement,
    effectiveCoord,
    mutateOverride,
    setCoord,
    setLabel,
    setPinOverride,
    nudge,
    removeCoord,
    clearOverride,
    duplicateToMap,
  };
}
