# The soundscape draft belongs to one map: sound edits never land on another map

Status: ready-for-agent
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
