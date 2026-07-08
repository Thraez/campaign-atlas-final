/**
 * Placement-override storage layer for the visual editor.
 *
 * The editor keeps the DM's in-progress pin moves in localStorage as
 * "overrides" — a map from `${mapId}:${entityId}` to a new position (or `null`
 * to mean "removed from this map"). This module owns that persisted shape and
 * its forward-migration across storage versions:
 *
 *   v1 — keyed by entityId only (no map), value = { x, y }
 *   v2 — keyed by `${mapId}:${entityId}`, value = { x, y }
 *   v3 — same key, value additionally carries { label?, pin? }
 *
 * Extra v3 fields are simply absent on older entries, so v2 data is read
 * as-is. v1 data can't be re-keyed until the project's default map id is
 * known, so it's parked under a `__legacy__:` prefix by `loadOverrides` and
 * finished by `finishLegacyMigration` once the atlas has loaded.
 *
 * Pure and DOM-free apart from the explicit localStorage accessors, so the
 * migration logic can be unit-tested without a React render.
 */
import { overridesSchema } from "@/atlas/schemas/imports";
import type { PinOverride } from "@/atlas/pins/presets";

/** Local-draft override shape. `null` = explicitly removed from this map. */
export type OverrideValue = { x: number; y: number; label?: string; pin?: PinOverride };
export type Override = OverrideValue | null;

export interface Overrides {
  [mapEntityKey: string]: Override; // key = `${mapId}:${entityId}`
}

// Bumped to v3: storage shape now carries label + pin override per placement.
// v1/v2 entries (just x/y) are still readable — extra fields are simply absent.
export const STORAGE_KEY = "atlas-placement-overrides-v3";
export const LEGACY_STORAGE_KEY_V1 = "atlas-placement-overrides-v1";
export const LEGACY_STORAGE_KEY_V2 = "atlas-placement-overrides-v2";

/** Composite storage key for one placement override. */
export const overrideKey = (mapId: string, entityId: string) => `${mapId}:${entityId}`;

/**
 * Prefix that parks a v1 (entityId-only) override until the default map id is
 * known, at which point `finishLegacyMigration` rewrites it to a real key.
 */
const LEGACY_PENDING_PREFIX = "__legacy__:";

/**
 * Boundary-validate an overrides JSON string from localStorage. Malformed
 * entries (corrupt browser storage, hand-edited DevTools) are dropped per
 * key rather than crashing the editor. Returns an empty object on total
 * failure.
 */
export function safeParseOverrides(raw: string): Overrides {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = overridesSchema.safeParse(json);
  if (!parsed.success) return {};
  const out: Overrides = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    out[k] = v as Override;
  }
  return out;
}

/**
 * Read the persisted overrides from localStorage, forward-migrating older
 * (v1 / v2) storage shapes into the current v3 shape. v1 entries are
 * entityId-keyed and can't be resolved to a `${mapId}:${entityId}` key until
 * the project's default map is known, so they're parked under the
 * `__legacy__:` prefix and finished by `finishLegacyMigration` after load.
 * Suitable as a lazy `useState` initializer.
 */
export function loadOverrides(): Overrides {
  try {
    const v3 = localStorage.getItem(STORAGE_KEY);
    if (v3) return safeParseOverrides(v3);
    // Forward-migration: v2 entries are already keyed by `${mapId}:${entityId}`
    // and only carry x/y — directly compatible with the v3 shape.
    const v2raw = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (v2raw) return safeParseOverrides(v2raw);
    // v1 was entityId-keyed; defer mapId resolution until project loads.
    const v1raw = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
    if (!v1raw) return {};
    const v1 = safeParseOverrides(v1raw);
    const migrated: Overrides = {};
    Object.entries(v1).forEach(([eid, val]) => {
      migrated[`${LEGACY_PENDING_PREFIX}${eid}`] = val;
    });
    return migrated;
  } catch {
    return {};
  }
}

/**
 * Complete the v1 → v2 migration once the default map id is known: rewrite
 * every parked `__legacy__:<entityId>` entry to a proper
 * `${defaultMapId}:${entityId}` key. Returns the (possibly unchanged)
 * overrides plus whether anything was migrated — the caller clears the v1
 * storage key when so. Pure: no localStorage access.
 */
export function finishLegacyMigration(
  overrides: Overrides,
  defaultMapId: string | null,
): { overrides: Overrides; migrated: boolean } {
  const out: Overrides = {};
  let migrated = false;
  for (const [k, v] of Object.entries(overrides)) {
    if (k.startsWith(LEGACY_PENDING_PREFIX) && defaultMapId) {
      out[overrideKey(defaultMapId, k.slice(LEGACY_PENDING_PREFIX.length))] = v;
      migrated = true;
    } else {
      out[k] = v;
    }
  }
  return { overrides: migrated ? out : overrides, migrated };
}

/** Persist the current overrides to localStorage under the v3 key. */
export function persistOverrides(overrides: Overrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
