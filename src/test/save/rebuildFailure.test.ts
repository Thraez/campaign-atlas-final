import { it, expect } from "vitest";
import { rebuildFailure, type LocalSaveResult } from "@/atlas/save/localFsSave";

const base: LocalSaveResult = { saved: 1, paths: ["content/w/npcs/a.md"] };

it("is null when no rebuild was requested", () => {
  expect(rebuildFailure(base)).toBeNull();
});

it("is null when the rebuild succeeded", () => {
  expect(rebuildFailure({ ...base, rebuilt: true, build: { ok: true, durationMs: 3 } })).toBeNull();
});

it("gives build.stderr when the build failed", () => {
  expect(
    rebuildFailure({
      ...base,
      rebuilt: false,
      rebuildError: "tail",
      build: { ok: false, durationMs: 3, stderr: "boom" },
    }),
  ).toBe("boom");
});

it("falls back to rebuildError when stderr is empty or missing", () => {
  expect(
    rebuildFailure({
      ...base,
      rebuilt: false,
      rebuildError: "tail",
      build: { ok: false, durationMs: 3, stderr: "" },
    }),
  ).toBe("tail");
  expect(rebuildFailure({ ...base, rebuilt: false, rebuildError: "tail" })).toBe("tail");
});

it("says no details were reported when there is no message", () => {
  expect(rebuildFailure({ ...base, rebuilt: false })).toBe("No details were reported.");
  expect(rebuildFailure({ ...base, build: { ok: false, durationMs: 3, stderr: "" } })).toBe(
    "No details were reported.",
  );
});

it("detects failure from build.ok alone", () => {
  expect(rebuildFailure({ ...base, build: { ok: false, durationMs: 3, stderr: "x" } })).toBe("x");
});
