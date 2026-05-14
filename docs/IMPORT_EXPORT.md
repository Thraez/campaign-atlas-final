# Import and export

How content gets in (existing Obsidian vault → this tool) and out (snapshots, handouts, backups).

## Import: bringing in an Obsidian vault

The atlas's content layer (`content/`) **is already an Obsidian-compatible vault**. You can:

- Open `content/<world>/` directly in Obsidian.
- Use the Obsidian graph, search, and wikilink completion.
- Edit frontmatter in Obsidian; the build picks up changes on the next `npm run atlas:build`.

This is the lowest-friction path. If you have an existing vault you want to fold in, just copy its folder under `content/<your-world>/` and add an `_atlas/world.yaml`.

### When to use the import wizard

The wizard at `/atlas/edit` → **Import** tab is for:

- Auditing a folder before committing: what classifies as "placeable" vs "wiki-only"?
- Detecting conflicts (duplicate titles, frontmatter shape errors) before they hit the build.
- Producing a single import-batch record you can later roll back.

### How files classify

The wizard categorizes each `.md` file:

| Class | Rule | Build behavior |
|---|---|---|
| **Ignored** | Under an excluded folder, or `publish: false` | Skipped entirely. Identity walked for cross-ref leak detection. |
| **Wiki-only** | No `atlas.placements` or legacy `atlas.x/y` | Ships as a wiki entry but no map pin. |
| **Placeable** | Has placements or legacy coords | Ships with one or more pins. |
| **Player-published** | `visibility: player` or `rumor`, plus the above | Visible to players in the final build. |

### Duplicate-title detection

The build already fails on duplicate slugs (same `atlas.id` or same slugified title). The wizard surfaces these **before** commit:

- If two files would produce the same id, the wizard offers **merge** (one canonical file, append body), **rename** (suffix one), or **skip** (drop one).
- The build's own duplicate-slug check is the final guard — the wizard helps you avoid hitting it.

### Import-batch tracking and undo (planned)

The import wizard today produces YAML patches for manual paste; it does **not** write to disk on its own. Once the wizard gains a write-direct affordance (via the existing `/__atlas/save` dev plugin), every commit will also write a JSON record to `atlas/import-batches/<ISO-timestamp>.json`:

```json
{
  "timestamp": "2026-05-14T15:00:00Z",
  "files": [
    { "path": "content/world/settlements/Foo.md", "action": "created", "hash": "..." },
    { "path": "content/world/_atlas/world.yaml",  "action": "modified", "hashBefore": "...", "hashAfter": "..." }
  ],
  "summary": "Imported 12 entities, 4 placements, 0 new maps."
}
```

The batch list will offer **remove this batch**:

- For `created` files: delete them (only if their current hash matches the recorded `hash` — otherwise warn).
- For `modified` files: restore the original (only if the current hash matches `hashAfter` — otherwise warn).

A conflict warning means a file has been edited since the import. The wizard will refuse to silently overwrite. Resolve manually, then retry.

For the current patch-paste workflow, the audit trail lives in git: every paste produces a commit, and `git log` is the batch history. Status: **planned**, not yet shipped — track it in `superpowers:writing-plans` style follow-up work.

## Patches: the YAML-paste workflow

For users not running the save plugin (or wanting to commit a discrete change):

1. Make edits in the Creator Cockpit.
2. **Export patch** at the bottom of every tab.
3. A `.txt` file downloads, containing one YAML block per entity, with comment headers describing where it goes.
4. Paste each block into the matching entity's frontmatter (or `world.yaml`).
5. Save the markdown file. Re-run `npm run atlas:build`.

The patch file **is not** valid YAML on its own — the comment headers and multi-entity structure make it a documentation file. **Never paste the whole patch into one place.**

## Export: handouts

The viewer's per-entity print button (`src/atlas/printHandout.ts`) produces a printable HTML page for one entity, suitable for printing or saving as PDF. For a session, hand out one entity at a time:

1. Player viewer → click the entity → **Print handout**.
2. Browser's print dialog → save as PDF.

### Multi-entity bundles (planned)

For session prep ("hand out these 5 NPCs"), a multi-entity handout flow is planned in the Entities tab of the Creator Cockpit. Today, repeat the single-entity print flow per entity. Status: **planned**, not yet shipped.

## Export: full backup

```bash
npm run atlas:backup
```

This produces `backups/<timestamp>.zip` containing:

- `content/` — the entire canon vault.
- `public/atlas/assets/` — all images and assets referenced by the build.
- `atlas.config.json` — the build config.
- `examples/seed-world/` — the seed world (so a restore is self-sufficient).

It does **not** include:

- `node_modules/`, `dist/`, `public/atlas/atlas.json` — regenerable from canon.
- `.local-atlas/` — local DM build, also regenerable.
- `.git/` — use `git bundle` or push to a remote for git history.

To restore from a backup:

1. Unzip into an empty project directory.
2. `git init` (if you want history; otherwise skip).
3. `npm install`.
4. `npm run atlas:build`.

The backup is a **snapshot**, not a sync. For ongoing version control, use git.

## Export: clean Obsidian vault

Because `content/` is already Obsidian-compatible, no explicit export is needed:

- Copy `content/<world>/` to your Obsidian vault directory.
- Optional: delete `_atlas/` if you don't want world-config noise.
- Optional: delete `atlas:` frontmatter keys with a vim macro or Obsidian plugin if you want a "plain prose" version.

The build pipeline does **not** rewrite your markdown. If you author `# H1` headings, they remain `# H1`. If you use list-style choices the build's markdown renderer normalizes, the rendered output may differ — but the source is unchanged.

## Reverse: from atlas.json back to canon

There is no `atlas.json → markdown` reverse builder. The build is one-way:

```text
markdown + world.yaml ──► atlas.json
```

If you've lost the source and only have a deployed `atlas.json`, the practical recovery is:

1. Pull `public/atlas/atlas.json` from the GitHub Pages deploy or repo.
2. Use it as a reference for what entities and placements existed.
3. Rebuild canon by hand. There is no shortcut.

This is intentional — `atlas.json` is a derived artifact, and we don't want a workflow where it's treated as canon. The roundtrip test in `src/test/` confirms `markdown → atlas.json → markdown → atlas.json` produces a stable output, but the round trip is build-side only; the second stage is a snapshot comparison, not a regenerated source.

## Asset audit

```bash
npm run atlas:audit-assets
```

Reports:

- Images >1 MB (PWA cache cap is 8 MB; large maps eat budget fast).
- Unreferenced assets in `public/atlas/assets/` (potential orphans).
- Per-map asset size totals.

Not chained into `atlas:publish` by default — it's advisory. Run it monthly or before a major release.
