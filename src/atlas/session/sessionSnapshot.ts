/**
 * The durable editor-session shape and its (de)serialization.
 *
 * Every per-map draft holder is stored keyed by mapId so switching maps is
 * non-destructive. Pin overrides are already globally keyed `${mapId}:${id}`.
 * Slice types are imported from the hooks so this shape can never drift from
 * what the hooks actually snapshot.
 *
 * The on-disk value is a versioned envelope. A version mismatch deserializes
 * to null (treated as "no draft") — a safe, explicit downgrade.
 */
import type { MapDocument } from "@/atlas/content/schema";
import type { RegionDraft } from "@/atlas/regions/useRegionDraft";
import type { RouteDraft } from "@/atlas/routes/useRouteDraft";
import type { FogOverlay } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { PinOverride } from "@/atlas/pins/presets";

export const SESSION_SCHEMA_VERSION = 1;

export type OverrideValue = { x: number; y: number; label?: string; pin?: PinOverride };
export type Overrides = Record<string, OverrideValue | null>;

export interface SessionState {
  /** key = `${mapId}:${entityId}` */
  overrides: Overrides;
  mapOverrideByMap: Record<string, Partial<MapDocument>>;
  regionByMap: Record<string, RegionDraft>;
  routeByMap: Record<string, RouteDraft>;
  /** null slice = "no fog override for this map" */
  fogByMap: Record<string, FogOverlay | null>;
  layerByMap: Record<string, LocalLayer[]>;
  /** wall-clock ms of the last working-state change */
  savedAt: number;
}

interface Envelope {
  version: number;
  state: SessionState;
}

export function serializeSession(state: SessionState): unknown {
  const env: Envelope = { version: SESSION_SCHEMA_VERSION, state };
  // Structured-clone-safe already; round-trip through JSON to guarantee the
  // stored value is a plain detached object (no refs into live React state).
  return JSON.parse(JSON.stringify(env));
}

export function deserializeSession(blob: unknown): SessionState | null {
  if (!blob || typeof blob !== "object") return null;
  const env = blob as Partial<Envelope>;
  if (env.version !== SESSION_SCHEMA_VERSION) return null;
  if (!env.state || typeof env.state !== "object") return null;
  const s = env.state as Partial<SessionState>;
  if (
    !s.overrides || !s.mapOverrideByMap || !s.regionByMap ||
    !s.routeByMap || !s.fogByMap || !s.layerByMap ||
    typeof s.savedAt !== "number"
  ) return null;
  return s as SessionState;
}

/** True when the snapshot represents real unsaved work (any holder non-empty). */
export function sessionHasWork(s: SessionState): boolean {
  const anyOverride = Object.values(s.overrides).some((v) => v != null);
  const anyMap = Object.values(s.mapOverrideByMap).some((m) => m && Object.keys(m).length > 0);
  const anyRegion = Object.values(s.regionByMap).some((r) => r.added.length || r.deleted.length || Object.keys(r.edits).length);
  const anyRoute = Object.values(s.routeByMap).some((r) => r.added.length || r.deleted.length || Object.keys(r.edits).length);
  const anyFog = Object.values(s.fogByMap).some((f) => f != null);
  const anyLayer = Object.values(s.layerByMap).some((l) => l.length > 0);
  return anyOverride || anyMap || anyRegion || anyRoute || anyFog || anyLayer;
}
