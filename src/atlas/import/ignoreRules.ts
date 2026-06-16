import picomatch from "picomatch";
import { isIgnoredPath } from "./inferType";

/**
 * Returns a predicate that returns true for vault-relative POSIX paths that
 * should be skipped during a vault scan. Combines:
 *   1. Built-in IGNORED_FOLDERS segments (via inferType.isIgnoredPath).
 *   2. DM-configured picomatch globs (case-insensitive).
 */
export function makeIgnore(globs: string[]): (relPath: string) => boolean {
  const match = picomatch(globs.length ? globs : ["__never__"], { nocase: true, dot: true });
  return (relPath) => isIgnoredPath(relPath) || match(relPath);
}
