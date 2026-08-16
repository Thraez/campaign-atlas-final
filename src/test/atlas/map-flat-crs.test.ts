/**
 * Tests for src/atlas/map/flatCRS.ts — the shared Leaflet CRS used by both the
 * player viewer and the DM editor.
 */
import { describe, it, expect } from "vitest";
import L from "leaflet";
import { FlatCRS } from "@/atlas/map/flatCRS";

describe("FlatCRS", () => {
  it("is a Simple-CRS-derived object (flat, non-globe projection)", () => {
    expect(FlatCRS.infinite).toBe(L.CRS.Simple.infinite);
    expect(FlatCRS.project({ lat: 5, lng: 7 })).toEqual(L.CRS.Simple.project({ lat: 5, lng: 7 }));
  });

  it("does not mutate the shared L.CRS.Simple singleton", () => {
    expect(FlatCRS).not.toBe(L.CRS.Simple);
  });
});
