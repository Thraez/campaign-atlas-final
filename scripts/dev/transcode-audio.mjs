// One-time dev transcode step: converts the checked-in starter-ambience WAVs
// into the compressed twins that actually ship to players. See
// docs/superpowers/plans/2026-07-13-audio-compression.md for the rationale.
//
// Emits, for each source *.wav:
//   <name>.ogg  — libopus ~64 kbps (primary; small, good quality for loops)
//   <name>.m4a  — AAC ~96 kbps (fallback for browsers without Ogg/Opus support, e.g. Safari)
//
// Run with: npm run audio:transcode
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";

const DIR = "public/atlas/assets/audio";
const isSource = (f) => /\.wav$/i.test(f) && !/^[0-9a-f]{8}\./i.test(f);

for (const f of readdirSync(DIR).filter(isSource)) {
  const src = join(DIR, f);
  const base = f.replace(/\.wav$/i, "");
  const ogg = join(DIR, `${base}.ogg`);
  const m4a = join(DIR, `${base}.m4a`);
  execFileSync(ffmpeg, ["-y", "-i", src, "-c:a", "libopus", "-b:a", "64k", ogg]);
  execFileSync(ffmpeg, ["-y", "-i", src, "-c:a", "aac", "-b:a", "96k", m4a]);
  const kb = (p) => Math.round(statSync(p).size / 1024);
  console.log(`${f}: wav ${kb(src)}KB -> ogg ${kb(ogg)}KB / m4a ${kb(m4a)}KB`);
}
