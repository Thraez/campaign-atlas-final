import { describe, it, expect } from "vitest";
import { makeIgnore } from "@/atlas/import/ignoreRules";

describe("makeIgnore", () => {
  it("matches user globs (Templates/**)", () => {
    const isIgnored = makeIgnore(["Templates/**"]);
    expect(isIgnored("Templates/x.md")).toBe(true);
  });

  it("does not match non-matching paths", () => {
    const isIgnored = makeIgnore(["**/*.excalidraw.md"]);
    expect(isIgnored("world/a.md")).toBe(false);
  });

  it("matches excalidraw extension via glob", () => {
    const isIgnored = makeIgnore(["**/*.excalidraw.md"]);
    expect(isIgnored("x.excalidraw.md")).toBe(true);
  });

  it("matches built-in IGNORED_FOLDERS even with no user globs", () => {
    const isIgnored = makeIgnore([]);
    expect(isIgnored("_drafts/note.md")).toBe(true);
    expect(isIgnored("templates/note.md")).toBe(true);
    expect(isIgnored(".obsidian/config.md")).toBe(true);
  });

  it("does not ignore normal paths with empty globs", () => {
    const isIgnored = makeIgnore([]);
    expect(isIgnored("world/city/note.md")).toBe(false);
    expect(isIgnored("npcs/corven.md")).toBe(false);
  });

  it("glob matching is case-insensitive", () => {
    const isIgnored = makeIgnore(["Templates/**"]);
    expect(isIgnored("TEMPLATES/x.md")).toBe(true);
    expect(isIgnored("templates/x.md")).toBe(true);
  });

  it("multiple globs — any match returns true", () => {
    const isIgnored = makeIgnore(["Templates/**", "Archive/**"]);
    expect(isIgnored("Archive/old.md")).toBe(true);
    expect(isIgnored("active/note.md")).toBe(false);
  });
});
