import { describe, it, expect } from "vitest";
import { clickToMapPoint } from "@/atlas/sound-editor/SoundAreaLayer";

describe("clickToMapPoint", () => {
  it("flips Leaflet lat→y and keeps lng as x", () => {
    // click at lat=800 on a 1000-tall map => y = 200; lng=300 => x=300
    expect(clickToMapPoint({ lat: 800, lng: 300 }, 1000)).toEqual([300, 200]);
  });

  it("rounds fractional Leaflet coords to integer map pixels (matches RegionLayer)", () => {
    expect(clickToMapPoint({ lat: 799.6, lng: 300.4 }, 1000)).toEqual([300, 200]);
  });
});
