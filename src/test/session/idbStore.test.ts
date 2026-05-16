import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { idbGet, idbSet, idbDelete } from "@/atlas/session/idbStore";

describe("idbStore", () => {
  beforeEach(async () => { await idbDelete("k"); });

  it("returns null for a missing key", async () => {
    expect(await idbGet<{ a: number }>("k")).toBeNull();
  });

  it("round-trips a value", async () => {
    await idbSet("k", { a: 1, s: "x" });
    expect(await idbGet<{ a: number; s: string }>("k")).toEqual({ a: 1, s: "x" });
  });

  it("overwrites on repeated set", async () => {
    await idbSet("k", { a: 1 });
    await idbSet("k", { a: 2 });
    expect(await idbGet<{ a: number }>("k")).toEqual({ a: 2 });
  });

  it("delete removes the value", async () => {
    await idbSet("k", { a: 1 });
    await idbDelete("k");
    expect(await idbGet("k")).toBeNull();
  });
});
