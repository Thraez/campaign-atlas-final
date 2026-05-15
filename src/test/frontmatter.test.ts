/**
 * Tests for the browser-safe frontmatter helper.
 *
 * gray-matter pulls in Node's Buffer and crashes in real browsers (jsdom
 * happens to expose it, which is why the runtime regression slipped past
 * vitest). The helper exercised here is a drop-in replacement for the two
 * gray-matter call shapes our code actually uses:
 *
 *   parseFrontmatter(raw)              -> { data, content }
 *   stringifyFrontmatter(content, data) -> string
 *
 * Behaviour must match gray-matter closely enough that round-tripping
 * existing entity .md files produces an identical-looking file on disk.
 */
import { describe, it, expect } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty data + raw body when there's no frontmatter", () => {
    const r = parseFrontmatter("hello world");
    expect(r.data).toEqual({});
    expect(r.content).toBe("hello world");
  });

  it("parses simple frontmatter", () => {
    const r = parseFrontmatter("---\ntitle: Thornhold\ntype: place\n---\nbody here");
    expect(r.data).toEqual({ title: "Thornhold", type: "place" });
    expect(r.content).toBe("body here");
  });

  it("parses nested atlas frontmatter with placements", () => {
    const raw = "---\natlas:\n  type: place\n  placements:\n    - mapId: m1\n      x: 0.5\n      y: 0.6\n---\nbody\n";
    const r = parseFrontmatter(raw);
    expect(r.data).toEqual({
      atlas: {
        type: "place",
        placements: [{ mapId: "m1", x: 0.5, y: 0.6 }],
      },
    });
    expect(r.content).toBe("body\n");
  });

  it("preserves leading newlines in the body", () => {
    const r = parseFrontmatter("---\na: 1\n---\n\nhi");
    expect(r.content).toBe("\nhi");
  });

  it("returns empty content when nothing follows the closing fence", () => {
    expect(parseFrontmatter("---\na: 1\n---\n").content).toBe("");
    expect(parseFrontmatter("---\na: 1\n---").content).toBe("");
  });

  it("tolerates CRLF line endings", () => {
    const r = parseFrontmatter("---\r\ntitle: Thornhold\r\n---\r\nbody\r\n");
    expect(r.data).toEqual({ title: "Thornhold" });
    expect(r.content).toBe("body\r\n");
  });

  it("strips a UTF-8 BOM before parsing", () => {
    const r = parseFrontmatter("﻿---\na: 1\n---\nbody");
    expect(r.data).toEqual({ a: 1 });
    expect(r.content).toBe("body");
  });

  it("throws on malformed YAML so callers can wrap in try/catch", () => {
    expect(() => parseFrontmatter("---\nkey: [unclosed\n---\nbody")).toThrow();
  });

  it("treats null YAML (e.g. all comments) as empty data, not a parse error", () => {
    const r = parseFrontmatter("---\n# only a comment\n---\nbody");
    expect(r.data).toEqual({});
    expect(r.content).toBe("body");
  });
});

describe("stringifyFrontmatter", () => {
  it("omits the frontmatter block when data is empty", () => {
    expect(stringifyFrontmatter("hi", {})).toBe("hi\n");
  });

  it("ensures exactly one trailing newline (already present)", () => {
    expect(stringifyFrontmatter("hi\n", { a: 1 })).toBe("---\na: 1\n---\nhi\n");
  });

  it("ensures exactly one trailing newline (missing)", () => {
    expect(stringifyFrontmatter("hi", { a: 1 })).toBe("---\na: 1\n---\nhi\n");
  });

  it("preserves multiple trailing newlines verbatim", () => {
    expect(stringifyFrontmatter("hi\n\n", { a: 1 })).toBe("---\na: 1\n---\nhi\n\n");
  });

  it("emits empty content with a single newline after the closing fence", () => {
    expect(stringifyFrontmatter("", { a: 1 })).toBe("---\na: 1\n---\n\n");
  });

  it("round-trips nested atlas frontmatter", () => {
    const data = {
      atlas: {
        type: "place",
        placements: [{ mapId: "m1", x: 0.5, y: 0.6 }],
      },
    };
    const out = stringifyFrontmatter("body\n", data);
    const back = parseFrontmatter(out);
    expect(back.data).toEqual(data);
    expect(back.content).toBe("body\n");
  });

  it("round-trips entity-like frontmatter without dropping placements on other maps", () => {
    // Mirrors the canonicalPlacementSave flow: parse, mutate, restringify.
    const raw =
      "---\ntitle: Thornhold\natlas:\n  type: place\n  placements:\n    - mapId: overland\n      x: 0.5\n      y: 0.6\n    - mapId: regional\n      x: 0.2\n      y: 0.3\n---\nThe town of Thornhold.\n";
    const parsed = parseFrontmatter(raw);
    const atlas = (parsed.data.atlas as Record<string, unknown>) ?? {};
    const placements = (atlas.placements as Array<Record<string, unknown>>) ?? [];
    // Swap one placement, keep the other.
    const nextAtlas = {
      ...atlas,
      placements: [
        placements[0],
        { mapId: "regional", x: 0.9, y: 0.9 },
      ],
    };
    const next = stringifyFrontmatter(parsed.content, { ...parsed.data, atlas: nextAtlas });
    const reparsed = parseFrontmatter(next);
    const reAtlas = reparsed.data.atlas as Record<string, unknown>;
    expect(reAtlas.placements).toEqual([
      { mapId: "overland", x: 0.5, y: 0.6 },
      { mapId: "regional", x: 0.9, y: 0.9 },
    ]);
    expect(reparsed.content).toBe("The town of Thornhold.\n");
  });
});
