# A `_dm/` folder at the content root is not excluded

Status: ready-for-agent
Size: XS
Branch: `rebuild-r07-root-dm-exclude`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

Found in R-12's safety review (2026-11-08). `atlas.config.json` excludes `**/_dm/**`, `**/_drafts/**`,
`**/archive/**` and `**/deprecated/**`. With the glob matcher `scanContentFolder` uses, `**/_dm/**`
does not match a `_dm/` folder directly under the content root (`content/_dm/spy.md`), so the
build reads those notes; a note there with `visibility: player` would ship. The same holds for
the other three folders. Today's content has no such folder (the real one is
`content/astrath-deeprealm/_dm/`, holding only `.gitkeep`), so nothing leaks now.

The globs are also case-sensitive (`_DM/`); on the Mac's case-blind file system this was not
tested.

## Acceptance criteria

- A note in `content/_dm/`, `content/_drafts/`, `content/archive/` and `content/deprecated/` is
  excluded from the build, with a test each (either fix the globs, e.g. add `_dm/**`, or make the
  matcher treat `**/` as zero or more folders).
- Folder names in the exclude list match case-blind (`_DM/`, `Archive/`), with a test.
- R-12's `loadAtlasModel` reads the same list, so it is fixed by the same change; a test there too.
- Player build output unchanged on today's content.

## Touches

`atlas.config.json` or the glob matcher behind `scanContentFolder`; tests.
