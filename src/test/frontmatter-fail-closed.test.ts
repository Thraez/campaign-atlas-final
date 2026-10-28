/**
 * code-retro 06, second safety review: frontmatter that gray-matter (main's
 * build parser) reads must never come back from `parseFrontmatter` as "no
 * frontmatter". If it did, the note would lose its title, aliases and
 * atlas.id, a player note's `[[Real Name]]` link to it would no longer
 * resolve, and neither the build nor the derived-secrets scan would redact
 * the name. Such notes must stop the player build instead, in every folder.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { parseFrontmatter } from "@/atlas/content/frontmatter";
import { runBuild } from "../../scripts/build-atlas";
import { deriveSecretsFromVault } from "../../scripts/check-derived-secrets";

const VILLAIN =
  "--- \ntitle: Lord Vexmoor\naliases: [Pale Kingsworn]\natlas:\n  visibility: dm\n---\nThe pale king.\n";
const TRAITOR = "---\ntitle: Sister Ashgrave\natlas:\n  visibility: dm\n";
const HARBOR =
  "---\ntitle: Harbor\natlas:\n  visibility: player\n---\nRumours of [[Lord Vexmoor]] and [[Pale Kingsworn]] and [[Sister Ashgrave]].\n";

const tmps: string[] = [];
afterEach(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

function vault(notes: Record<string, string>): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fm-fail-closed-"));
  tmps.push(tmp);
  const configPath = path.join(tmp, "atlas.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: ["**/_dm/**", "**/_drafts/**"],
    }),
  );
  fs.mkdirSync(path.join(tmp, "content/w/_atlas"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "content/w/_atlas/world.yaml"),
    "schemaVersion: 1\nmaps:\n  - id: m1\n    name: M\n    width: 100\n    height: 100\n    layers: []\n",
  );
  for (const [rel, raw] of Object.entries(notes)) {
    const abs = path.join(tmp, "content", rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, raw);
  }
  return configPath;
}

/** Runs the player build; returns its error message, or undefined if it shipped. */
async function playerBuildError(configPath: string): Promise<string | undefined> {
  const outDir = path.join(path.dirname(configPath), "player-out");
  try {
    const r = await runBuild({ player: true, strict: false, configPath, outDir });
    return r.error === undefined ? undefined : String(r.error);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("review repro: gray-matter frontmatter the parser must not skip", () => {
  it("the player build stops and names the file", async () => {
    const cfg = vault({
      "w/notes/villain.md": VILLAIN,
      "w/_dm/traitor.md": TRAITOR,
      "w/notes/harbor.md": HARBOR,
    });
    const err = await playerBuildError(cfg);
    expect(err).toMatch(/villain\.md|traitor\.md/);
    expect(err).toMatch(/frontmatter/);
    expect(fs.existsSync(path.join(path.dirname(cfg), "player-out/atlas.json"))).toBe(false);
  });

  it("the derived-secrets scan stops too, instead of deriving filename names", () => {
    const cfg = vault({
      "w/notes/villain.md": VILLAIN,
      "w/_dm/traitor.md": TRAITOR,
      "w/notes/harbor.md": HARBOR,
    });
    expect(() => deriveSecretsFromVault(cfg)).toThrow(/villain\.md|traitor\.md/);
  });

  const folders = ["w/notes", "w/_dm", "w/_drafts"];
  const broken: Record<string, string> = {
    "opening fence with text after it": "---x\ntitle: A\n---\nbody\n",
    "opening fence with a language": "---yaml\ntitle: A\n---\nbody\n",
    "no closing fence": TRAITOR,
    "dirty closing fence": "---\ntitle: A\n---x: 1\nbody\n",
  };
  for (const folder of folders) {
    for (const [label, raw] of Object.entries(broken)) {
      it(`${label} in ${folder} stops the player build, naming the file`, async () => {
        const cfg = vault({ [`${folder}/bad.md`]: raw, "w/notes/harbor.md": HARBOR });
        const err = await playerBuildError(cfg);
        expect(err).toContain(`${folder.slice(2)}/bad.md`);
      });
    }
  }

  it("a clean opening fence with trailing spaces is read, not dropped", () => {
    const p = parseFrontmatter(VILLAIN);
    expect(p.data.title).toBe("Lord Vexmoor");
    expect(p.data.aliases).toEqual(["Pale Kingsworn"]);
  });
});

describe("parity with gray-matter: same keys or a parse error, never silently none", () => {
  const OPENERS = [
    "---",
    "--- ",
    "---\t",
    "---  ",
    "----",
    "---x",
    "---yaml",
    "--- x",
    "\uFEFF---",
  ];
  const BODIES = [
    "title: A\natlas:\n  visibility: dm\n",
    "title: A\n",
    "",
    "atlas:\n  visibility: player\n",
  ];
  const CLOSERS = ["---\n", "--- \n", "---\t\n", "----\n", "---x: 1\n", "---", "", "...\n"];
  const AFTER = ["body\n", "", "more: 1\n---\nbody\n", "atlas:\n  visibility: player\n---\nbody\n"];
  const EOL = ["\n", "\r\n"];

  const inputs: string[] = [];
  for (const o of OPENERS)
    for (const b of BODIES)
      for (const c of CLOSERS)
        for (const a of AFTER)
          for (const eol of EOL) inputs.push(`${o}\n${b}${c}${a}`.replace(/\n/g, eol));
  inputs.push("no frontmatter\n---\ntitle: X\n---\n", "", "---", "---\n");

  it(`covers ${inputs.length} inputs`, () => {
    let checked = 0;
    for (const raw of inputs) {
      if (!hasFrontmatter(raw)) continue;
      let gm: Record<string, unknown>;
      try {
        // Fresh options object: gray-matter caches results by input otherwise.
        gm = matter(raw, {}).data;
      } catch {
        continue; // gray-matter's own YAML error: main's build stopped too.
      }
      checked++;
      let ours: Record<string, unknown>;
      try {
        ours = parseFrontmatter(raw).data;
      } catch {
        continue; // a parse error is the fail-closed answer
      }
      expect({ raw, data: ours }).toEqual({ raw, data: gm });
    }
    expect(checked).toBeGreaterThan(100);
  });
});

/** gray-matter's own test for "there is frontmatter": starts with `---` but not `----`. */
function hasFrontmatter(raw: string): boolean {
  const s = raw.replace(/^\uFEFF/, "");
  return s.startsWith("---") && s.charAt(3) !== "-";
}
