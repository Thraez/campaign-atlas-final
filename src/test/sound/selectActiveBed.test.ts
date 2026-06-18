import { describe, it, expect } from "vitest";
import { selectActiveBed, type PreparedArea } from "@/atlas/sound/resolveSoundscape";
import type { BBox } from "@/atlas/geometry/polygon";

const rect = (minX: number, minY: number, maxX: number, maxY: number): BBox => ({ minX, minY, maxX, maxY });
const sq = (id: string, x0: number, y0: number, x1: number, y1: number): PreparedArea => ({
  id,
  points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  bbox: rect(x0, y0, x1, y1),
  bboxArea: (x1 - x0) * (y1 - y0),
  bed: { src: `${id}.ogg` },
});

// Region 0..1000 (large), city 400..600 (small, nested), on a 0..1000 world.
const region = sq("region", 0, 0, 1000, 1000);
const city = sq("city", 400, 600, 600, 800); // centre (500,700)

describe("selectActiveBed", () => {
  it("is silent at world overview (area covers < FILL_MIN of the screen)", () => {
    // view spans the whole world; region covers 100% — but use a tiny area to prove the gate
    const tiny = sq("tiny", 480, 480, 520, 520); // 40x40 on a 1000x1000 view => coverage 0.0016
    const view = rect(0, 0, 1000, 1000);
    expect(selectActiveBed([tiny], 500, 500, view, null)).toBeNull();
  });

  it("plays a region once it fills enough of the screen", () => {
    const view = rect(100, 100, 900, 900); // 800x800; region overlap = 800x800 = full => coverage 1
    expect(selectActiveBed([region], 500, 500, view, null)).toBe("region");
  });

  it("picks the innermost (smallest) eligible area when nested", () => {
    // zoomed into the city: view 400..600 x 600..800 => city coverage 1, region coverage 1 too
    const view = rect(400, 600, 600, 800);
    expect(selectActiveBed([region, city], 500, 700, view, null)).toBe("city");
  });

  it("falls back to the region when zoomed out so the city no longer fills the screen", () => {
    // view 0..1000: city (200x200) coverage = 0.04 < FILL_MIN; region coverage 1
    const view = rect(0, 0, 1000, 1000);
    expect(selectActiveBed([region, city], 500, 700, view, "city")).toBe("region");
  });

  it("returns null when the centre is outside every polygon", () => {
    const view = rect(0, 0, 100, 100);
    expect(selectActiveBed([city], 50, 50, view, null)).toBeNull();
  });

  it("keeps the previous winner in the hysteresis dead-band rather than dropping to silence", () => {
    // coverage just under FILL_MIN but above FILL_MIN×HYSTERESIS (0.425): build a view where city coverage ≈ 0.45
    // city is 200x200=40000. view 400..600 x 600..889 => area 200x289=57800; overlap=40000 => coverage 0.692 (eligible)
    // Use a view giving coverage between 0.425 and 0.5:
    const view = rect(400, 600, 600, 1044); // 200x444=88800; overlap 40000 => coverage 0.45
    // not eligible (<0.5) but within dead-band, and prev was "city":
    expect(selectActiveBed([city], 500, 700, view, "city")).toBe("city");
    // with no previous winner, dead-band does not apply => silence
    expect(selectActiveBed([city], 500, 700, view, null)).toBeNull();
  });

  it("breaks ties between equal-size overlapping areas deterministically by id", () => {
    const a = sq("bbb", 0, 0, 100, 100);
    const b = sq("aaa", 0, 0, 100, 100);
    const view = rect(0, 0, 100, 100);
    expect(selectActiveBed([a, b], 50, 50, view, null)).toBe("aaa");
  });
});
