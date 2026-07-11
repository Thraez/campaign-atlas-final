import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// src/test/sound-editor -> repo root is three levels up.
const root = join(__dirname, "..", "..", "..");
const playerSurfaces = [
  "src/pages/AtlasViewer.tsx",
  "src/atlas/sound/SoundscapeLayer.tsx",
  "src/atlas/sound/AudioEngine.ts",
  "src/atlas/sound/SoundControl.tsx",
  "src/atlas/sound/SoundSettingsProvider.tsx",
];

describe("authoring UI is excluded from player surfaces", () => {
  for (const rel of playerSurfaces) {
    it(`${rel} does not import the sound-editor authoring code`, () => {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).not.toMatch(/sound-editor\//);
      expect(src).not.toMatch(/tabs\/SoundscapeTab/);
    });
  }
});
