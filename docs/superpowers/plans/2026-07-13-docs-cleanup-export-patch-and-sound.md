# Docs Cleanup: Kill "Export Patch" Drift + Document Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. This is a docs-only plan — no code, no tests to write, but every claim added to docs must be verified against the current code before writing it.

**Goal:** (A) Remove the stale "Export Patch" workflow language from `README.md`, which documents a feature that was fully removed and must never be reintroduced. (B) Give the shipped atmosphere/soundscape feature its first user-facing documentation.

**Why now:** cheap, zero code risk, and the docs are otherwise this project's strongest asset — drift here makes the DM's own reference lie to them. Good first task for a session; independent of every other plan.

**Tech Stack:** Markdown only.

---

## Part A — Export Patch is gone; the README still sells it

### Verified evidence (the feature IS removed)
Source comments confirm removal — the README is the only place still describing it as live:
- `src/atlas/yaml/validateProject.ts:552` — "(Removed) … The Export Patch flow was removed —"
- `src/atlas/tabs/EntitiesTab.tsx:62` — "Save can write these edits to disk (no more Export Patch)."
- `src/pages/AtlasPlacementEditor.tsx:777` — "them to disk (Export Patch removed)."
- `src/atlas/save/canonicalEntitySave.ts:12` — describes the old "Export Patch download the DM had to apply" in the past tense.
- Project memory `feedback_unified_save_completeness.md`: "Export Patch fully removed 2026-05-16, never reintroduce." The landing-page copy was already fixed in commit `258af5f5`; the README long-form doc was missed.

### Stale locations in `README.md` (RE-READ to confirm current line numbers before editing — the file drifts)
- `README.md:47` — bullet "Unified YAML patch export workflow" under "Current status → Implemented and shipping".
- `README.md:69-70` — "Most common mistake" opens with "Do not paste an entire exported patch file into `world.yaml`. Exported patch files may contain comment headers…".
- `README.md:802-804` — a "Scope"/"Fallback" block stating "the Save button reuses the same payload as Export Patch" and "Export Patch is still available. It downloads a `.yaml` patch file…".
- `README.md:1020` — "Creator workflow: `/atlas/edit`, patch exports, asset zip".

### Tasks

- [ ] **Step 1: Re-read the four regions.** `grep -n -i "export patch\|exported patch\|patch export\|patch exports" README.md` to get current line numbers. Read ~10 lines of context around each.

- [ ] **Step 2: Fix line ~47 (status list).** Replace the "Unified YAML patch export workflow" bullet with a bullet describing the real flow, e.g.:
  `Unified Save — writes edits straight back to the vault on disk (dev only)`

- [ ] **Step 3: Rewrite the "Most common mistake" section (~69-70).** The current mistake ("don't paste an exported patch file") is obsolete. Either (a) replace it with the genuinely current most-common mistake — pasting a fenced ```yaml block (with the code fence) into `world.yaml`, which the README already covers at lines 72-87 and the build rejects — or (b) if that's now covered well enough below, delete the "exported patch file" framing and keep only the "must be pure YAML / no code fences" guidance. Recommended: (a), reusing the existing fence example that follows.

- [ ] **Step 4: Fix the Scope/Fallback block (~802-804).** Delete the "Export Patch is still available … downloads a `.yaml` patch file" fallback paragraph entirely (the feature does not exist). For the "Scope" note about data Save doesn't handle (brand-new markdown lore files), keep the substance but reword off the Export Patch reference: Save writes editor changes (placements, world.yaml settings, entity frontmatter) to the vault; creating brand-new lore notes is still done in Obsidian/your editor, or via the import flow.

- [ ] **Step 5: Fix line ~1020.** Change "patch exports" → "Unified Save" (or drop the phrase) in the "Creator workflow" line.

- [ ] **Step 6: Final grep must be clean.**
```bash
grep -n -i "export patch\|exported patch" README.md
```
Expected: no matches (or only an explicit past-tense "formerly Export Patch, now removed" note if you choose to leave a changelog breadcrumb — acceptable, but not as live guidance).

- [ ] **Step 7: Commit.**
```bash
git add README.md
git commit -m "docs(readme): remove stale Export Patch workflow language (feature removed 2026-05-16)"
```

---

## Part B — Document the sound feature for users

The atmosphere/soundscape feature shipped to main (engine + DM Sound tab + starter ambience + first live soundscape) with ZERO user-facing docs. Verified: `grep -ni 'audio\|sound' docs/KNOWN_LIMITATIONS.md docs/WORKFLOWS.md docs/QUICK_START.md` returns nothing.

### What to document (verify each against code before writing)
- **DM authoring:** the editor's **Sound** tab (`src/atlas/tabs/SoundscapeTab.tsx`, rail item `"sound"`, shortcut `S`, registered in `src/atlas/shell/railRegistry.tsx:71`). DM draws/ride-ons a sound area on the map, picks an audio file (picker reads `public/atlas/assets/audio/manifest.json`), sets volume + visibility. `player`/`rumor` areas ship; `dm`/`hidden` don't (same visibility vocab as everything else).
- **Starter audio:** three seamless loops ship in `public/atlas/assets/audio/` (`wind-hollow.wav`, `water-trickle.wav`, `cavern-drone.wav`), generated by `scripts/dev/generate-starter-ambience.mjs`. (Note: these are placeholders slated for replacement — see `2026-07-13-audio-compression.md`.)
- **Player experience:** ambient audio plays as the player pans into a sound area; a mute/volume control is available (`src/atlas/sound/SoundControl.tsx`), and the preference persists (`src/atlas/sound/soundPrefs.ts`).
- **Known limitation to add:** browsers block audio autoplay until the user interacts with the page — so sound starts on first click/gesture, not on load. Verify the actual behavior in `src/atlas/sound/SoundSettingsProvider.tsx` / `AudioEngine.ts` before wording this.

### Tasks

- [ ] **Step 1: Add a "Soundscapes" row to `docs/KNOWN_LIMITATIONS.md`.** In the appropriate support table, note: audio needs a user gesture before it can start (browser autoplay policy); Safari does not decode Ogg/Vorbis (fallback twins needed — cross-reference the audio-compression plan); large uncompressed audio increases page weight.

- [ ] **Step 2: Add a short "Ambient sound" subsection to `docs/WORKFLOWS.md`.** 4-8 sentences: open the Sound tab, draw a sound area or ride-on an existing region, pick a loop, set volume/visibility, Save. Mention player-visible vs DM-only areas.

- [ ] **Step 3: Add one line to `docs/QUICK_START.md`** pointing at the WORKFLOWS "Ambient sound" subsection, so the feature is discoverable from the 10-minute path.

- [ ] **Step 4 (optional): cross-link `README.md`.** Add "Ambient soundscapes" to the "Current status → Implemented and shipping" list (near `README.md:27-48`) so the long-form doc reflects reality.

- [ ] **Step 5: Commit.**
```bash
git add docs/KNOWN_LIMITATIONS.md docs/WORKFLOWS.md docs/QUICK_START.md README.md
git commit -m "docs: document the atmosphere/soundscape feature for DMs and players"
```

---

## Verification (whole plan)
- `grep -rni "export patch" README.md` → clean (Part A).
- `grep -rli "sound\|audio" docs/KNOWN_LIMITATIONS.md docs/WORKFLOWS.md docs/QUICK_START.md` → all three now match (Part B).
- No code touched, so no test/typecheck needed — but run `npx prettier --check` on each changed `.md` (CI enforces prettier; per memory `format-check-crlf-gap.md` only fix files CI would flag, never `npm run format`).
