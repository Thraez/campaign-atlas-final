/**
 * Zod schemas for input boundaries.
 *
 * Scope: only the points where untrusted JSON / file content enters the
 * editor — JSON import in the legacy Toolbar, and the placement-overrides
 * payload restored from localStorage. Internal normalized types
 * (`AtlasData`, `Overrides`) are unchanged; these schemas just make sure
 * malformed input is rejected with a useful message instead of crashing
 * deep inside the renderer.
 *
 * Keep these schemas permissive (passthrough on unknown fields) so older
 * exports keep loading. We validate the shape we actually depend on, not
 * every field.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Legacy atlas JSON import (Toolbar → "Import JSON")
// ---------------------------------------------------------------------------

/** Minimal world record we need to render anything at all. */
const worldImportSchema = z
  .object({
    id: z.string().trim().min(1, { message: "world.id is required" }).max(120),
    name: z.string().trim().min(1, { message: "world.name is required" }).max(200),
  })
  .passthrough();

const pinImportSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: z.string().max(200).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .passthrough();

export const atlasImportSchema = z
  .object({
    world: worldImportSchema,
    pins: z.array(pinImportSchema).max(20_000),
  })
  .passthrough();

export type AtlasImport = z.infer<typeof atlasImportSchema>;

// ---------------------------------------------------------------------------
// Placement overrides (localStorage in /atlas/edit)
// ---------------------------------------------------------------------------

const pinOverrideSchema = z
  .object({
    color: z.string().max(64).optional(),
    shape: z.string().max(64).optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const overrideValueSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    label: z.string().max(200).optional(),
    pin: pinOverrideSchema,
  })
  .passthrough();

/** A single override slot is either a placement or `null` (explicit removal). */
const overrideSlotSchema = z.union([overrideValueSchema, z.null()]);

/**
 * The whole overrides record. Keys look like `${mapId}:${entityId}` (v2/v3)
 * or a bare `entityId` for legacy v1 — both formats are accepted; we just
 * cap key length and reject non-object roots.
 */
export const overridesSchema = z.record(
  z.string().min(1).max(400),
  overrideSlotSchema
);

export type ParsedOverrides = z.infer<typeof overridesSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a ZodError into a single human-readable line (best for toasts). */
export function formatZodError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "Invalid input.";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

/**
 * Safe-parse helper that returns a discriminated result. UI callers can
 * branch on `.ok` and surface `.error` directly to the user.
 */
export function safeParseInput<T>(
  schema: z.ZodType<T>,
  raw: unknown
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: formatZodError(result.error) };
}