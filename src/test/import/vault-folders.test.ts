import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleVaultFoldersRequest } from "../../../scripts/vite-plugin-atlas-save";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-folders-"));
  fs.mkdirSync(path.join(root, "03_Entities"));
  fs.writeFileSync(path.join(root, "03_Entities", "Corven.md"), "# Corven");
  fs.writeFileSync(path.join(root, "03_Entities", "Edric.md"), "# Edric");
  fs.mkdirSync(path.join(root, "03_Entities", "minor"));
  fs.writeFileSync(path.join(root, "03_Entities", "minor", "Soreth.md"), "# Soreth");
  fs.mkdirSync(path.join(root, "10_DmNotesAndSecrets"));
  fs.writeFileSync(path.join(root, "10_DmNotesAndSecrets", "Cabal.md"), "# Cabal");
  fs.writeFileSync(path.join(root, "loose.md"), "# Loose");
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("handleVaultFoldersRequest", () => {
  it("counts notes per top-level folder, recursively", async () => {
    const res = await handleVaultFoldersRequest(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const entities = res.folders.find((f) => f.name === "03_Entities");
    expect(entities?.noteCount).toBe(3);
  });

  it("returns no file contents", async () => {
    const res = await handleVaultFoldersRequest(root);
    expect(JSON.stringify(res)).not.toContain("Corven");
  });

  it("lists every top-level folder so the DM chooses, and never pre-picks", async () => {
    const res = await handleVaultFoldersRequest(root);
    if (!res.ok) return;
    const names = res.folders.map((f) => f.name);
    expect(names).toContain("10_DmNotesAndSecrets");
    expect(res.folders.every((f) => !("selected" in f))).toBe(true);
  });

  it("errors cleanly when the path is not a directory", async () => {
    const res = await handleVaultFoldersRequest(path.join(root, "loose.md"));
    expect(res).toEqual({ ok: false, status: 400, error: "VaultNotDirectory" });
  });
});
