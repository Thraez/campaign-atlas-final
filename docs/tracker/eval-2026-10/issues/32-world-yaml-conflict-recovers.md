# A world.yaml conflict recovers without a page reload

Status: ready-for-agent
Area: editor (save, conflicts)

Found by the fourth sweep (2026-10-28), verified by reading. `worldYamlBaseline.refresh()` runs
only after a successful save (`AtlasPlacementEditor.tsx` ~2197). On a 409 stale-base for
world.yaml (`DiffPreviewModal.tsx` ~160-176), the baseline stays stale, so "Try again" fails the
same way until the page is reloaded. Ticket 17 fixed the same pattern for entity edits; follow
its approach.

## Acceptance criteria

- A failing test first: a world.yaml 409, then Try again, succeeds once canon is re-read.
- On a world.yaml conflict the editor re-reads the baseline and canon, rebuilds the diff, and
  tells the DM what changed underneath.
- The DM's drafts survive the conflict.
