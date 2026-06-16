import { describe, it, expect, beforeEach } from "vitest";
import { tryAcquireBuildLock, releaseBuildLock, isBuildInFlight } from "./buildLock";

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
});
