/**
 * R-01: `check-vault-content` fails publish while hosting is public if
 * `content/` holds a file Sync from Obsidian wrote: one carrying Sync's
 * `atlas.source: vault` marker, or one the machine-local sync map names.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../../scripts/check-vault-content";
import { hashContent } from "@/atlas/save/localFsSave";

const REPO = path.resolve(__dirname, "../..");
const NOTE = "---\ntitle: Corven\natlas:\n  id: corven\n---\nA smuggler.\n";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-vault-content-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  fs.mkdirSync(path.join(tmp, "content", "w", "npcs"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "content", "w", "npcs", "corven.md"), NOTE);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function config(hosting?: string) {
  fs.writeFileSync(
    path.join(tmp, "atlas.config.json"),
    JSON.stringify({ contentRoot: "content", ...(hosting ? { hosting } : {}) }),
  );
}
function syncMap(map: unknown) {
  fs.mkdirSync(path.join(tmp, ".local-atlas"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".local-atlas", "sync-map.json"), JSON.stringify(map));
}

describe("check-vault-content", () => {
  it("fails on a marked file with no sync map (a fresh clone), while public", async () => {
    config("public");
    fs.writeFileSync(
      path.join(tmp, "content", "w", "npcs", "corven.md"),
      "---\ntitle: Corven\natlas:\n  id: corven\n  source: vault\n---\nA smuggler.\n",
    );
    expect(fs.existsSync(path.join(tmp, ".local-atlas"))).toBe(false);
    expect(await run({ root: tmp })).toBe(19);
    config("private");
    expect(await run({ root: tmp })).toBe(0);
  });

  it("ignores a `source` that isn't the vault marker", async () => {
    config("public");
    fs.writeFileSync(
      path.join(tmp, "content", "w", "npcs", "corven.md"),
      "---\ntitle: Corven\nsource: vault\natlas:\n  id: corven\n  source: handwritten\n---\nA smuggler.\n",
    );
    expect(await run({ root: tmp })).toBe(0);
  });

  it("fails on a content file whose id the sync map names, while public", async () => {
    config("public");
    syncMap({ "03_Entities/Corven.md": { id: "corven", baseType: "npc" } });
    expect(await run({ root: tmp })).toBe(19);
  });

  it("fails on a file whose bytes are what the last sync wrote, whatever its id", async () => {
    config("public");
    syncMap({
      "03_Entities/Renamed.md": {
        id: "renamed",
        baseType: "npc",
        syncedFileHash: await hashContent(NOTE),
      },
    });
    expect(await run({ root: tmp })).toBe(19);
  });

  it("fails closed with no config, a missing key or an invalid value", async () => {
    syncMap({ "03_Entities/Corven.md": { id: "corven", baseType: "npc" } });
    expect(await run({ root: tmp })).toBe(19);
    config();
    expect(await run({ root: tmp })).toBe(19);
    config("privat");
    expect(await run({ root: tmp })).toBe(19);
  });

  it("fails closed on a sync map it can't read", async () => {
    config("public");
    fs.mkdirSync(path.join(tmp, ".local-atlas"));
    fs.writeFileSync(path.join(tmp, ".local-atlas", "sync-map.json"), "{ broken");
    expect(await run({ root: tmp })).toBe(19);
  });

  it("passes when no content file came from the vault", async () => {
    config("public");
    expect(await run({ root: tmp })).toBe(0); // no sync map
    syncMap({ "03_Entities/Other.md": { id: "someone-else", baseType: "npc" } });
    expect(await run({ root: tmp })).toBe(0);
  });

  it("passes when hosting is private, synced files and all", async () => {
    config("private");
    syncMap({ "03_Entities/Corven.md": { id: "corven", baseType: "npc" } });
    expect(await run({ root: tmp })).toBe(0);
  });

  describe("compared against this machine's vault", () => {
    const BODY = "Corven runs the night docks and owes the harbourmaster a favour.";
    function vault(notes: Record<string, string>) {
      const v = path.join(tmp, "vault");
      for (const [rel, raw] of Object.entries(notes)) {
        fs.mkdirSync(path.dirname(path.join(v, rel)), { recursive: true });
        fs.writeFileSync(path.join(v, rel), raw);
      }
      fs.mkdirSync(path.join(tmp, ".local-atlas"), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, ".local-atlas", "editor-settings.json"),
        JSON.stringify({ vaultPath: v }),
      );
    }

    it("fails on a byte-for-byte copy, line endings aside", async () => {
      config("public");
      vault({ "03_Entities/Corven.md": NOTE.replace(/\n/g, "\r\n") });
      expect(await run({ root: tmp })).toBe(19);
    });

    it("fails on the same body under rewritten frontmatter", async () => {
      config("public");
      vault({ "03_Entities/Corven.md": `---\ntags: [npc]\n---\n${BODY}\n` });
      fs.writeFileSync(
        path.join(tmp, "content", "w", "npcs", "corven.md"),
        `---\ntitle: Corven\natlas:\n  id: corven\n---\n\n${BODY}\n`,
      );
      expect(await run({ root: tmp })).toBe(19);
    });

    it("matches on hashes only: same title, other text passes; short bodies and .obsidian/ are ignored", async () => {
      config("public");
      vault({
        "03_Entities/Corven.md": "---\ntitle: Corven\n---\nSomeone else entirely.\n",
        "Other/short.md": "---\ntitle: X\n---\nA smuggler.\n",
        ".obsidian/copy.md": NOTE,
      });
      expect(await run({ root: tmp })).toBe(0);
    });

    it("skips the signal, and says so, when the vault path is missing", async () => {
      config("public");
      vault({});
      fs.writeFileSync(
        path.join(tmp, ".local-atlas", "editor-settings.json"),
        JSON.stringify({ vaultPath: path.join(tmp, "nowhere") }),
      );
      expect(await run({ root: tmp })).toBe(0);
      expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toMatch(
        /vault comparison skipped/,
      );
    });
  });

  it("fails on a symlink anywhere under content/ while public, and names it", async () => {
    config("public");
    const target = path.join(tmp, "elsewhere");
    fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(tmp, "content", "w", "linked"));
    expect(await run({ root: tmp })).toBe(19);
    expect(vi.mocked(console.error).mock.calls.flat().join("\n")).toMatch(/content\/w\/linked/);
    config("private");
    expect(await run({ root: tmp })).toBe(0);
  });

  it("passes on the repo's own sample content (Astrath)", async () => {
    // The real content dir and config, with a sync map naming none of it.
    config("public");
    syncMap({ "03_Entities/Nobody.md": { id: "r01-not-in-the-sample", baseType: "npc" } });
    expect(
      await run({
        root: tmp,
        config: path.join(REPO, "atlas.config.json"),
        contentDir: path.join(REPO, "content"),
      }),
    ).toBe(0);
  });
});
