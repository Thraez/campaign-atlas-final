// src/test/editor/use-pin-override-mutations.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { usePinOverrideMutations } from "@/atlas/editor/usePinOverrideMutations";
import { makeProject, makeMap, makePlacement } from "@/test/helpers/makeProject";
import type { Overrides } from "@/atlas/editor/placementOverrides";
import type { MapDocument } from "@/atlas/content/schema";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Accumulating fake for setOverridesUndoable: applies `compute` to a mutable
 *  Overrides value and records the undo label for each call, so tests can
 *  assert on both the resulting Overrides shape and the undo label string. */
function makeHarness(initial: Overrides = {}) {
  let current: Overrides = { ...initial };
  const labels: string[] = [];
  const setOverridesUndoable = (compute: (prev: Overrides) => Overrides, label: string) => {
    current = compute(current);
    labels.push(label);
  };
  return {
    get current() {
      return current;
    },
    labels,
    setOverridesUndoable,
  };
}

describe("usePinOverrideMutations", () => {
  describe("read-side resolvers", () => {
    it("canonPlacement finds the placement matching mapId + entityId", () => {
      const project = makeProject({
        placements: [makePlacement({ entityId: "iron-tower", mapId: "overview", x: 500, y: 500 })],
      });
      const activeMap = makeMap();
      const harness = makeHarness();
      const { result } = renderHook(() =>
        usePinOverrideMutations({
          project,
          activeMap,
          overrides: harness.current,
          setOverridesUndoable: harness.setOverridesUndoable,
        }),
      );

      expect(result.current.canonPlacement("overview", "iron-tower")).toMatchObject({
        entityId: "iron-tower",
        mapId: "overview",
        x: 500,
        y: 500,
      });
      expect(result.current.canonPlacement("overview", "nonexistent")).toBeNull();
    });

    it("effectivePlacement prefers a local override over canon, falling back to canon", () => {
      const project = makeProject({
        placements: [
          makePlacement({
            entityId: "iron-tower",
            mapId: "overview",
            x: 500,
            y: 500,
            label: "Canon",
          }),
        ],
      });
      const activeMap = makeMap();

      // No override yet — falls back to canon.
      const harnessNoOverride = makeHarness();
      const { result: r1 } = renderHook(() =>
        usePinOverrideMutations({
          project,
          activeMap,
          overrides: harnessNoOverride.current,
          setOverridesUndoable: harnessNoOverride.setOverridesUndoable,
        }),
      );
      expect(r1.current.effectivePlacement("iron-tower")).toEqual({
        x: 500,
        y: 500,
        label: "Canon",
        pin: undefined,
      });

      // A local override wins over canon.
      const harnessWithOverride = makeHarness({
        "overview:iron-tower": { x: 42, y: 43, label: "Override" },
      });
      const { result: r2 } = renderHook(() =>
        usePinOverrideMutations({
          project,
          activeMap,
          overrides: harnessWithOverride.current,
          setOverridesUndoable: harnessWithOverride.setOverridesUndoable,
        }),
      );
      expect(r2.current.effectivePlacement("iron-tower")).toEqual({
        x: 42,
        y: 43,
        label: "Override",
      });

      // Neither override nor canon — null.
      const harnessEmpty = makeHarness();
      const { result: r3 } = renderHook(() =>
        usePinOverrideMutations({
          project,
          activeMap,
          overrides: harnessEmpty.current,
          setOverridesUndoable: harnessEmpty.setOverridesUndoable,
        }),
      );
      expect(r3.current.effectivePlacement("ghost")).toBeNull();
    });

    it("effectiveCoord returns {x,y} when placed, else null", () => {
      const project = makeProject({
        placements: [makePlacement({ entityId: "iron-tower", mapId: "overview", x: 10, y: 20 })],
      });
      const activeMap = makeMap();
      const harness = makeHarness();
      const { result } = renderHook(() =>
        usePinOverrideMutations({
          project,
          activeMap,
          overrides: harness.current,
          setOverridesUndoable: harness.setOverridesUndoable,
        }),
      );

      expect(result.current.effectiveCoord("iron-tower")).toEqual({ x: 10, y: 20 });
      expect(result.current.effectiveCoord("ghost")).toBeNull();
    });
  });

  describe("mutateOverride edge case", () => {
    it("is a no-op (returns `o` unchanged) with no current placement and no numeric x/y in the patch", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      let capturedCompute: ((o: Overrides) => Overrides) | null = null;
      let capturedLabel: string | undefined;
      const setOverridesUndoable = vi.fn((compute: (o: Overrides) => Overrides, label: string) => {
        capturedCompute = compute;
        capturedLabel = label;
      });
      const { result } = renderHook(() =>
        usePinOverrideMutations({ project, activeMap, overrides: {}, setOverridesUndoable }),
      );

      act(() => {
        result.current.mutateOverride("ghost", { label: "just a label, no coords" });
      });

      expect(setOverridesUndoable).toHaveBeenCalledTimes(1);
      expect(capturedLabel).toBe("pin ghost");
      // Reference-equality check: the compute fn must hand back its input
      // unchanged when there's nothing to create from and nothing to merge onto.
      const probe: Overrides = { "overview:someone-else": { x: 1, y: 1 } };
      expect(capturedCompute).not.toBeNull();
      expect(capturedCompute!(probe)).toBe(probe);
    });

    it("does nothing at all (never calls setOverridesUndoable) when there is no activeMap", () => {
      const project = makeProject({ placements: [] });
      const setOverridesUndoable = vi.fn();
      const { result } = renderHook(() =>
        usePinOverrideMutations({
          project,
          activeMap: undefined,
          overrides: {},
          setOverridesUndoable,
        }),
      );

      act(() => {
        result.current.mutateOverride("iron-tower", { x: 1, y: 2 });
      });

      expect(setOverridesUndoable).not.toHaveBeenCalled();
    });
  });

  describe("mutators", () => {
    function renderMutations(project: ReturnType<typeof makeProject>, activeMap: MapDocument) {
      const harness = makeHarness();
      const { result, rerender } = renderHook(
        (props: { overrides: Overrides }) =>
          usePinOverrideMutations({
            project,
            activeMap,
            overrides: props.overrides,
            setOverridesUndoable: harness.setOverridesUndoable,
          }),
        { initialProps: { overrides: harness.current } },
      );
      const sync = () => rerender({ overrides: harness.current });
      return { result, sync, harness };
    }

    it("setCoord creates a fresh override from scratch when there is no canon placement", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.setCoord("iron-tower", { x: 10, y: 20 }));
      sync();

      expect(harness.current["overview:iron-tower"]).toEqual({
        x: 10,
        y: 20,
        label: undefined,
        pin: undefined,
      });
      expect(harness.labels).toEqual(["move pin iron-tower"]);
    });

    it("setCoord merges onto the canon placement when no prior override exists", () => {
      const project = makeProject({
        placements: [
          makePlacement({
            entityId: "iron-tower",
            mapId: "overview",
            x: 500,
            y: 500,
            label: "Old",
          }),
        ],
      });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.setCoord("iron-tower", { x: 600, y: 700 }));
      sync();

      expect(harness.current["overview:iron-tower"]).toEqual({
        x: 600,
        y: 700,
        label: "Old",
        pin: undefined,
      });
    });

    it("setLabel updates only the label, preserving existing coords/pin", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);
      harness.setOverridesUndoable(
        () => ({ "overview:iron-tower": { x: 1, y: 2, pin: { color: "#ff0000" } } }),
        "seed",
      );
      sync();

      act(() => result.current.setLabel("iron-tower", "New Label"));
      sync();

      expect(harness.current["overview:iron-tower"]).toEqual({
        x: 1,
        y: 2,
        label: "New Label",
        pin: { color: "#ff0000" },
      });
      expect(harness.labels).toEqual(["seed", "label pin iron-tower"]);
    });

    it("setPinOverride updates only the pin style, preserving coords/label", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);
      harness.setOverridesUndoable(
        () => ({ "overview:iron-tower": { x: 1, y: 2, label: "Keep Me" } }),
        "seed",
      );
      sync();

      act(() => result.current.setPinOverride("iron-tower", { color: "#00ff00" }));
      sync();

      expect(harness.current["overview:iron-tower"]).toEqual({
        x: 1,
        y: 2,
        label: "Keep Me",
        pin: { color: "#00ff00" },
      });
    });

    it("nudge reads effectiveCoord and offsets by dx/dy", () => {
      const project = makeProject({
        placements: [makePlacement({ entityId: "iron-tower", mapId: "overview", x: 100, y: 100 })],
      });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.nudge("iron-tower", 5, -3));
      sync();

      expect(harness.current["overview:iron-tower"]).toEqual({
        x: 105,
        y: 97,
        label: undefined,
        pin: undefined,
      });
      expect(harness.labels).toEqual(["nudge pin iron-tower"]);
    });

    it("nudge is a no-op when the entity has no effective coord", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.nudge("ghost", 5, -3));
      sync();

      expect(harness.current).toEqual({});
      expect(harness.labels).toEqual([]);
    });

    it("removeCoord writes a null tombstone for the map:entity key", () => {
      const project = makeProject({
        placements: [makePlacement({ entityId: "iron-tower", mapId: "overview", x: 100, y: 100 })],
      });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.removeCoord("iron-tower"));
      sync();

      expect(harness.current["overview:iron-tower"]).toBeNull();
      expect("overview:iron-tower" in harness.current).toBe(true);
      expect(harness.labels).toEqual(["remove pin iron-tower"]);
    });

    it("clearOverride deletes the key entirely (reverting to canon)", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);
      harness.setOverridesUndoable(() => ({ "overview:iron-tower": { x: 9, y: 9 } }), "seed");
      sync();

      act(() => result.current.clearOverride("iron-tower"));
      sync();

      expect("overview:iron-tower" in harness.current).toBe(false);
      expect(harness.labels).toEqual(["seed", "discard local pin edit iron-tower"]);
    });

    it("duplicateToMap writes the source's effective placement under the target map key and toasts success", () => {
      const project = makeProject({
        maps: [
          makeMap({ id: "overview", name: "Overview" }),
          makeMap({ id: "detail", name: "Detail Map" }),
        ],
        placements: [
          makePlacement({
            entityId: "iron-tower",
            mapId: "overview",
            x: 12,
            y: 34,
            label: "Src Label",
          }),
        ],
      });
      const activeMap = project.maps[0];
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.duplicateToMap("iron-tower", "detail"));
      sync();

      expect(harness.current["detail:iron-tower"]).toEqual({
        x: 12,
        y: 34,
        label: "Src Label",
        pin: undefined,
      });
      expect(harness.labels).toEqual(["duplicate pin iron-tower → detail"]);
      expect(toast.success).toHaveBeenCalledWith("Duplicated to Detail Map");
    });

    it("duplicateToMap is a no-op when the source entity has no effective placement", () => {
      const project = makeProject({ placements: [] });
      const activeMap = makeMap();
      const { result, sync, harness } = renderMutations(project, activeMap);

      act(() => result.current.duplicateToMap("ghost", "detail"));
      sync();

      expect(harness.current).toEqual({});
      expect(harness.labels).toEqual([]);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
