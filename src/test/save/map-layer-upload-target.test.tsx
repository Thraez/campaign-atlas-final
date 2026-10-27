/**
 * eval-19: a fresh map layer upload and an old layer saved without a target
 * path land at the same file, and that file keeps its own (lossless) format.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapLayers, type LocalLayer } from "@/atlas/useMapLayers";
import { buildAssetBinaryChanges } from "@/atlas/save/buildSaveBatch";
import type { MapDocument } from "@/atlas/content/schema";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/atlas/content/browserFile", () => ({
  fileToDataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
  readImageSize: vi.fn(async () => ({ w: 640, h: 480 })),
}));

const testMap: MapDocument = {
  id: "test-map",
  worldId: "test-world",
  name: "Test",
  width: 2000,
  height: 1500,
  layers: [],
  regions: [],
  routes: [],
};

beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:fresh");
  URL.revokeObjectURL = vi.fn();
});

describe("map layer upload target path", () => {
  it("a fresh upload is saved under the maps folder with its own extension", async () => {
    const { result } = renderHook(() => useMapLayers(testMap));
    const file = new File(["x"], "Fog Overlay (v2).PNG", { type: "image/png" });

    await act(() => result.current.addUploaded([file]));

    const [layer] = result.current.localLayers;
    expect(layer.targetPath).toBe("public/atlas/assets/maps/fog-overlay-v2-.png");
    expect(buildAssetBinaryChanges([layer])[0].path).toBe(
      "public/atlas/assets/maps/fog-overlay-v2-.png",
    );
  });

  it("an old layer with no target path gets the name a fresh upload of the same file would", async () => {
    const { result } = renderHook(() => useMapLayers(testMap));
    const file = new File(["x"], "Sunken Keep.jpeg", { type: "image/jpeg" });
    await act(() => result.current.addUploaded([file]));
    const fresh = result.current.localLayers[0];

    const old: LocalLayer = { ...fresh, targetPath: undefined };

    expect(buildAssetBinaryChanges([old])[0].path).toBe(buildAssetBinaryChanges([fresh])[0].path);
    expect(buildAssetBinaryChanges([old])[0].path).toBe(
      "public/atlas/assets/maps/sunken-keep.jpeg",
    );
  });
});
