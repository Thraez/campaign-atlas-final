import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ATLAS_ASSETS_CACHE } from "@/pwaCacheNames";

const ROOT = path.resolve(__dirname, "../../..");
const VITE_CONFIG = path.join(ROOT, "vite.config.ts");

describe("vite.config — Workbox audio caching", () => {
  it("atlas-assets rule includes rangeRequests: true and status 206", () => {
    // The cache name lives in src/pwaCacheNames.ts, shared with src/pwa.ts.
    expect(ATLAS_ASSETS_CACHE).toBe("atlas-assets");
    const content = fs.readFileSync(VITE_CONFIG, "utf8");
    const anchor = "cacheName: ATLAS_ASSETS_CACHE";
    expect(content).toContain(anchor);
    expect(content).toMatch(/rangeRequests:\s*true/);
    // 206 must appear alongside the atlas-assets config (partial content for audio streaming)
    const idx = content.indexOf(anchor);
    const nearby = content.slice(idx, idx + 400);
    expect(nearby).toMatch(/206/);
  });
});
