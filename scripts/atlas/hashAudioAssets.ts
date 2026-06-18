import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SoundArea } from "../../src/atlas/content/schema";

const AUDIO_OUT_DIR = "atlas/assets/audio";

/**
 * Copy each local audio src to `public/atlas/assets/audio/<sha256[0..8]><ext>`
 * and return a rewrite map: originalSrc → hashedSrc.
 *
 * External URLs (http/https) are skipped — they keep their original src.
 * Duplicate srcs produce one output file (same hash = same bytes).
 */
export function hashAudioAssets(
  areas: SoundArea[],
  publicDir: string
): Map<string, string> {
  const rewrite = new Map<string, string>();
  const srcs = new Set<string>();

  for (const a of areas) {
    srcs.add(a.bed.src);
    if (a.bed.srcFallback) srcs.add(a.bed.srcFallback);
  }

  const outDir = path.join(publicDir, AUDIO_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

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
  }

  return rewrite;
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
