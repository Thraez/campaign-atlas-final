import { describe, it, expect } from "vitest";
import {
  SESSION_SCHEMA_VERSION,
  serializeSession,
  deserializeSession,
  sessionHasWork,
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
  entityEdit: null,
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

const emptyBase = {
  overrides: {}, mapOverrideByMap: {}, regionByMap: {},
  routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: 1,
  entityEdit: null,
};

describe("entityEdit slice (backward compatible)", () => {
  it("deserializes a v1 blob WITHOUT entityEdit (null default, no work)", () => {
    const blob = { version: 1, state: emptyBase };
    const s = deserializeSession(blob)!;
    expect(s.entityEdit).toBeNull();
    expect(sessionHasWork(s)).toBe(false);
  });
  it("round-trips an entityEdit draft and counts it as work", () => {
    const s = { ...emptyBase, entityEdit: {
      sourcePath: "content/w/npcs/corven.md", baseHash: "sha256:x",
      fields: { id: "corven", type: "npc", visibility: "dm", summary: "" },
      body: "edited", pristine: "different",
    } };
    const round = deserializeSession(serializeSession(s as never))!;
    expect(round.entityEdit?.body).toBe("edited");
    expect(sessionHasWork(round)).toBe(true);
  });
  it("entityEdit with body === pristine JSON is NOT counted as work", () => {
    const fields = { id: "corven", type: "npc", visibility: "dm", summary: "" };
    const body = "same";
    const pristine = JSON.stringify({ fields, body });
    const s = { ...emptyBase, entityEdit: {
      sourcePath: "content/w/npcs/corven.md", baseHash: "sha256:x",
      fields, body, pristine,
    } };
    const round = deserializeSession(serializeSession(s as never))!;
    expect(sessionHasWork(round)).toBe(false);
  });
});

describe("deserializeSession — inner state field guard", () => {
  it("returns null when state exists but is missing required fields", () => {
    // Valid version, but state is missing savedAt → null
    expect(deserializeSession({ version: SESSION_SCHEMA_VERSION, state: { overrides: {} } })).toBeNull();
  });
  it("returns null when state itself is not an object", () => {
    expect(deserializeSession({ version: SESSION_SCHEMA_VERSION, state: "corrupt" })).toBeNull();
    expect(deserializeSession({ version: SESSION_SCHEMA_VERSION, state: 42 })).toBeNull();
  });
  it("accepts a valid envelope and returns a SessionState", () => {
    const s = deserializeSession({ version: SESSION_SCHEMA_VERSION, state: emptyBase });
    expect(s).not.toBeNull();
    expect(s!.savedAt).toBe(1);
  });
});

describe("sessionHasWork — individual slice branches", () => {
  it("returns true when there is a non-null pin override", () => {
    const s: SessionState = { ...emptyBase, overrides: { "m1:ent": { x: 5, y: 5 } } };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns false when override value is explicitly null", () => {
    const s: SessionState = { ...emptyBase, overrides: { "m1:ent": null } };
    expect(sessionHasWork(s)).toBe(false);
  });
  it("returns true when mapOverrideByMap has a non-empty map patch", () => {
    const s: SessionState = { ...emptyBase, mapOverrideByMap: { m1: { width: 2048 } } };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns false when mapOverrideByMap entry is an empty object", () => {
    const s: SessionState = { ...emptyBase, mapOverrideByMap: { m1: {} } };
    expect(sessionHasWork(s)).toBe(false);
  });
  it("returns true when regionByMap has added regions", () => {
    const s: SessionState = {
      ...emptyBase,
      regionByMap: { m1: { edits: {}, added: [{ id: "r1", mapId: "m1", name: "R", points: [[0,0],[1,1],[2,0]], visibility: "player" as const }], deleted: [] } },
    };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns true when regionByMap has deleted regions", () => {
    const s: SessionState = {
      ...emptyBase,
      regionByMap: { m1: { edits: {}, added: [], deleted: ["r1"] } },
    };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns true when routeByMap has added routes", () => {
    const s: SessionState = {
      ...emptyBase,
      routeByMap: { m1: { edits: {}, added: [{ id: "rt1", mapId: "m1", name: "Road", visibility: "player" as const, waypoints: [[0,0],[100,100]] }], deleted: [] } },
    };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns true when fogByMap has a non-null fog overlay", () => {
    const s: SessionState = {
      ...emptyBase,
      fogByMap: { m1: { mapId: "m1", enabled: true, color: "rgba(0,0,0,0.5)", reveals: [] } },
    };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns false when fogByMap entry is null", () => {
    const s: SessionState = { ...emptyBase, fogByMap: { m1: null } };
    expect(sessionHasWork(s)).toBe(false);
  });
  it("returns true when layerByMap has at least one layer", () => {
    const s: SessionState = {
      ...emptyBase,
      layerByMap: { m1: [{ id: "lay1", src: "data:x", x: 0, y: 0, width: 1, height: 1, opacity: 1, zIndex: 1, origin: "upload" as const }] },
    };
    expect(sessionHasWork(s)).toBe(true);
  });
  it("returns false when layerByMap entry is an empty array", () => {
    const s: SessionState = { ...emptyBase, layerByMap: { m1: [] } };
    expect(sessionHasWork(s)).toBe(false);
  });
});
