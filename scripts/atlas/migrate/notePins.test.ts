import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../../src/atlas/content/frontmatter";
import { addPlacements, hasPinFields, stripPinFields } from "./notePins";

const body = "\n# Harbor\n\nBoats.  \n---\nNot frontmatter.\n";

const note = (fm: string) => `---\n${fm}---${body}`;

function stripped(raw: string): string {
  const r = stripPinFields(raw);
  if (!r.ok) throw new Error(r.reason);
  return r.raw;
}

describe("stripPinFields", () => {
  it("removes block placements and keeps every other line and the body byte for byte", () => {
    const raw = note(
      [
        "title: Harbor",
        "atlas:",
        "  type: settlement",
        "  placements:",
        "    - mapId: vale",
        "      x: 100",
        '      "y": 100',
        "    - { mapId: vale, x: 220, y: 220, label: Old pier }",
        "  visibility: player # kept",
        "tags: [a]",
        "",
      ].join("\n"),
    );
    expect(stripped(raw)).toBe(
      note(
        [
          "title: Harbor",
          "atlas:",
          "  type: settlement",
          "  visibility: player # kept",
          "tags: [a]",
          "",
        ].join("\n"),
      ),
    );
  });

  it("removes a sequence written at the key's own indent", () => {
    const raw = note(
      [
        "atlas:",
        "  visibility: player",
        "  placements:",
        "  - mapId: vale",
        "    x: 1",
        "    y: 2",
        "",
      ].join("\n"),
    );
    expect(stripped(raw)).toBe(note(["atlas:", "  visibility: player", ""].join("\n")));
  });

  it("removes legacy atlas.x / atlas.y, and an atlas: block left empty", () => {
    const raw = note(
      ["title: Mill", "atlas:", "  x: 640", "  y: 520", "aliases: [m]", ""].join("\n"),
    );
    expect(stripped(raw)).toBe(note(["title: Mill", "aliases: [m]", ""].join("\n")));
  });

  it("keeps CRLF and a BOM", () => {
    const raw =
      "\uFEFF---\r\ntitle: T\r\natlas:\r\n  visibility: dm\r\n  x: 1\r\n  y: 2\r\n---\r\nbody\r\n";
    expect(stripped(raw)).toBe(
      "\uFEFF---\r\ntitle: T\r\natlas:\r\n  visibility: dm\r\n---\r\nbody\r\n",
    );
  });

  it("leaves a note with no pin fields as it is", () => {
    const raw = note("title: T\natlas:\n  visibility: dm\n");
    expect(hasPinFields(raw)).toBe(false);
    expect(stripped(raw)).toBe(raw);
  });

  it("refuses flow-style atlas: with a pin in it", () => {
    const r = stripPinFields(note("atlas: { visibility: player, x: 1, y: 2 }\n"));
    expect(r.ok).toBe(false);
  });
});

describe("addPlacements", () => {
  it("is the inverse of stripPinFields for what it writes", () => {
    const raw = note(
      ["title: Harbor", "atlas:", "  type: settlement", "  visibility: player", ""].join("\n"),
    );
    const r = addPlacements(raw, [
      { mapId: "vale", x: 100, y: 100 },
      { mapId: "depths", x: 5.5, y: -2 },
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(parseFrontmatter(r.raw).data.atlas).toEqual({
      type: "settlement",
      visibility: "player",
      placements: [
        { mapId: "vale", x: 100, y: 100 },
        { mapId: "depths", x: 5.5, y: -2 },
      ],
    });
    expect(r.raw.endsWith(`---${body}`)).toBe(true);
    expect(stripped(r.raw)).toBe(raw);
  });

  it("adds an atlas: block, or a whole frontmatter, when there is none", () => {
    const a = addPlacements(note("title: T\n"), [{ mapId: "m", x: 1, y: 2 }]);
    const b = addPlacements("just a body\n", [{ mapId: "m", x: 1, y: 2 }]);
    for (const r of [a, b]) {
      if (!r.ok) throw new Error(r.reason);
      expect(parseFrontmatter(r.raw).data.atlas).toEqual({
        placements: [{ mapId: "m", x: 1, y: 2 }],
      });
    }
    if (b.ok) expect(b.raw.endsWith("---\njust a body\n")).toBe(true);
  });

  it("refuses a note that already has pin fields", () => {
    expect(addPlacements(note("atlas:\n  x: 1\n  y: 2\n"), [{ mapId: "m", x: 1, y: 2 }]).ok).toBe(
      false,
    );
  });
});
