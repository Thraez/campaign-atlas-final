/**
 * scanContentFolder: which content notes the build reads, and which it only
 * knows by name (folder-excluded: `_dm/`, `_drafts/`, ...). The build and the
 * derived-secrets scan share it, so the scan always treats exactly the notes
 * the build never ships as secret.
 */
import { describe, it, expect } from "vitest";
import { scanContentFolder, type ContentFile } from "@/atlas/content/scanContentFolder";

const rules = {
  include: ["**/*.md"],
  exclude: ["**/_drafts/**", "**/_dm/**", "**/archive/**"],
};

const file = (contentPath: string, raw = "x\n"): ContentFile => ({
  contentPath,
  relPath: `content/${contentPath}`,
  raw,
});

describe("scanContentFolder", () => {
  it("splits notes into read and excluded by the config globs", () => {
    const scan = scanContentFolder(
      [
        file("w/npcs/corven.md"),
        file("w/_dm/villain.md"),
        file("w/_drafts/wip.md"),
        file("w/old/archive/x.md"),
      ],
      rules,
    );
    expect(scan.notes.map((n) => n.relPath)).toEqual(["content/w/npcs/corven.md"]);
    expect(scan.excluded.map((n) => n.relPath)).toEqual([
      "content/w/_dm/villain.md",
      "content/w/_drafts/wip.md",
      "content/w/old/archive/x.md",
    ]);
  });

  it("a note the include globs miss is excluded, not dropped", () => {
    const scan = scanContentFolder([file("top.md"), file("w/a.md")], rules);
    expect(scan.notes.map((n) => n.relPath)).toEqual(["content/w/a.md"]);
    expect(scan.excluded.map((n) => n.relPath)).toEqual(["content/top.md"]);
  });

  it("empty include reads everything not excluded", () => {
    const scan = scanContentFolder([file("top.md")], { include: [], exclude: [] });
    expect(scan.notes).toHaveLength(1);
  });

  it("a folder matched by an exclude glob excludes everything under it", () => {
    const scan = scanContentFolder([file("w/secret/deep/a.md")], {
      include: [],
      exclude: ["w/secret"],
    });
    expect(scan.excluded).toHaveLength(1);
    expect(scan.notes).toHaveLength(0);
  });

  describe("an excluded folder directly under the content root (R-07)", () => {
    // The repo's real list: `**/` must also mean zero folders.
    const real = {
      include: ["**/*.md"],
      exclude: ["**/_drafts/**", "**/_dm/**", "**/archive/**", "**/deprecated/**"],
    };
    const playerNote = "---\natlas:\n  visibility: player\n---\nBody\n";
    for (const folder of ["_dm", "_drafts", "archive", "deprecated"]) {
      it(`excludes content/${folder}/, even a player note`, () => {
        const scan = scanContentFolder(
          [file(`${folder}/spy.md`, playerNote), file(`${folder}/deep/er.md`, playerNote)],
          real,
        );
        expect(scan.notes).toEqual([]);
        expect(scan.excluded.map((n) => n.relPath)).toEqual([
          `content/${folder}/spy.md`,
          `content/${folder}/deep/er.md`,
        ]);
      });
    }

    it("matches excluded folder names case-blind (the Mac's file system is)", () => {
      const scan = scanContentFolder(
        [
          file("_DM/spy.md", playerNote),
          file("w/_Dm/spy.md", playerNote),
          file("w/Archive/old.md", playerNote),
          file("DEPRECATED/x.md", playerNote),
          file("w/_Drafts/wip.md", playerNote),
          file("w/npcs/corven.md", playerNote),
        ],
        real,
      );
      expect(scan.notes.map((n) => n.relPath)).toEqual(["content/w/npcs/corven.md"]);
      expect(scan.excluded).toHaveLength(5);
    });

    it("still needs a whole folder name: _dm-notes/ and my_dm/ are read", () => {
      const scan = scanContentFolder([file("_dm-notes/a.md"), file("w/my_dm/b.md")], real);
      expect(scan.notes).toHaveLength(2);
    });
  });

  it("keeps the order it was given", () => {
    const scan = scanContentFolder([file("w/b.md"), file("w/a.md")], rules);
    expect(scan.notes.map((n) => n.relPath)).toEqual(["content/w/b.md", "content/w/a.md"]);
  });

  it("reads each note with readNote (title, id, visibility)", () => {
    const scan = scanContentFolder(
      [file("w/npcs/corven.md", "---\natlas:\n  visibility: player\n---\nBody\n")],
      rules,
    );
    const [n] = scan.notes;
    expect(n.title).toBe("Corven");
    expect(n.id).toBe("corven");
    expect(n.visibility).toBe("player");
  });

  it("refuses to guess about a note with malformed frontmatter", () => {
    expect(() =>
      scanContentFolder([file("w/_dm/bad.md", "---\natlas: [oops\n---\n")], rules),
    ).toThrow(/content\/w\/_dm\/bad\.md/);
  });
});
