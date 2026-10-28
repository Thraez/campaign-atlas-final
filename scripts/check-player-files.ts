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
 *   0   clean (or no `<dir>/atlas/`, as before any build)
 *   18  a file not on the allowlist
 */
import path from "node:path";
import { disallowedPlayerFiles } from "./atlas/playerFiles";

export interface RunOpts {
  /** The built site; its `atlas/` subdir is checked. */
  dir: string;
}

export function run(opts: RunOpts): number {
  const bad = disallowedPlayerFiles(path.join(opts.dir, "atlas"));
  if (bad.length === 0) return 0;
  console.error(`\ncheck-player-files: ${bad.length} file(s) not allowed in a player build`);
  for (const rel of bad) console.error(`  ✗ atlas/${rel}`);
  console.error(
    "  Only the atlas JSON, images, fog masks, hashed audio and the audio manifest may ship (scripts/atlas/playerFiles.ts).",
  );
  return 18;
}

if (
  process.argv[1]?.endsWith("check-player-files.ts") ||
  process.argv[1]?.endsWith("check-player-files.js")
) {
  process.exit(run({ dir: process.argv[2] ?? "dist" }));
}
