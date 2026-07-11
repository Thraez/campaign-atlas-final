import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshotBaseline } from "./snapshot-baseline";

describe("snapshotBaseline", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
    fs.mkdirSync(path.join(root, "public", "atlas"), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("copies atlas.json to .last-published.json", () => {
    fs.writeFileSync(path.join(root, "public/atlas/atlas.json"), '{"v":1}');
    const result = snapshotBaseline(root);
    expect(result).toBe(true);
    expect(fs.readFileSync(path.join(root, "public/atlas/.last-published.json"), "utf8")).toBe('{"v":1}');
  });

  it("returns false (no throw) when atlas.json is absent", () => {
    expect(snapshotBaseline(root)).toBe(false);
  });
});
