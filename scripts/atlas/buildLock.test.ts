import { describe, it, expect, beforeEach } from "vitest";
import {
  tryAcquireBuildLock,
  releaseBuildLock,
  isBuildInFlight,
  holdBuildLockUntilSettled,
} from "./buildLock";

describe("buildLock", () => {
  beforeEach(() => releaseBuildLock());

  it("acquires when free and blocks a second acquire", () => {
    expect(tryAcquireBuildLock()).toBe(true);
    expect(isBuildInFlight()).toBe(true);
    expect(tryAcquireBuildLock()).toBe(false);
  });

  it("frees on release", () => {
    tryAcquireBuildLock();
    releaseBuildLock();
    expect(isBuildInFlight()).toBe(false);
    expect(tryAcquireBuildLock()).toBe(true);
  });

  for (const outcome of ["resolves", "rejects"] as const) {
    it(`stays taken past release until a held build ${outcome}`, async () => {
      let settle!: () => void;
      const build = new Promise<void>((res, rej) => {
        settle = outcome === "resolves" ? res : () => rej(new Error("boom"));
      });
      build.catch(() => {});
      tryAcquireBuildLock();
      holdBuildLockUntilSettled(build);
      releaseBuildLock();
      expect(isBuildInFlight()).toBe(true);
      expect(tryAcquireBuildLock()).toBe(false);
      settle();
      await build.then(
        () => undefined,
        () => undefined,
      );
      expect(isBuildInFlight()).toBe(false);
      expect(tryAcquireBuildLock()).toBe(true);
    });
  }
});
