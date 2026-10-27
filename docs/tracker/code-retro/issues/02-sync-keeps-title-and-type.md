# Sync keeps a note's title and type

Status: ready-for-agent
Area: Sync from Obsidian

- `src/atlas/content/frontmatterRewrite.ts:3-9`: Sync renames the file to its slug and writes no `title`, so "Isle de Marque" comes back as "Isle De Marque".
- `src/atlas/import/stagingState.ts:185-190`: Staging ignores top-level `type:`. 537 of 619 vault notes use it, the build honours it (`scripts/atlas/parseFrontmatter.ts:68`), and the vault has no `atlas:` blocks.

## Acceptance criteria

- A synced note keeps its exact title (case and punctuation) in the atlas.
- A vault note with top-level `type: npc` stages and lands as npc, whatever its folder.
- Tests at the importer's interface, no React.
