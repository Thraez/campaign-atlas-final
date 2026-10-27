# Entity edit recovers from a save conflict

Status: ready-for-agent
Area: editor, local save

Provisional call (grill round 2, Q5), 2026-10-27: Isak hasn't answered yet; ticketed on the
recommended answer, ranked ahead of `code-retro/06`-`08`. First step of the parked "one client for
canon" note (README).

Bug. `EntityEditPanel.onSave` (`src/atlas/categories/EntityEditPanel.tsx` ~173-212) saves with the
draft's `baseHash`. On a 409 it goes to the error phase, which shows "Its source file may be
missing", and keeps the draft with its stale `baseHash`, so every later save of that entity fails
too. The reload path keeps an existing draft for the same `sourcePath` without refreshing its hash.

## Acceptance criteria

- A conflict says the file changed on disk, not that it may be missing.
- The DM can rebase: reload the file from disk, keep their draft's edits on top of it with the new
  `baseHash`, and save again. Nothing they typed is lost.
- Tests: a 409 followed by rebase and save succeeds; the message names the conflict.
