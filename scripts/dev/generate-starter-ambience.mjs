// Starter-ambience generator: seamless-looping WAV files, pure Node.
// 22.05 kHz mono 16-bit PCM, 30 s, circular crossfade so the loop point is inaudible.
// These WAVs are an intermediate authoring format only — they are NOT shipped to
// players. Run `npm run audio:transcode` (scripts/dev/transcode-audio.mjs) to produce
// the compressed .ogg (Opus) + .m4a (AAC) twins that world.yaml actually references.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SR = 22050;
const DUR = 30;
const N = SR * DUR;
const OUT = process.argv[2] ?? ".";

// Deterministic PRNG so regeneration is reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function onePoleLP(alpha) { let y = 0; return (x) => (y += alpha * (x - y)); }
function onePoleHP(alpha) { const lp = onePoleLP(alpha); return (x) => x - lp(x); }

function normalize(buf, peak = 0.72) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? peak / max : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}

// Circular crossfade: blend the tail into the head so sample N-1 -> 0 is seamless.
function loopify(buf, fadeSec = 3) {
  const F = Math.min(Math.floor(fadeSec * SR), Math.floor(buf.length / 4));
  const out = new Float64Array(buf.length - F);
  for (let i = 0; i < out.length; i++) out[i] = buf[F + i];
  for (let i = 0; i < F; i++) {
    const t = i / F; // equal-power
    const a = Math.cos((t * Math.PI) / 2), b = Math.sin((t * Math.PI) / 2);
    out[out.length - F + i] = out[out.length - F + i] * a + buf[i] * b;
  }
  return out;
}

function writeWav(path, buf) {
  const n = buf.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 2, 4); data.write("WAVE", 8);
  data.write("fmt ", 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, data);
  console.log(`${path}  ${(data.length / 1024 / 1024).toFixed(2)} MB`);
}

// --- wind-hollow: brown noise, slowly wandering lowpass + gusting gain ---
{
  const rnd = mulberry32(101);
  const buf = new Float64Array(N + SR * 3);
  let brown = 0;
  const smooth = onePoleLP(0.002);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    brown += (rnd() * 2 - 1) * 0.02; brown *= 0.999;
    const gust = 0.55 + 0.30 * Math.sin(2 * Math.PI * 0.05 * t) + 0.15 * Math.sin(2 * Math.PI * 0.113 * t + 1.7);
    buf[i] = smooth(brown) * gust * 3;
  }
  const l = loopify(buf); normalize(l); writeWav(join(OUT, "wind-hollow.wav"), l);
}

// --- water-trickle: bandpassed noise with layered burble modulation ---
{
  const rnd = mulberry32(202);
  const buf = new Float64Array(N + SR * 3);
  const lp = onePoleLP(0.28), hp = onePoleHP(0.035);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const burble =
      0.5 + 0.2 * Math.sin(2 * Math.PI * 0.9 * t) * Math.sin(2 * Math.PI * 0.23 * t) +
      0.18 * Math.sin(2 * Math.PI * 1.7 * t + 0.9) + 0.12 * Math.sin(2 * Math.PI * 0.41 * t + 2.1);
    buf[i] = hp(lp(rnd() * 2 - 1)) * burble;
  }
  const l = loopify(buf); normalize(l, 0.6); writeWav(join(OUT, "water-trickle.wav"), l);
}

// --- cavern-drone: detuned low sine cluster with slow beating + faint air ---
{
  const rnd = mulberry32(303);
  const buf = new Float64Array(N + SR * 3);
  const air = onePoleLP(0.01);
  const partials = [
    [55, 0.9], [55.35, 0.7], [82.5, 0.45], [110, 0.35], [110.5, 0.3], [165, 0.12],
  ];
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const [f, a] of partials) s += a * Math.sin(2 * Math.PI * f * t);
    const swell = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.021 * t);
    buf[i] = s * 0.12 * swell + air(rnd() * 2 - 1) * 0.35;
  }
  const l = loopify(buf, 5); normalize(l, 0.55); writeWav(join(OUT, "cavern-drone.wav"), l);
}
console.log("done");
