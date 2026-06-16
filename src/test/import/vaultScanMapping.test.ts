import { describe, it, expect } from "vitest";
import { vaultScanResultToInputs } from "@/atlas/import/useMdImportFlow";

describe("vaultScanResultToInputs", () => {
  it("maps two files to staging inputs with correct filename, raw, and vaultRelPath", () => {
    const files = {
      "note.md": "hello world",
      "sub/nested.md": "nested content",
    };
    const inputs = vaultScanResultToInputs(files);
    expect(inputs).toHaveLength(2);

    const note = inputs.find((i) => i.vaultRelPath === "note.md");
    expect(note).toMatchObject({ filename: "note.md", raw: "hello world", vaultRelPath: "note.md" });

    const nested = inputs.find((i) => i.vaultRelPath === "sub/nested.md");
    expect(nested).toMatchObject({
      filename: "nested.md",
      raw: "nested content",
      vaultRelPath: "sub/nested.md",
    });
  });

  it("extracts basename from deeply nested vault paths", () => {
    const files = { "a/b/c/deep.md": "deep content" };
    const inputs = vaultScanResultToInputs(files);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].filename).toBe("deep.md");
    expect(inputs[0].vaultRelPath).toBe("a/b/c/deep.md");
    expect(inputs[0].raw).toBe("deep content");
  });
});
