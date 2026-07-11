/**
 * D4: one process-wide "a build is in flight" guard shared by /__atlas/save,
 * /__atlas/publish-check, and /__atlas/publish-push. A publish is a full
 * player build + site build (tens of seconds); a save rebuild and a publish
 * must not run concurrently (both write public/atlas/atlas.json). The image
 * picker DELETE path is intentionally NOT gated by this lock.
 */
let buildInFlight = false;

export function isBuildInFlight(): boolean {
  return buildInFlight;
}

/** Returns true and takes the lock if free; returns false if already held. */
export function tryAcquireBuildLock(): boolean {
  if (buildInFlight) return false;
  buildInFlight = true;
  return true;
}

export function releaseBuildLock(): void {
  buildInFlight = false;
}
