Ticket: `docs/tracker/eval-2026-10/issues/30-editor-drafts-kept-per-map.md`

Editor drafts are kept per map: a save no longer throws away another map's region, route and fog
drafts, and undo never applies one map's edit to another.

- Save: `buildWorldYamlContent` takes `drafts: Record<mapId, MapDraft>` and writes every map's
  metadata, layer, region, route and fog draft. `markSaved(writtenMapIds)` clears only what it wrote.
- One dirty signal: `session.unsavedCount` (active map + other maps). The chip, beforeunload and
  `worldYamlDirty` all read it.
- Undo entries carry their map; undo/redo switches to that map first (`useUndoStack` `switchToMap`).
- Pins duplicated to other maps are clean after the save that wrote them.
- Drafts under a map id the project no longer has (orphans) are not counted, saved or cleared, only
  kept, with one `console.warn`. Post-save cleanup is the pure `mapDraftsAfterSave`.
- Tests: `drafts-per-map.test.tsx` (the three bugs through the real hooks, each red first),
  `map-drafts-after-save.test.ts`, `build-save-batch.test.ts` on the per-map interface.
- Provisional calls: a world.yaml save clears every map's drafts (all maps share one world.yaml);
  undo of another map's edit switches map first; beforeunload also warns for restored localStorage
  pins; a map without a fog draft no longer gets a default fog block.
- Filed: 44 (soundscape draft is one slot), 45 (deleted pins on other maps not counted or written).
- Ready-for-human: draw on two maps, save once, reload, both keep their edits.

Review (Opus, medium): findings (orphan map ids, untested post-save cleanup) fixed in 260cab5;
re-check CLEAN.

## Local gate (2026-11-07, branch at 260cab5, on origin/main 2f4e7e6)

```
typecheck:all exit 0 · lint exit 0 · format:check exit 0
test:ci exit 0 — all shards green
atlas:publish exit 0 · atlas:check-secrets dist exit 0 · atlas:check-derived dist exit 0
GATE PASSED
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
