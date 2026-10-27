/**
 * eval-2026-10/02: one module owns each DM syntax, and offers both "strip it"
 * and "is any left?". One table drives both, so a syntax the build strips is
 * a syntax the scans look for.
 */
import { describe, it, expect } from "vitest";
import {
  findDmMarkup,
  replaceSecretMarkers,
  secretMarkerIds,
  stripDmBlocks,
  stripDmFromShippingString,
  stripSecretMarkers,
} from "@/atlas/content/dmMarkup";
import { generateAutoSummary } from "@/atlas/import/parseObsidian";
import { scanArtifactShape } from "../../../scripts/check-artifact-shape";

const CASES = [
  { syntax: "%%", text: "Seen. %% the king is dead %% Also seen." },
  { syntax: "%%", text: "Seen.\n\n%%\nmulti\nline\n%%\n\nAlso seen." },
  { syntax: ":::dm", text: "Seen.\n\n:::dm\nthe king is dead\n:::\n\nAlso seen." },
  { syntax: ":::dm", text: "Seen.\n\n:::DM\nthe king is dead\n:::\n\nAlso seen." },
  { syntax: "{{secret:", text: "Seen. {{secret:signet}} Also seen." },
] as const;

const strip = (s: string) => stripSecretMarkers(stripDmBlocks(s).text);

describe("DM markup: strip and detect agree", () => {
  it.each(CASES)("finds $syntax before stripping", ({ syntax, text }) => {
    expect(findDmMarkup(text)).toBe(syntax);
  });

  it.each(CASES)("finds nothing after stripping $syntax", ({ text }) => {
    const out = strip(text);
    expect(findDmMarkup(out)).toBeNull();
    expect(out).toContain("Seen.");
    expect(out).toContain("Also seen.");
    expect(out).not.toMatch(/king|signet|multi/);
  });

  it.each(CASES)("a shipping string loses $syntax too", ({ text }) => {
    const out = stripSecretMarkers(stripDmFromShippingString(text) ?? "");
    expect(findDmMarkup(out)).toBeNull();
  });

  it("plain prose and other {{...}} patterns are not DM markup", () => {
    expect(findDmMarkup("100% sure, {{other:thing}}, ::: alone")).toBeNull();
  });

  it("a lone %% is flagged: stripping can't close it, so the scans must catch it", () => {
    const shipped = "Name %% the king is dead";
    expect(stripDmBlocks(shipped).unbalanced).toBe(true);
    expect(findDmMarkup(stripDmFromShippingString(shipped) ?? "")).toBe("%%");
  });
});

describe("other readers of DM markup", () => {
  it("the import auto-summary drops DM blocks and secret markers", () => {
    const body =
      "The harbour town of Tidemarrow. %% smugglers %% {{secret:x}}\n\n:::dm\nthe mayor is a lich\n:::\n";
    const summary = generateAutoSummary(body) ?? "";
    expect(summary).toContain("The harbour town of Tidemarrow.");
    expect(findDmMarkup(summary)).toBeNull();
    expect(summary).not.toMatch(/smugglers|lich/);
  });
});

describe("secret markers", () => {
  it("lists ids and replaces each marker", () => {
    const body = "a {{secret:x}} b {{secret: y }} c";
    expect(secretMarkerIds(body)).toEqual(["x", " y "]);
    expect(replaceSecretMarkers(body, (id) => `[${id.trim()}]`)).toBe("a [x] b [y] c");
  });
});

describe("check-artifact-shape sees every DM syntax", () => {
  const atlasWithSummary = (summary: string) => ({
    version: "1",
    publishedAt: "",
    worlds: [],
    maps: [],
    placements: [],
    assets: [],
    entities: [{ id: "e1", title: "E", type: "npc", visibility: "player", summary }],
  });

  it.each(CASES)("flags a leftover $syntax in a shipped field", ({ syntax, text }) => {
    const r = scanArtifactShape(atlasWithSummary(text));
    expect(r.violations.some((v) => v.message.includes(`unstripped ${syntax}`))).toBe(true);
  });

  it("passes a clean field", () => {
    const r = scanArtifactShape(atlasWithSummary("Nothing hidden here."));
    expect(r.violations.filter((v) => v.message.includes("unstripped"))).toHaveLength(0);
  });
});
