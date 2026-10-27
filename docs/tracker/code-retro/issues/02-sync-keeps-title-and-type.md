# Sync keeps a note's title and type

Status: done
Area: Sync from Obsidian

- `src/atlas/content/frontmatterRewrite.ts:3-9`: Sync renames the file to its slug and writes no `title`, so "Isle de Marque" comes back as "Isle De Marque".
- `src/atlas/import/stagingState.ts:185-190`: Staging ignores top-level `type:`. 537 of 619 vault notes use it, the build honours it (`scripts/atlas/parseFrontmatter.ts:68`), and the vault has no `atlas:` blocks.

## Acceptance criteria

- A synced note keeps its exact title (case and punctuation) in the atlas.
- A vault note with top-level `type: npc` stages and lands as npc, whatever its folder.
- Tests at the importer's interface, no React.

## Comments

2026-10-27, branch `code-retro-fixes`: each Staging row now carries the note's exact `title`: the frontmatter title, else an Obsidian-style filename verbatim ("Isle de Marque.md" → "Isle de Marque"), else the build's title-cased slug for slug-shaped names. Commit writes it as top-level `title` on create (`rewriteFrontmatter` takes a `title` patch) and on update. The update case mattered too: the merge takes the vault's top-level fields wholesale, so a disk title was dropped. Staging reads top-level `type:` after `atlas.type`, as the build does. Six tests in `src/test/build-import-changes.test.ts`, through `buildStagingRows` and `buildImportChanges`.
