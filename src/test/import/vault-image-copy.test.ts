import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  handleVaultImageCopyRequest,
  handleVaultScanRequest,
} from "../../../scripts/vite-plugin-atlas-save";
import { rewriteEmbeds } from "@/atlas/import/resolveVaultImage";
import { MAX_IMAGE_WIDTH } from "@/atlas/assets/imageEncoding";
import { buildStagingRows, type StagingContext } from "@/atlas/import/stagingState";
import type { ImportFolderConfig } from "@/atlas/content/schema";

let root: string;
let outRoot: string;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-img-"));
  outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-img-out-"));
  fs.mkdirSync(path.join(root, "03_Entities", "pics"), { recursive: true });
  fs.mkdirSync(path.join(root, "10_DmNotesAndSecrets"), { recursive: true });
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .withExifMerge({ IFD0: { Copyright: "SECRET-LOCATION" } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(root, "03_Entities", "pics", "portrait.png"), png);
  fs.writeFileSync(path.join(root, "10_DmNotesAndSecrets", "cabal-lair.png"), png);

  // GIF is excluded from conversion because sharp would flatten a multi-frame
  // image to a single still. This fixture is a plain one-frame GIF — it pins
  // the rule that a GIF is republished as a GIF; the animation case is the
  // reason the rule exists, not something this fixture can demonstrate.
  const gif = await sharp({
    create: { width: 8, height: 16, channels: 3, background: { r: 9, g: 9, b: 9 } },
  })
    .gif()
    .toBuffer();
  fs.writeFileSync(path.join(root, "03_Entities", "pics", "banner.gif"), gif);

  // Wider than MAX_IMAGE_WIDTH, to prove the clamp fires.
  const wide = await sharp({
    create: { width: 2400, height: 600, channels: 3, background: { r: 4, g: 5, b: 6 } },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(root, "03_Entities", "pics", "wide.png"), wide);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outRoot, { recursive: true, force: true });
});

describe("handleVaultImageCopyRequest", () => {
  it("copies an in-scope image and names it from the entity", async () => {
    const res = await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "portrait.png",
      entityId: "corven",
      index: 0,
      publicDir: outRoot,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.target).toBe("/atlas/assets/images/corven-1.webp");
    expect(fs.existsSync(path.join(outRoot, "atlas", "assets", "images", "corven-1.webp"))).toBe(
      true,
    );
  });

  it("strips metadata from the copy", async () => {
    await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "portrait.png",
      entityId: "corven",
      index: 0,
      publicDir: outRoot,
    });
    // Read the bytes rather than the path: `sharp(path)` keeps the file handle
    // open, which on Windows blocks both a later overwrite and the temp-dir
    // cleanup in afterAll.
    const meta = await sharp(
      fs.readFileSync(path.join(outRoot, "atlas", "assets", "images", "corven-1.webp")),
    ).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("refuses an image from a folder the DM did not pick, and writes nothing", async () => {
    const res = await handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "cabal-lair.png",
      entityId: "corven",
      index: 5,
      publicDir: outRoot,
    });
    expect(res).toEqual({ ok: false, reason: "outside-candidates" });
    expect(fs.existsSync(path.join(outRoot, "atlas", "assets", "images", "corven-6.png"))).toBe(
      false,
    );
  });
});

describe("published image format", () => {
  const copy = (rawSrc: string, entityId: string, index: number) =>
    handleVaultImageCopyRequest({
      vaultRoot: root,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc,
      entityId,
      index,
      publicDir: outRoot,
    });

  /**
   * Read metadata from bytes, never from a path. `sharp(path)` reads lazily and
   * keeps the file handle open, which on Windows blocks a later write to that
   * same path — a copy into it then fails as "unreadable". Every test here also
   * uses its own entity id so no two tests share an output filename.
   */
  const metaOf = async (name: string) =>
    sharp(fs.readFileSync(path.join(outRoot, "atlas", "assets", "images", name))).metadata();

  it("publishes a PNG embed as WebP, so painted art stops shipping at PNG size", async () => {
    const res = await copy("portrait.png", "pngconv", 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.target).toBe("/atlas/assets/images/pngconv-1.webp");

    // The name is only half of it — the bytes must actually be WebP, or the
    // file lies about itself to every downstream scan.
    expect((await metaOf("pngconv-1.webp")).format).toBe("webp");
  });

  it("republishes a GIF as a GIF rather than flattening it to a still", async () => {
    const res = await copy("banner.gif", "gifkeep", 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.target).toBe("/atlas/assets/images/gifkeep-1.gif");
    expect((await metaOf("gifkeep-1.gif")).format).toBe("gif");
  });

  it("clamps an oversized image to the published width ceiling", async () => {
    const res = await copy("wide.png", "widecopy", 0);
    expect(res.ok).toBe(true);
    expect((await metaOf("widecopy-1.webp")).width).toBe(MAX_IMAGE_WIDTH);
  });

  it("does not upscale art that is already smaller than the ceiling", async () => {
    const res = await copy("portrait.png", "smallcopy", 0);
    expect(res.ok).toBe(true);
    expect((await metaOf("smallcopy-1.webp")).width).toBe(8);
  });
});

describe("rewriteEmbeds", () => {
  it("replaces a wiki embed with a normal image link", () => {
    const body = "He waits here.\n\n![[portrait.png]]\n";
    expect(rewriteEmbeds(body, { "portrait.png": "/atlas/assets/images/corven-1.png" })).toBe(
      "He waits here.\n\n![](/atlas/assets/images/corven-1.png)\n",
    );
  });

  it("removes an embed that was refused, leaving no broken link", () => {
    const body = "He waits here.\n\n![[cabal-lair.png]]\n";
    expect(rewriteEmbeds(body, {})).toBe("He waits here.\n\n\n");
  });

  it("leaves ordinary wikilinks alone", () => {
    const body = "See [[Edric]] for more.";
    expect(rewriteEmbeds(body, {})).toBe("See [[Edric]] for more.");
  });
});

function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const abs = path.join(e.parentPath ?? e.path, e.name);
    if (!e.isFile()) continue;
    out[abs] = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  return out;
}

describe("the vault is never written", () => {
  // Uses its own fixture (never `root`/`outRoot` from the top-level `beforeAll`)
  // so the "before" snapshot can't be contaminated by an earlier test's own
  // handleVaultImageCopyRequest call against the shared portrait.png — that
  // shared state made an earlier version of this test pass even with a stray
  // write injected into the handler, which is exactly the vacuous-test trap
  // the mandatory mutation check exists to catch.
  let immRoot: string;
  let immOutRoot: string;

  beforeAll(async () => {
    immRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-img-imm-"));
    immOutRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-img-imm-out-"));
    fs.mkdirSync(path.join(immRoot, "03_Entities", "pics"), { recursive: true });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(immRoot, "03_Entities", "pics", "portrait.png"), png);
  });

  afterAll(() => {
    fs.rmSync(immRoot, { recursive: true, force: true });
    fs.rmSync(immOutRoot, { recursive: true, force: true });
  });

  it("is byte-identical after a full scan plus an image copy", async () => {
    const before = hashTree(immRoot);
    await handleVaultScanRequest(immRoot, [], ["03_Entities"]);
    await handleVaultImageCopyRequest({
      vaultRoot: immRoot,
      candidateFolders: ["03_Entities"],
      noteRelPath: "03_Entities/Corven.md",
      rawSrc: "portrait.png",
      entityId: "corven",
      index: 0,
      publicDir: immOutRoot,
    });
    expect(hashTree(immRoot)).toEqual(before);
  });
});

const VISIBILITY_TEST_IMPORT_CONFIG: ImportFolderConfig = {
  folders: { npc: "npcs" },
  defaultFolder: "imports",
};
const VISIBILITY_TEST_ALLOWED_FOLDERS: ReadonlySet<string> = new Set([
  ...Object.values(VISIBILITY_TEST_IMPORT_CONFIG.folders),
  VISIBILITY_TEST_IMPORT_CONFIG.defaultFolder,
]);

describe("visibility is never left to the build default", () => {
  it("a new entity from a vault note is written dm, not player", () => {
    const ctx: StagingContext = {
      worldId: "astrath-deeprealm",
      importConfig: VISIBILITY_TEST_IMPORT_CONFIG,
      allowedFolders: VISIBILITY_TEST_ALLOWED_FOLDERS,
      existingById: new Map(),
      existingPaths: new Set(),
    };
    const rows = buildStagingRows(
      [
        {
          filename: "Corven.md",
          raw: "---\ntitle: Corven\ntags: [npc]\n---\n\nA smuggler.\n",
          vaultRelPath: "03_Entities/Corven.md",
          vaultState: "new",
        },
      ],
      ctx,
    );
    // build-atlas.ts:425 defaults a missing visibility to PLAYER, so an absent
    // key is a leak rather than a neutral state. New entities must be explicit.
    expect(rows[0].resolvedVisibility).toBe("dm");
  });
});
