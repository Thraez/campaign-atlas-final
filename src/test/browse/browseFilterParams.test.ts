import { describe, it, expect } from "vitest";
import {
  parseBrowseFilterParams,
  serializeBrowseFilterParams,
} from "@/atlas/browse/browseFilterParams";

describe("parseBrowseFilterParams", () => {
  it("returns empty defaults when params are absent", () => {
    const result = parseBrowseFilterParams(new URLSearchParams());
    expect(result).toEqual({ q: "", type: null });
  });

  it("reads q from the search params", () => {
    const result = parseBrowseFilterParams(new URLSearchParams("q=dragon"));
    expect(result.q).toBe("dragon");
  });

  it("reads type from the search params", () => {
    const result = parseBrowseFilterParams(new URLSearchParams("type=npc"));
    expect(result.type).toBe("npc");
  });

  it("reads both q and type together", () => {
    const result = parseBrowseFilterParams(new URLSearchParams("q=iron&type=location"));
    expect(result).toEqual({ q: "iron", type: "location" });
  });

  it("treats an empty type param as null", () => {
    const result = parseBrowseFilterParams(new URLSearchParams("type="));
    expect(result.type).toBeNull();
  });
});

describe("serializeBrowseFilterParams", () => {
  it("produces empty params for the default state", () => {
    const params = serializeBrowseFilterParams({ q: "", type: null });
    expect(params.toString()).toBe("");
  });

  it("includes q when set", () => {
    const params = serializeBrowseFilterParams({ q: "goblin", type: null });
    expect(params.get("q")).toBe("goblin");
    expect(params.has("type")).toBe(false);
  });

  it("includes type when set", () => {
    const params = serializeBrowseFilterParams({ q: "", type: "faction" });
    expect(params.has("q")).toBe(false);
    expect(params.get("type")).toBe("faction");
  });

  it("includes both q and type when both are set", () => {
    const params = serializeBrowseFilterParams({ q: "castle", type: "location" });
    expect(params.get("q")).toBe("castle");
    expect(params.get("type")).toBe("location");
  });
});

describe("round-trip", () => {
  it("parse→serialize→parse is stable for q only", () => {
    const original = new URLSearchParams("q=river");
    const parsed = parseBrowseFilterParams(original);
    const serialized = serializeBrowseFilterParams(parsed);
    expect(parseBrowseFilterParams(serialized)).toEqual(parsed);
  });

  it("parse→serialize→parse is stable for type only", () => {
    const original = new URLSearchParams("type=deity");
    const parsed = parseBrowseFilterParams(original);
    const serialized = serializeBrowseFilterParams(parsed);
    expect(parseBrowseFilterParams(serialized)).toEqual(parsed);
  });

  it("parse→serialize→parse is stable for q+type", () => {
    const original = new URLSearchParams("q=temple&type=location");
    const parsed = parseBrowseFilterParams(original);
    const serialized = serializeBrowseFilterParams(parsed);
    expect(parseBrowseFilterParams(serialized)).toEqual(parsed);
  });

  it("parse→serialize→parse is stable for the empty state", () => {
    const parsed = parseBrowseFilterParams(new URLSearchParams());
    const serialized = serializeBrowseFilterParams(parsed);
    expect(parseBrowseFilterParams(serialized)).toEqual(parsed);
  });
});
