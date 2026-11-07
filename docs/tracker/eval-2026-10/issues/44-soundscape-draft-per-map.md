# The soundscape draft belongs to one map: sound edits never land on another map

Status: in-review
Area: editor (soundscape, undo)

Found in the review of eval-30 (2026-11-07). Not a regression: it is the same on `main`.

`useSoundscapeDraft` (`src/atlas/sound-editor/useSoundscapeDraft.ts`) holds one draft slot. It is
never reset or swapped on a map change, unlike the region/route/fog drafts that `useEditorSession`
now keeps per map (eval-30). `SoundscapeTab.tsx` (~114-120) patches `{ soundscape }` into the
**active** map whenever the draft is dirty and differs from that map's canon. So:

- **Bug, verified by reading:** sound areas drawn on map A, then a switch to map B, are patched into
  B's metadata, and the next save writes them into B.
- **Bug, verified by reading:** undoing a soundscape-metadata change (the `patchMap` entry) is
  patched straight back, because the draft is still dirty and still differs from canon.

Deepening: key the soundscape draft by map, as eval-30 did for region/route/fog (one store, the
undo entry carries its `mapId`), or derive the draft from the map's metadata override alone so
there is one source of truth.

## Acceptance criteria

- A failing test first for each bug above, through the real hooks (`useSoundscapeDraft` with the
  tab's patch effect, two maps).
- A soundscape edit stays on the map it was made on across map switches and saves.
- Undo of a soundscape change stays undone; redo restores it, on its own map.
- The editor is checked by eye in the preview: draw a sound area on map A, switch to map B, save,
  reload; only A has the area (ready-for-human).

## Comments

### 2026-11-07

Built on branch `eval-44-soundscape-draft-per-map`, stacked on `eval-47-discard-all-clears-world-settings`
(PR #103, not merged): retarget to `main` once 47 merges.

- `useSoundscapeDraft` no longer keeps a draft. The map's soundscape (its metadata override folded
  in) is the one source of truth: every edit writes the next config through `patchMap({ soundscape })`.
  So a sound edit stays on its map across switches and saves, undo/redo is the `patchMap` entry
  (it carries the `mapId`, so redo from another map switches back first), and the session already
  persists, restores and discards it with the rest of the map metadata. Only the drawing in progress
  and the selection live in the hook; both reset on a map change.
- The Sound tab's patch-back effect, `dedupeAreas` and the double `remove` are gone (they only existed
  to reconcile the two copies).
- Names are no longer trimmed on every keystroke (that would eat a typed space mid-name); the YAML
  emitter trims them on save instead.
- Tests: `src/test/sound-editor/soundscape-per-map.test.tsx` wires the real hooks (undo stack, editor
  session, the page's override + `patchMap`, the Sound tab) with two maps. The first two cases failed
  on the old hook (area landed on B; undo was patched straight back); the third covers Discard all and
  a reload. `useSoundscapeDraft.test.ts` and `SoundscapeTab.test.tsx` now feed patches back as the
  editor does.

Provisional call: derived from the map's metadata override rather than a per-map draft in
`useEditorSession`. It is simpler (no new session slice, no snapshot/undo plumbing) and safer (one
copy, so nothing can disagree or be re-patched), and it reuses machinery that already works per map.
Cost: each sound edit is one map-metadata undo entry, and slider drags record one entry per step, as
before.

Provisional call: the Map settings reset (`resetMap`) clears the map's sound edits too, since they now
live in the same override. Before, the old draft would have re-patched them straight away.

Not done: the by-eye check in the preview (draw on A, switch to B, save, reload) is still for Isak.

### 2026-11-07, review fixes

- "Discard local" now drops the `soundscape` key from the map's override (new `unpatchMap` beside
  `patchMap`, both built on the pure `withMapPatch`/`withoutMapKey` in `src/atlas/editor/mapOverride.ts`),
  and the map's entry once it is empty, so the map no longer counts as unsaved. It is one undo entry.
  The hook now takes `{ patch, unpatch }`.
- The Sound tab takes the editor's shared instance only (`api` required, no `onPatch`): its own
  fallback instance read canon from a map that already had the override folded in.
- The change count normalizes both sides, so an untouched map whose saved soundscape is
  `{ enabled: false, areas: [] }` or has a `name: ""` area shows no change.
- New tests: Discard local leaves the map clean and undo brings the edit back; a drawing started on A is
  dropped on a switch and never finished on B; no phantom changes. The first and last failed before the fix.
