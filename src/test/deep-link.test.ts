import { describe, it, expect } from "vitest";
import { serializeDeepLink, parseDeepLink } from "@/atlas/deepLink";

describe("serializeDeepLink", () => {
  it("serializes all four fields", () => {
    const qs = serializeDeepLink({ mapId: "world", entityId: "corven", center: { x: 123, y: 456 }, zoom: 2.0 });
    const p = new URLSearchParams(qs);
    expect(p.get("map")).toBe("world");
    expect(p.get("entity")).toBe("corven");
    expect(p.get("cx")).toBe("123");
    expect(p.get("cy")).toBe("456");
    expect(p.get("cz")).toBe("2.0");
  });

  it("omits null fields", () => {
    const qs = serializeDeepLink({ mapId: "world", entityId: null, center: null, zoom: null });
    const p = new URLSearchParams(qs);
    expect(p.has("entity")).toBe(false);
    expect(p.has("cx")).toBe(false);
    expect(p.has("cy")).toBe(false);
    expect(p.has("cz")).toBe(false);
  });

  it("rounds cx/cy to integers", () => {
    const qs = serializeDeepLink({ mapId: null, entityId: null, center: { x: 100.7, y: 200.3 }, zoom: null });
    const p = new URLSearchParams(qs);
    expect(p.get("cx")).toBe("101");
    expect(p.get("cy")).toBe("200");
  });

  it("rounds cz to one decimal place", () => {
    const qs = serializeDeepLink({ mapId: null, entityId: null, center: null, zoom: 1.567 });
    const p = new URLSearchParams(qs);
    expect(p.get("cz")).toBe("1.6");
  });

  it("produces empty string when all fields are null", () => {
    const qs = serializeDeepLink({ mapId: null, entityId: null, center: null, zoom: null });
    expect(qs).toBe("");
  });
});

describe("parseDeepLink", () => {
  it("parses all four fields", () => {
    const dl = parseDeepLink("?map=world&entity=corven&cx=100&cy=200&cz=2.5");
    expect(dl.mapId).toBe("world");
    expect(dl.entityId).toBe("corven");
    expect(dl.center).toEqual({ x: 100, y: 200 });
    expect(dl.zoom).toBe(2.5);
  });

  it("accepts old ?entity= form (center and zoom null)", () => {
    const dl = parseDeepLink("?entity=corven");
    expect(dl.entityId).toBe("corven");
    expect(dl.mapId).toBeNull();
    expect(dl.center).toBeNull();
    expect(dl.zoom).toBeNull();
  });

  it("returns null for unparseable numeric params", () => {
    const dl = parseDeepLink("?cx=foo&cy=bar&cz=baz");
    expect(dl.center).toBeNull();
    expect(dl.zoom).toBeNull();
  });

  it("returns null for missing params", () => {
    const dl = parseDeepLink("");
    expect(dl.mapId).toBeNull();
    expect(dl.entityId).toBeNull();
    expect(dl.center).toBeNull();
    expect(dl.zoom).toBeNull();
  });

  it("round-trips through serialize/parse", () => {
    const original = { mapId: "astrath", entityId: "corven", center: { x: 512, y: 384 }, zoom: -1.5 };
    const qs = serializeDeepLink(original);
    const parsed = parseDeepLink("?" + qs);
    expect(parsed.mapId).toBe("astrath");
    expect(parsed.entityId).toBe("corven");
    expect(parsed.center).toEqual({ x: 512, y: 384 });
    expect(parsed.zoom).toBe(-1.5);
  });

  it("treats missing cx with present cy as no center (both must be present)", () => {
    const dl = parseDeepLink("?cx=100");
    expect(dl.center).toBeNull();
  });

  it("treats missing cy with present cx as no center (both must be present)", () => {
    const dl = parseDeepLink("?cy=200");
    expect(dl.center).toBeNull();
  });
});
