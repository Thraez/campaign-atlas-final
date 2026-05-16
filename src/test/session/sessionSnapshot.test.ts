import { describe, it, expect } from "vitest";
import {
  SESSION_SCHEMA_VERSION,
  serializeSession,
  deserializeSession,
  type SessionState,
} from "@/atlas/session/sessionSnapshot";

const sample: SessionState = {
  overrides: { "m1:town": { x: 10, y: 20, label: "Town" } },
  mapOverrideByMap: { m1: { width: 4096 } },
  regionByMap: { m1: { edits: {}, added: [{ id: "r1", mapId: "m1", name: "R", points: [[0,0],[1,1],[2,0]], visibility: "dm" }], deleted: [] } },
  routeByMap: { m1: { edits: {}, added: [], deleted: [] } },
  fogByMap: { m1: { mapId: "m1", enabled: true, color: "rgba(0,0,0,0.55)", reveals: [[[0,0],[1,1],[2,0]]] } },
  layerByMap: { m1: [{ id: "up-1", src: "data:x", x: 0, y: 0, width: 1, height: 1, opacity: 1, zIndex: 10, origin: "upload" }] },
  savedAt: 1_700_000_000_000,
};

describe("sessionSnapshot", () => {
  it("round-trips every holder unchanged", () => {
    const blob = serializeSession(sample);
    const back = deserializeSession(blob);
    expect(back).toEqual(sample);
  });

  it("wraps the payload in a versioned envelope", () => {
    const blob = serializeSession(sample) as { version: number };
    expect(blob.version).toBe(SESSION_SCHEMA_VERSION);
  });

  it("returns null for a wrong-version envelope (safe downgrade)", () => {
    expect(deserializeSession({ version: -1, state: sample })).toBeNull();
  });

  it("returns null for a structurally invalid envelope", () => {
    expect(deserializeSession({ junk: true })).toBeNull();
    expect(deserializeSession(null)).toBeNull();
  });
});
