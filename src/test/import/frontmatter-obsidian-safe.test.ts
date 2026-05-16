// src/test/import/frontmatter-obsidian-safe.test.ts
import { describe, it, expect } from "vitest";
import { stringifyFrontmatter, parseFrontmatter } from "@/atlas/import/frontmatter";

describe("stringifyFrontmatter — Obsidian Properties safety", () => {
  it("round-trips data through a strict re-parse without field loss", () => {
    const data = {
      title: "Corven", type: "npc", visibility: "dm",
      aliases: ["The Smuggler-King", "Onyx"],
      summary: "A line with: a colon, a #hash, and a 'quote'.",
      tags: ["npc", "legend"],
    };
    const raw = stringifyFrontmatter("# Corven\n\nBody stays.\n", data);
    const back = parseFrontmatter(raw);
    expect(back.data).toEqual(data);
    expect(back.content).toContain("Body stays.");
  });

  it("emits no multiline YAML scalars (no '|' or '>' block indicators in frontmatter)", () => {
    const raw = stringifyFrontmatter("body", {
      summary: "First sentence. Second sentence. Third — still one line.",
    });
    const fm = raw.split("---")[1] ?? "";
    expect(fm).not.toMatch(/:\s*[|>][-+0-9]*\s*\n/);
  });

  it("quotes strings that YAML would otherwise coerce (numbers, bools, dates)", () => {
    const raw = stringifyFrontmatter("body", {
      date: "0-1-1", code: "012", flag: "true",
    });
    const back = parseFrontmatter(raw);
    expect(back.data.date).toBe("0-1-1");
    expect(back.data.code).toBe("012");
    expect(back.data.flag).toBe("true");
  });

  it("never mutates the prose body", () => {
    const body = "# Title\n\nParagraph with [[WikiLink]] and ![[img.png]].\n";
    const raw = stringifyFrontmatter(body, { title: "X" });
    expect(parseFrontmatter(raw).content).toBe(body);
  });
});
