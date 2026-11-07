/**
 * Node reader for `atlas.config.json` `hosting` (R-01; rules in
 * `src/atlas/sync/hosting.ts`). Any failure (no file, unreadable, not JSON,
 * missing or invalid value) reads as "public": fail closed.
 */
import fs from "node:fs";
import path from "node:path";
import { parseHosting, type Hosting } from "../../src/atlas/sync/hosting";

/** Hosting from `<repoRoot>/atlas.config.json`, or from `configPath` when given. */
export function readHosting(repoRoot: string, configPath?: string): Hosting {
  const file = configPath ?? path.join(repoRoot, "atlas.config.json");
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "public";
    return parseHosting((parsed as Record<string, unknown>).hosting);
  } catch {
    return "public";
  }
}

/** True when a real sync may write into this repo. */
export function syncWritesAllowed(repoRoot: string): boolean {
  return readHosting(repoRoot) === "private";
}
