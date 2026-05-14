/**
 * Tests for src/atlas/schemas/imports.ts
 *
 * These cover the input boundaries the editor relies on:
 *   - legacy atlas JSON import (Toolbar)
 *   - placement overrides restored from localStorage
 *
 * The schemas are intentionally permissive (passthrough on extras) so older
 * exports keep loading, but they still must reject the obvious malformed
 * cases that would crash the renderer.
 */
import { describe, it, expect } from "vitest";
import {
  atlasImportSchema,
  overridesSchema,
  formatZodError,
  safeParseInput,
} from "@/atlas/schemas/imports";

describe("atlasImportSchema", () => {
  it("accepts a minimal valid atlas JSON", () => {
    const out = atlasImportSchema.safeParse({
      world: { id: "tidemarrow", name: "Tidemarrow" },
      pins: [],
    });
    expect(out.success).toBe(true);
  });

  it("accepts unknown extra fields (passthrough for forward compat)", () => {
    const out = atlasImportSchema.safeParse({
      world: { id: "w", name: "W", extra: 1 },
      pins: [{ id: "p1", x: 0, y: 0, custom: "ok" }],
      futureField: "ignored-but-allowed",
    });
    expect(out.success).toBe(true);
  });

  it("rejects when world is missing", () => {
    const out = atlasImportSchema.safeParse({ pins: [] });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(formatZodError(out.error)).toMatch(/world/);
    }
  });

  it("rejects when pins is not an array", () => {
    const out = atlasImportSchema.safeParse({
      world: { id: "w", name: "W" },
      pins: "nope",
    });
    expect(out.success).toBe(false);
  });

  it("rejects pins with non-finite coordinates", () => {
    const out = atlasImportSchema.safeParse({
      world: { id: "w", name: "W" },
      pins: [{ id: "p1", x: Number.NaN, y: 0 }],
    });
    expect(out.success).toBe(false);
  });

  it("rejects empty world.id", () => {
    const out = atlasImportSchema.safeParse({
      world: { id: "  ", name: "W" },
      pins: [],
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const msg = formatZodError(out.error);
      expect(msg).toMatch(/world\.id/);
    }
  });
});

describe("overridesSchema", () => {
  it("accepts a valid v3-style record", () => {
    const out = overridesSchema.safeParse({
      "map-1:entity-a": { x: 100, y: 200, label: "Town" },
      "map-1:entity-b": null,
    });
    expect(out.success).toBe(true);
  });

  it("accepts pin override metadata", () => {
    const out = overridesSchema.safeParse({
      "map-1:entity-a": { x: 1, y: 2, pin: { color: "#fff", shape: "diamond" } },
    });
    expect(out.success).toBe(true);
  });

  it("rejects entries with non-numeric coordinates", () => {
    const out = overridesSchema.safeParse({
      "map-1:entity-a": { x: "nope", y: 0 },
    });
    expect(out.success).toBe(false);
  });

  it("rejects an array root", () => {
    const out = overridesSchema.safeParse([]);
    expect(out.success).toBe(false);
  });
});

describe("safeParseInput", () => {
  it("returns ok=true with parsed data on success", () => {
    const out = safeParseInput(overridesSchema, { "k": { x: 1, y: 2 } });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data["k"]).toMatchObject({ x: 1, y: 2 });
  });

  it("returns ok=false with a useful message on failure", () => {
    const out = safeParseInput(overridesSchema, { k: { x: "bad", y: 0 } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/k\.x/);
  });
});