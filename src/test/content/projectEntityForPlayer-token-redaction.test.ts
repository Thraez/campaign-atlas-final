/**
 * R-11d: links to secret notes are redacted from the player `body` by the
 * span the wikilink tokenizer found, not by a regex rebuilt from the trimmed
 * target, so every form the tokenizer reads as a link to a secret note loses
 * the secret's name and the link's alias in both `body` and `bodyHtml`.
 */
import { describe, it, expect } from "vitest";
import {
  projectEntityWithReport,
  buildProjectionContext,
} from "@/atlas/content/projectEntityForPlayer";
import { tokenizeWikilinks } from "@/atlas/content/parseWikilinks";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id,
    title: p.title,
    type: "npc",
    visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [],
    tags: [],
    images: [],
    body: p.body ?? "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/w/x.md",
    links: [],
    backlinks: [],
  } as unknown as Entity;
}

const secret = ent({
  id: "khal-azum",
  title: "Khal Azum",
  aliases: ["The Red Hand"],
  visibility: "dm",
});
const mayor = ent({ id: "mayor", title: "Mayor", aliases: ["Her Honour"] });

function project(body: string) {
  const source = ent({ id: "src", title: "Source", body });
  const all = new Map([source, secret, mayor].map((e) => [e.id, e]));
  return projectEntityWithReport(source, buildProjectionContext(all));
}

/** Every way the secret could still be named: title, its alias, the link alias, its id. */
const SECRET_TEXT = /khal|azum|red hand|warlord/i;

describe("token-span redaction of links to secret notes", () => {
  const forms: [string, string][] = [
    ["plain", "Fear [[Khal Azum]]."],
    ["spaces inside the brackets", "Fear [[ Khal Azum ]]."],
    ["alias", "Fear [[Khal Azum|the warlord]]."],
    ["spaces around target and alias", "Fear [[ Khal Azum | the warlord ]]."],
    ["space before the pipe only", "Fear [[Khal Azum |the warlord]]."],
    ["heading", "Fear [[Khal Azum#Origins]]."],
    ["heading with spaces", "Fear [[ Khal Azum # Origins ]]."],
    ["heading and alias", "Fear [[Khal Azum#Origins|the warlord]]."],
    ["block reference", "Fear [[Khal Azum#^b1]]."],
    ["lower case", "Fear [[khal azum]]."],
    ["upper case", "Fear [[KHAL AZUM]]."],
    ["dashed (loose match)", "Fear [[khal-azum]]."],
    ["secret alias as target", "Fear [[The Red Hand]]."],
    ["folder path", "Fear [[_dm/Khal Azum]]."],
    ["note embed", "Fear ![[Khal Azum]]."],
    ["escaped pipe in a table", "| who |\n| --- |\n| [[Khal Azum\\|the warlord]] |\n"],
    ["empty alias", "Fear [[Khal Azum|]]."],
    ["note file name", "Fear [[Khal Azum.md]]."],
    ["single ] in the alias", "Fear [[Khal Azum|a]b]]."],
    ["bracketed word in the alias", "Fear [[Khal Azum|[the] warlord]]."],
    ["bracketed word in the target", "Fear [[Khal Azum [old]]]."],
    ["backtick before a blank line", "It`s [[Khal Azum]] plan.\n\nLater a `code` word."],
    ["inside an inline code span", "Write `[[Khal Azum]]` here."],
    ["inside a fenced code block", "Notes:\n\n```\nsee [[ Khal Azum | the warlord ]]\n```\n"],
  ];

  for (const [name, body] of forms) {
    it(`${name}: ${JSON.stringify(body)} leaves no secret text in body or bodyHtml`, () => {
      const { entity, report } = project(body);
      expect(entity.body).not.toMatch(SECRET_TEXT);
      expect(entity.bodyHtml).not.toMatch(SECRET_TEXT);
      expect(entity.body).toContain("…");
      expect(report.redactedLinks).toHaveLength(1);
      expect(report.redactedLinks[0].resolvedId).toBe("khal-azum");
      expect(entity.links.every((l) => l.broken && !l.resolvedId)).toBe(true);
    });
  }

  it("two links to the same secret in one body are both redacted", () => {
    const { entity, report } = project("[[Khal Azum]] rules; [[ khal azum | the warlord ]] waits.");
    expect(entity.body).toBe("… rules; … waits.");
    expect(entity.bodyHtml).not.toMatch(SECRET_TEXT);
    expect(report.redactedLinks).toHaveLength(2);
  });

  it("a link to a shipped note is untouched, next to a redacted one", () => {
    const body = "[[Mayor]], [[ Mayor ]], [[Her Honour|her]] and [[Mayor#Office]] fear [[ Khal Azum ]].";
    const { entity } = project(body);
    expect(entity.body).toBe(
      "[[Mayor]], [[ Mayor ]], [[Her Honour|her]] and [[Mayor#Office]] fear ….",
    );
    expect(entity.bodyHtml.match(/href="#\/entity\/mayor"/g)).toHaveLength(4);
    expect(entity.bodyHtml).not.toMatch(SECRET_TEXT);
  });

  it("a body with only shipped links is returned unchanged", () => {
    const body = "See [[ Mayor | her ]].\n\n`[[Mayor]]` in code stays literal.\n";
    expect(project(body).entity.body).toBe(body);
  });
});

describe("tokenizeWikilinks spans", () => {
  const resolveByName = (n: string) => (n.toLowerCase() === "mayor" ? "mayor" : undefined);

  it("reports each link's start and end in the source string, skipping code", () => {
    const body = "a [[ Mayor ]] `[[Mayor]]` b [[X|y]]";
    const { links, spans } = tokenizeWikilinks(body, { resolveByName });
    expect(links).toHaveLength(2);
    expect(spans.map((s) => body.slice(s.start, s.end))).toEqual(["[[ Mayor ]]", "[[X|y]]"]);
  });

  it("reads an escaped pipe (tables) as the alias separator", () => {
    const { links } = tokenizeWikilinks("[[Mayor\\|her]]", { resolveByName });
    expect(links[0]).toMatchObject({ target: "Mayor", display: "her", resolvedId: "mayor" });
  });

  it("reads an empty alias as no alias", () => {
    const { links } = tokenizeWikilinks("[[Mayor|]]", { resolveByName });
    expect(links[0]).toMatchObject({ target: "Mayor", display: "Mayor", resolvedId: "mayor" });
  });
});
