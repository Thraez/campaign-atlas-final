/**
 * readNote: the one place a note's id, title, type and visibility are worked
 * out (code-retro 06). The build, Staging, the merge and the safety scans all
 * call it, so these rules are the rules everywhere.
 */
import { describe, it, expect } from "vitest";
import { readNote } from "@/atlas/content/readNote";

const fm = (yaml: string, body = "Body.\n") => `---\n${yaml}\n---\n${body}`;

describe("readNote visibility (ADR-0001)", () => {
  it("a note with no visibility is dm and secret", () => {
    const n = readNote(fm("title: Corven"), "npcs/corven.md");
    expect(n.visibility).toBe("dm");
    expect(n.visibilityTagged).toBe(false);
    expect(n.isSecret).toBe(true);
  });

  it("a note with no frontmatter at all is dm and secret", () => {
    const n = readNote("Just prose.\n", "npcs/corven.md");
    expect(n.visibility).toBe("dm");
    expect(n.isSecret).toBe(true);
  });

  it("an explicit player or rumor tag ships", () => {
    for (const v of ["player", "rumor"]) {
      const n = readNote(fm(`atlas:\n  visibility: ${v}`), "a.md");
      expect(n.visibility).toBe(v);
      expect(n.visibilityTagged).toBe(true);
      expect(n.isSecret).toBe(false);
    }
  });

  it("hidden and dm tags never ship", () => {
    for (const v of ["dm", "hidden"]) {
      const n = readNote(fm(`atlas:\n  visibility: ${v}`), "a.md");
      expect(n.visibility).toBe(v);
      expect(n.isSecret).toBe(true);
    }
  });

  it("legacy publish: true ships as player", () => {
    const n = readNote(fm("atlas:\n  publish: true"), "a.md");
    expect(n.visibility).toBe("player");
    expect(n.visibilityTagged).toBe(true);
    expect(n.isSecret).toBe(false);
  });

  it("publish: false hides even a player note", () => {
    const n = readNote(fm("atlas:\n  visibility: player\n  publish: false"), "a.md");
    expect(n.isSecret).toBe(true);
  });

  it("an invalid visibility is dm with a warning, even with publish: true", () => {
    const n = readNote(fm("atlas:\n  visibility: plyer\n  publish: true"), "x/a.md");
    expect(n.visibility).toBe("dm");
    expect(n.visibilityTagged).toBe(true);
    expect(n.isSecret).toBe(true);
    expect(n.warnings).toEqual(['x/a.md: invalid atlas.visibility "plyer" — defaulted to "dm"']);
  });

  it("a top-level visibility outside the atlas block is not read", () => {
    const n = readNote(fm("visibility: player"), "a.md");
    expect(n.visibility).toBe("dm");
    expect(n.isSecret).toBe(true);
  });

  it("malformed YAML fails closed: dm, secret, and a parse error", () => {
    const n = readNote("---\natlas: [unclosed\n  visibility: player\n---\nBody\n", "Lost Note.md");
    expect(n.parseError).toBeTruthy();
    expect(n.visibility).toBe("dm");
    expect(n.isSecret).toBe(true);
    expect(n.title).toBe("Lost Note");
  });

  it("a line starting with --- that isn't a clean fence fails closed (review leak case)", () => {
    // gray-matter ends the frontmatter at `---x: 1`, so main read this note as
    // untagged (dm). Reading past it would find `visibility: player`.
    const raw = "---\ntitle: Something\n---x: 1\natlas:\n  visibility: player\n---\nbody";
    const n = readNote(raw, "w/something.md");
    expect(n.parseError).toMatch(/clean closing/);
    expect(n.visibility).toBe("dm");
    expect(n.isSecret).toBe(true);
  });

  it("a clean closing fence may carry trailing spaces", () => {
    const n = readNote("---\natlas:\n  visibility: player\n---  \nbody", "a.md");
    expect(n.parseError).toBeUndefined();
    expect(n.visibility).toBe("player");
    expect(n.body).toBe("body");
  });

  it("a ---- line is not a fence either", () => {
    const n = readNote("---\natlas:\n  visibility: player\n----\nbody", "a.md");
    expect(n.parseError).toBeTruthy();
    expect(n.visibility).toBe("dm");
  });
});

describe("readNote aliases", () => {
  it("atlas.aliases, else a flat aliases:, strings only", () => {
    expect(readNote(fm("atlas:\n  aliases: [Kell, 3]"), "a.md").aliases).toEqual(["Kell"]);
    expect(readNote(fm("aliases: Kell"), "a.md").aliases).toEqual(["Kell"]);
    expect(readNote(fm("aliases: [a]\natlas:\n  aliases: [b]"), "a.md").aliases).toEqual(["b"]);
    expect(readNote(fm("title: X"), "a.md").aliases).toEqual([]);
  });
});

describe("readNote title", () => {
  it("frontmatter title wins, trimmed", () => {
    expect(readNote(fm("title: '  corven the Bold  '"), "notes/corven.md").title).toBe(
      "corven the Bold",
    );
  });

  it("a blank or non-string title falls back to the filename", () => {
    expect(readNote(fm("title: '   '"), "notes/edric.md").title).toBe("Edric");
    expect(readNote(fm("title: 42"), "notes/npc.md").title).toBe("Npc");
    expect(readNote(fm("title: true"), "notes/npc.md").title).toBe("Npc");
    expect(readNote(fm("title:\n  title: Npc"), "notes/npc.md").title).toBe("Npc");
  });

  it("a filename is title-cased with dashes and underscores as spaces (the build's rule)", () => {
    expect(readNote("x", "notes/great-hall.md").title).toBe("Great Hall");
    expect(readNote("x", "notes/great---hall.md").title).toBe("Great Hall");
    expect(readNote("x", "notes/lost_city.md").title).toBe("Lost City");
    expect(readNote("x", "notes/the-lost_city.md").title).toBe("The Lost City");
    expect(readNote("x", "notes/-the-way.md").title).toBe("The Way");
    expect(readNote("x", "notes/ñoño.md").title).toBe("Ñoño");
  });

  it("a hand-typed Obsidian filename gets the same treatment", () => {
    expect(readNote("x", "Vault/01_Lore/Isle de Marque.md").title).toBe("Isle De Marque");
    expect(readNote("x", "Khal_Azum.md").title).toBe("Khal Azum");
    expect(readNote("x", "Corven.md").title).toBe("Corven");
  });

  it("works with Windows separators and an upper-case extension", () => {
    expect(readNote("x", "vault\\npcs\\Isle de Marque.MD").title).toBe("Isle De Marque");
  });
});

describe("readNote id", () => {
  it("atlas.id wins", () => {
    const n = readNote(fm("title: Corven\natlas:\n  id: corven-the-elder"), "a.md");
    expect(n.id).toBe("corven-the-elder");
    expect(n.idFromFrontmatter).toBe(true);
  });

  it("else the slug of the title", () => {
    const n = readNote(fm("title: Isle de Marque"), "a.md");
    expect(n.id).toBe("isle-de-marque");
    expect(n.idFromFrontmatter).toBe(false);
  });

  it("an empty atlas.id is ignored", () => {
    const n = readNote(fm("title: Corven\natlas:\n  id: ''"), "a.md");
    expect(n.id).toBe("corven");
    expect(n.idFromFrontmatter).toBe(false);
  });
});

describe("readNote type", () => {
  it("atlas.type first", () => {
    expect(readNote(fm("type: town\natlas:\n  type: npc"), "a.md").type).toBe("npc");
  });

  it("then a flat top-level type:, trimmed", () => {
    expect(readNote(fm("type: ' settlement '"), "a.md").type).toBe("settlement");
  });

  it("undefined when the note names no type", () => {
    expect(readNote(fm("title: X"), "npcs/a.md").type).toBeUndefined();
  });
});

describe("readNote body and data", () => {
  it("returns the frontmatter data, the atlas block and the body", () => {
    const n = readNote(fm("title: X\natlas:\n  summary: S", "Hello\n"), "a.md");
    expect(n.data.title).toBe("X");
    expect(n.atlas).toEqual({ summary: "S" });
    expect(n.body).toBe("Hello\n");
  });

  it("an atlas block that isn't a mapping reads as empty", () => {
    expect(readNote(fm("atlas: nope"), "a.md").atlas).toEqual({});
  });
});
