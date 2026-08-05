import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { handleVaultImageCopyRequest } from "../../../scripts/vite-plugin-atlas-save";
import { rewriteEmbeds } from "@/atlas/import/resolveVaultImage";

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
    expect(res.target).toBe("/atlas/assets/images/corven-1.png");
    expect(fs.existsSync(path.join(outRoot, "atlas", "assets", "images", "corven-1.png"))).toBe(true);
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
    const meta = await sharp(
      path.join(outRoot, "atlas", "assets", "images", "corven-1.png"),
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
    expect(fs.existsSync(path.join(outRoot, "atlas", "assets", "images", "corven-6.png"))).toBe(false);
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
