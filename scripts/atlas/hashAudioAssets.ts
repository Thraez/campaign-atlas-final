import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SoundArea } from "../../src/atlas/content/schema";

const AUDIO_OUT_DIR = "atlas/assets/audio";

const AUDIO_EXT = /\.(ogg|mp3|aac|m4a|wav)$/i;
/** Hashed copies produced below: 8 hex chars + extension. A DM source file
 * named like one (e.g. "deadbeef.ogg") would be hidden from the picker —
 * acceptable, it stays fully usable via the panel's free-text fallback. */
const HASHED_NAME = /^[0-9a-f]{8}\.[a-z0-9]+$/i;

/**
 * Delete hashed audio files in `outDir` that no longer correspond to any
 * src emitted by the current build. Scoped strictly to files matching the
 * `<8hex>.ext` hashed-name pattern — never touches DM source files or
 * `manifest.json`.
 */
function pruneStaleHashedAudio(outDir: string, keep: Set<string>): void {
  for (const name of fs.readdirSync(outDir)) {
    if (!HASHED_NAME.test(name) || keep.has(name)) continue;
    fs.unlinkSync(path.join(outDir, name));
  }
}

/**
 * Copy each local audio src to `public/atlas/assets/audio/<sha256[0..8]><ext>`
 * and return a rewrite map: originalSrc → hashedSrc. Any previously-hashed
 * file not re-emitted by this call is pruned, so a bed dropped or renamed
 * between builds leaves no orphan behind.
 *
 * External URLs (http/https) are skipped — they keep their original src.
 * Duplicate srcs produce one output file (same hash = same bytes).
 *
 * `opts.prune` (default true) must be false whenever the caller is NOT the
 * build that owns `publicDir` — pruning is scoped by the caller, because
 * this function cannot tell a real publish from a build writing its atlas
 * somewhere else. Copying is additive and always safe; deleting is not.
 */
export function hashAudioAssets(
  areas: SoundArea[],
  publicDir: string,
  opts: { prune?: boolean } = {},
): Map<string, string> {
  const rewrite = new Map<string, string>();
  const srcs = new Set<string>();

  for (const a of areas) {
    if (a.bed.src.trim()) srcs.add(a.bed.src);
    if (a.bed.srcFallback?.trim()) srcs.add(a.bed.srcFallback);
  }

  const outDir = path.join(publicDir, AUDIO_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const keepHashedNames = new Set<string>();
  for (const src of srcs) {
    if (/^https?:\/\//i.test(src)) continue;
    const srcAbs = path.join(publicDir, src);
    if (!fs.existsSync(srcAbs)) continue;
    const content = fs.readFileSync(srcAbs);
    const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
    const ext = path.extname(src);
    const hashedName = `${hash}${ext}`;
    const outAbs = path.join(outDir, hashedName);
    if (!fs.existsSync(outAbs)) {
      fs.writeFileSync(outAbs, content);
    }
    rewrite.set(src, `${AUDIO_OUT_DIR}/${hashedName}`);
    keepHashedNames.add(hashedName);
  }

  if (opts.prune ?? true) pruneStaleHashedAudio(outDir, keepHashedNames);

  return rewrite;
}

/**
 * Refresh `public/atlas/assets/audio/manifest.json` — the static listing the
 * editor's sound panel reads to populate its file picker. Lists source audio
 * basenames only (hashed copies and non-audio files excluded), sorted.
 * No-op when the audio dir does not exist. Returns what was listed.
 */
export function writeAudioManifest(publicDir: string): string[] {
  const dir = path.join(publicDir, AUDIO_OUT_DIR);
  if (!fs.existsSync(dir)) return [];
  const names = fs
    .readdirSync(dir)
    .filter((n) => AUDIO_EXT.test(n) && !HASHED_NAME.test(n))
    .sort();
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(names, null, 2) + "\n");
  return names;
}

/** Apply a rewrite map to all bed.src / bed.srcFallback fields in a SoundArea array. */
export function rewriteAudioSrcs(areas: SoundArea[], rewrite: Map<string, string>): SoundArea[] {
  return areas.map((a) => ({
    ...a,
    bed: {
      ...a.bed,
      src: rewrite.get(a.bed.src) ?? a.bed.src,
      ...(a.bed.srcFallback
        ? { srcFallback: rewrite.get(a.bed.srcFallback) ?? a.bed.srcFallback }
        : {}),
    },
  }));
}
