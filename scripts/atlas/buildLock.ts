/**
 * D4: one process-wide "a build is in flight" guard shared by /__atlas/save,
 * /__atlas/publish-check, and /__atlas/publish-push. A publish is a full
 * player build + site build (tens of seconds); a save rebuild and a publish
 * must not run concurrently (both write public/atlas/atlas.json). The image
 * picker DELETE path is intentionally NOT gated by this lock.
 *
 * The lock is free only when no request holds it AND no build outlived its
 * request: a route that stops waiting on a build (timeout) hands the build's
 * promise to `holdBuildLockUntilSettled`, so the lock stays taken until that
 * build really ends (eval-2026-10/37).
 */
let requestHolds = false;
const lingeringBuilds = new Set<Promise<unknown>>();

export function isBuildInFlight(): boolean {
  return requestHolds || lingeringBuilds.size > 0;
}

/** Returns true and takes the lock if free; returns false if already held. */
export function tryAcquireBuildLock(): boolean {
  if (isBuildInFlight()) return false;
  requestHolds = true;
  return true;
}

/** The request's hold ends; any build it left running keeps the lock until it settles. */
export function releaseBuildLock(): void {
  requestHolds = false;
}

/** Keep the lock taken until `build` settles (resolves or rejects), past its request's release. */
export function holdBuildLockUntilSettled(build: Promise<unknown>): void {
  lingeringBuilds.add(build);
  const done = () => {
    lingeringBuilds.delete(build);
  };
  build.then(done, done);
}
