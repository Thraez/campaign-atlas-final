# Editor draft registry

Status: wontfix
Area: editor (`src/pages/AtlasPlacementEditor.tsx` ~700-1020)

Retro candidate 4. Every draft is wired by hand into four lists; missing one gives a silent "All changes saved" (fixed three times already). Soundscape edits persist only while their tab is mounted (`src/atlas/tabs/SoundscapeTab.tsx:113-120`). Deferred by Isak on 2026-10-27; reopen when the editor gets new draft types.

## Acceptance criteria (when reopened)

- A draft that is only registered becomes dirty, appears in the save batch, survives a session restore, and goes clean after undo.
- Soundscape edits save with the tab closed.
