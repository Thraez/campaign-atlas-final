# Audio Compression + De-duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cut the player-site audio payload from ~7.5 MB to well under 1 MB by (1) transcoding the three uncompressed WAV ambience loops to Ogg/Opus with AAC/M4A fallback twins, and (2) eliminating the duplicate-byte problem where both source-named and content-hashed WAVs ship. Restores the format the original sound design spec actually called for.

**Architecture:** The starter loops are algorithmically generated and checked into `public/atlas/assets/audio/`. We add a one-time dev transcode step (`ffmpeg-static`, mirroring how `sharp` is already a build-time media dep), emit `.ogg` (Opus) + `.m4a` (AAC) twins, point each `world.yaml` bed at `src: *.ogg` + `srcFallback: *.m4a`, and update the runtime codec probe so Safari (no Ogg support) correctly selects the AAC twin. Then stop shipping the uncompressed originals.

**Tech Stack:** Node ESM scripts, `ffmpeg-static` (new devDependency), Web Audio `decodeAudioData` (already the playback path), Vitest.

**Relationship to other plans:** Phase 2 ("replace generated loops with sourced/credited audio") is intentionally OUT of scope here and depends on `2026-07-13-asset-manager-credits.md` for attribution. This plan compresses what exists today.

---

## Grounded context (verified file:line)

- Generator: `scripts/dev/generate-starter-ambience.mjs:2,6-7,44-58,72,87,105` — 22.05 kHz mono 16-bit PCM WAV, 30 s loops, fixed names `wind-hollow.wav` / `water-trickle.wav` / `cavern-drone.wav`, ~1.2 MB each.
- Duplicate shipping: `scripts/atlas/hashAudioAssets.ts:15-43` byte-copies each referenced bed to `<sha256[0..8]><ext>` **alongside** the original (never deletes it); Vite copies all of `public/` to `dist/` verbatim (no `publicDir` exclusion in `vite.config.ts`). Result on disk: `wind-hollow.wav` + `011fb234.wav` (identical bytes) etc. — ~7.5 MB shipped for ~3.7 MB unique.
- Manifest: `scripts/atlas/hashAudioAssets.ts:57-66` (`writeAudioManifest`) writes a flat array of source basenames matching `/\.(ogg|mp3|aac|m4a|wav)$/i` and EXCLUDING hashed names `/^[0-9a-f]{8}\.[a-z0-9]+$/i`. Consumed by `src/atlas/sound-editor/listAvailableAudio.ts:34,41-53` (DM picker only). The `AUDIO_EXT` regex already includes ogg/mp3/aac/m4a — no change needed there.
- Playback: `src/atlas/sound/AudioEngine.ts:140-141` fetch + `decodeAudioData` (format-agnostic). `audioUrl()` at `:19-22`. Format selection: `AudioEngine.crossfadeTo` (`:83-86`) calls `canPlay(bed.src)` to choose `src` vs `srcFallback`.
- **The codec probe is Ogg/Vorbis-specific:** `src/atlas/sound/realAudioDeps.ts:6-13` — `canPlay(src)` returns `true` for any non-`.ogg` extension, and only for `.ogg` probes `new Audio().canPlayType('audio/ogg; codecs="vorbis"')`. Switching to Opus requires changing this to probe `opus`.
- `srcFallback` is fully supported + unit-tested (`src/atlas/content/schema.ts:86-93`; `src/test/sound/AudioEngine.test.ts:151-156`) but NOT authored for any starter bed: `content/astrath-deeprealm/_atlas/world.yaml:38-61` sets `src:` only.
- Original design intent: `docs/superpowers/specs/2026-06-17-atmosphere-sound-design.md:173-200` — "Ogg ~64-96 kbps + MP3/AAC fallback, a few hundred KB." Shipped impl diverged to WAV.
- Workbox rule is path-based (`vite.config.ts:97-109`, matches `/atlas/assets/`), format-agnostic — NO change needed.
- No audio lib in `package.json`; `sharp` (`package.json:95`) is the precedent for a native build-time media dependency.

---

## Decisions (made — recorded here so the executor doesn't relitigate)

1. **Format:** Ogg/**Opus** primary (~64 kbps VBR) + **AAC/M4A** fallback. Best size, matches design intent. Requires the `canPlay` probe update (Task 3). *Alternative rejected:* AAC-only is simpler but larger and abandons the already-built fallback mechanism.
2. **Tooling:** `ffmpeg-static` devDependency + a one-time `scripts/dev/transcode-audio.mjs`. Keeps encoding self-contained (no system ffmpeg requirement), consistent with `sharp`. Transcoding is dev-time (loops are checked in), NOT wired into `npm run build`.
3. **De-dup:** Stop shipping uncompressed originals to the player. Chosen mechanism: Task 5.

---

## Task 1: Add ffmpeg-static + transcode script

**Files:**
- Modify: `package.json` (devDependencies + a script)
- Create: `scripts/dev/transcode-audio.mjs`

- [ ] **Step 1: Add the dependency.**
```bash
npm install --save-dev ffmpeg-static
```

- [ ] **Step 2: Write `scripts/dev/transcode-audio.mjs`.** Reads each `*.wav` in `public/atlas/assets/audio/` (skipping hashed names), emits `<name>.ogg` (libopus) and `<name>.m4a` (aac), prints before/after sizes.
```js
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
```

- [ ] **Step 3: Add an npm script** to `package.json` scripts: `"audio:transcode": "node scripts/dev/transcode-audio.mjs"`.

- [ ] **Step 4: Commit.**
```bash
git add package.json package-lock.json scripts/dev/transcode-audio.mjs
git commit -m "build(audio): add ffmpeg-static transcode script for ambience loops"
```

---

## Task 2: Transcode + author fallback twins in world.yaml

**Files:**
- Create (generated): `public/atlas/assets/audio/{wind-hollow,water-trickle,cavern-drone}.{ogg,m4a}`
- Modify: `content/astrath-deeprealm/_atlas/world.yaml:38-61`

- [ ] **Step 1: Run the transcode.** `npm run audio:transcode`. Confirm each `.ogg` is a few-hundred KB or less; note the numbers.

- [ ] **Step 2: Point each bed at ogg + m4a fallback.** For each of the three beds in `world.yaml` (RE-READ current line numbers), change `src: wind-hollow.wav` → `src: wind-hollow.ogg` and add `srcFallback: wind-hollow.m4a` (same for water-trickle, cavern-drone).

- [ ] **Step 3: Rebuild the DM atlas to refresh the manifest + atlas.json.**
```bash
npm run atlas:build
```
Confirm the DM picker manifest (`public/atlas/assets/audio/manifest.json`) now lists the `.ogg`/`.m4a` names. (Discard the DM-mode `atlas.json`/`search-index.json` churn per handover env note; only commit the player-strict artifacts if the gate regenerates them.)

- [ ] **Step 4: Commit.**
```bash
git add public/atlas/assets/audio/*.ogg public/atlas/assets/audio/*.m4a content/astrath-deeprealm/_atlas/world.yaml public/atlas/assets/audio/manifest.json
git commit -m "feat(audio): ship compressed Ogg/Opus beds with AAC/M4A fallback twins"
```

---

## Task 3: Fix the codec probe for Opus (Safari fallback correctness)

**Files:**
- Modify: `src/atlas/sound/realAudioDeps.ts:6-13`
- Test: `src/test/sound/AudioEngine.test.ts` (extend) or a new `src/test/sound/canPlay.test.ts`

- [ ] **Step 1: Write the failing test.** Assert that with a mocked `canPlayType` returning `""` for ogg, `canPlay("foo.ogg")` is `false` (so Safari picks the fallback), and `canPlay("foo.m4a")` is `true`.
```ts
it("rejects ogg when the browser cannot decode opus, accepts the m4a twin", () => {
  vi.stubGlobal("Audio", class { canPlayType() { return ""; } } as unknown as typeof Audio);
  expect(canPlay("wind-hollow.ogg")).toBe(false);
  expect(canPlay("wind-hollow.m4a")).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL** (current probe string is `codecs="vorbis"`, but the test can pass by accident since the stub returns "" for everything; make the stub return "" only for ogg-vorbis and "maybe" for opus to prove the string matters). Adjust the test to prove the codec string is `opus`.

- [ ] **Step 3: Update the probe.** In `realAudioDeps.ts`, change the ogg branch to probe Opus (and optionally Vorbis as a secondary), e.g. `canPlayType('audio/ogg; codecs="opus"')`.

- [ ] **Step 4: Run the sound suite.**
```bash
npx vitest run src/test/sound
```
Expected: PASS, including the existing fallback test at `AudioEngine.test.ts:151-156`.

- [ ] **Step 5: Commit.**
```bash
git add src/atlas/sound/realAudioDeps.ts src/test/sound/
git commit -m "fix(audio): probe Opus (not Vorbis) so Safari falls back to the m4a twin"
```

---

## Task 4: Update generator header + docs

- [ ] **Step 1:** In `scripts/dev/generate-starter-ambience.mjs`, update the header comment (line ~2) to note that generated WAVs are an intermediate authoring format and the shipped beds are produced by `audio:transcode`.
- [ ] **Step 2:** Cross-link this from the sound docs added in `2026-07-13-docs-cleanup-export-patch-and-sound.md` (Part B).
- [ ] **Step 3: Commit** `docs(audio): note the transcode step in the generator + sound docs`.

---

## Task 5: Stop shipping the uncompressed originals (de-dup)

The originals are now only an authoring intermediate. Choose ONE:
- **Option A (recommended, simplest):** delete the `*.wav` files from `public/atlas/assets/audio/` after transcoding — they can always be regenerated with `npm run atlas:build`'s generator step or `generate-starter-ambience.mjs`. The `.ogg`/`.m4a` beds are what's referenced. Confirm `world.yaml`, the manifest, and `hashAudioAssets` all reference only the compressed names, then remove the WAVs.
- **Option B:** keep WAVs in the repo but exclude them from the player `dist/` via a Vite build hook / `publicDir` filter. More moving parts.

- [ ] **Step 1: Verify nothing references the `.wav` beds** (`grep -rn "\.wav" content/ src/ scripts/` — the only hits should be the generator/transcode scripts, not `world.yaml` or runtime).
- [ ] **Step 2: Apply Option A** — `git rm public/atlas/assets/audio/*.wav public/atlas/assets/audio/[0-9a-f]*.wav` (removes source + stale hashed WAV twins).
- [ ] **Step 3: Rebuild + confirm** the player build regenerates only hashed `.ogg`/`.m4a`: `npm run atlas:build:player` then `du -sh public/atlas/assets/audio`.
- [ ] **Step 4: Commit** `chore(audio): stop shipping uncompressed WAV originals (regenerable intermediates)`.

---

## Verification (whole plan)
```bash
du -sh public/atlas/assets/audio            # expect well under 1 MB total (was 7.5 MB)
npx vitest run src/test/sound               # all green incl. fallback + manifest tests
npm run typecheck && npm run lint
npm run atlas:publish                        # full player build + all secret/shape scans PASS
```
Then manually: `npm run dev`, pan into a live sound area, confirm audio plays; if you have Safari, confirm it uses the `.m4a` fallback (DevTools → Network → the requested audio file).

## Acceptance criteria
- Total `public/atlas/assets/audio/` payload < 1 MB.
- Every player-visible bed has both `src` (`.ogg`) and `srcFallback` (`.m4a`).
- `canPlay` probes Opus; Safari fallback path is unit-tested.
- No uncompressed WAV ships in `dist/`.
- `atlas:publish` scans all pass (no leaked names, shape intact).

## Open decision to confirm with the DM
- Bitrates (64k Opus / 96k AAC) are a starting point — bump if the loops sound thin at the table. Cheap to re-run `audio:transcode`.
