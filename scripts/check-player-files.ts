/**
 * Player-files scan (eval-2026-10/40). Fails publish if the built site's
 * `atlas/` dir holds any file the player allowlist (`atlas/playerFiles.ts`)
 * refuses: a `world.yaml` with fog polygons, a DM note, a stray JSON.
 *
 * The prune plugin already removes such files from the player build; this is
 * the fail-closed check that the output really is clean. It runs on the built
 * site only: `public/atlas/` is the DM's store and may hold source-named audio
 * beds and other inputs the build drops.
 *
 * Usage: tsx scripts/check-player-files.ts [dir]   (dir defaults to `dist`)
 *
 * Exit codes:
 *   0   clean, or no `<dir>` at all (as before any build; skipped)
 *   18  a file not on the allowlist, a `<dir>` with no `atlas/` (a player
 *       build always has one), or an `atlas.json` that is not valid JSON
 */
import fs from "node:fs";
import path from "node:path";
import { disallowedPlayerFiles } from "./atlas/playerFiles";

export interface RunOpts {
  /** The built site; its `atlas/` subdir is checked. */
  dir: string;
}

export function run(opts: RunOpts): number {
  if (!fs.existsSync(opts.dir)) {
    console.log(`atlas:check-player-files: target "${opts.dir}" does not exist, skipping`);
    return 0;
  }
  const atlasDir = path.join(opts.dir, "atlas");
  if (!fs.existsSync(atlasDir)) {
    console.error(
      `check-player-files: "${opts.dir}" has no atlas/ dir, so this is not a player build to check — failing`,
    );
    return 18;
  }
  let bad: string[];
  try {
    bad = disallowedPlayerFiles(atlasDir);
  } catch (err) {
    console.error(`check-player-files: ${(err as Error).message}`);
    return 18;
  }
  if (bad.length === 0) {
    console.log("check-player-files: only allowed files — clean");
    return 0;
  }
  console.error(`\ncheck-player-files: ${bad.length} file(s) not allowed in a player build`);
  for (const rel of bad) console.error(`  ✗ atlas/${rel}`);
  console.error(
    "  Only the atlas JSON, images and the hashed audio atlas.json references may ship (scripts/atlas/playerFiles.ts).",
  );
  return 18;
}

if (
  process.argv[1]?.endsWith("check-player-files.ts") ||
  process.argv[1]?.endsWith("check-player-files.js")
) {
  process.exit(run({ dir: process.argv[2] ?? "dist" }));
}
