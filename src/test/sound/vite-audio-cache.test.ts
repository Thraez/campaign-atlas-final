import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const VITE_CONFIG = path.join(ROOT, "vite.config.ts");

describe("vite.config — Workbox audio caching", () => {
  it("atlas-assets rule includes rangeRequests: true and status 206", () => {
    const content = fs.readFileSync(VITE_CONFIG, "utf8");
    expect(content).toContain('"atlas-assets"');
    expect(content).toMatch(/rangeRequests:\s*true/);
    // 206 must appear alongside the atlas-assets config (partial content for audio streaming)
    const idx = content.indexOf('"atlas-assets"');
    const nearby = content.slice(idx, idx + 400);
    expect(nearby).toMatch(/206/);
  });
});
