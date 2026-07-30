# Known limitations

What the atlas intentionally does not do, what it partially supports, and why. For things we have decided to **never** build, see [NON_GOALS.md](NON_GOALS.md).

## Obsidian compatibility

The atlas reads Obsidian-flavored markdown. Most Obsidian features work; a few don't, and a few are intentionally not supported.

### Supported

| Feature | Status | Notes |
|---|---|---|
| YAML frontmatter | ✓ | Parsed via `gray-matter`. `atlas:` namespace is the build's domain; everything else is preserved. |
| Wikilinks `[[Note]]` | ✓ | Resolved at build by title and alias. |
| Display-text wikilinks `[[Note\|alt]]` | ✓ | Renders as "alt", links to `Note`. |
| Folder wikilinks `[[Folder/Note]]` | ✓ | Same resolution rules. |
| Heading anchors `[[Note#Heading]]` | ✓ | Heading part is preserved in the rendered link. |
| Aliases | ✓ | `atlas.aliases: [Old Name, Nickname]` — wikilinks resolve to either. |
| Tags | ✓ | Both `atlas.tags: [city, mining]` and `tags:` at the top-level frontmatter. |
| Inline comments `%% ... %%` | ✓ | Stripped from player builds, kept in DM builds. |
| Unbalanced `%%` detection | ✓ | Build fails — prevents an unclosed block from leaking everything after it. |
| Excluded folders | ✓ | Default `_drafts`, `_dm`, `archive`, `deprecated`. Configurable in `atlas.config.json`. |
| Tasks `- [ ] foo` | ✓ | Render as static checkboxes. |
| Code fences ` ``` ` | ✓ | Rendered. The `%%` stripper ignores `%%` inside fences. |

### Partial / qualified

| Feature | Status | Notes |
|---|---|---|
| Image embeds `![[image.png]]` | ✓ (image embeds only) | Resolved and rendered at parity, per [MARKDOWN_PARITY.md](MARKDOWN_PARITY.md). Note/section embeds (`![[Note]]`, `![[Note#Heading]]`) are not — embeds are for images only; link to the note instead. |
| Callouts `> [!type]` | ✓ (foldable) | Obsidian's `> [!type] Title` syntax renders as a foldable callout with the core type set and its aliases, at parity — see [MARKDOWN_PARITY.md](MARKDOWN_PARITY.md). The project's own `:::dm` callout remains the visibility-aware variant (see [VISIBILITY_AND_PLAYER_SAFETY.md](VISIBILITY_AND_PLAYER_SAFETY.md)). |
| Block references `^block-id` | ✗ (preserved as text) | Block-reference anchors appear as plain text in the rendered output. The build does not resolve `[[Note#^id]]` block links. |
| Math `$x^2$` | ✗ (rendered as text) | No KaTeX/MathJax. If you need math, render to an image and embed. |
| Mermaid diagrams | ✗ | Not rendered. Same workaround. |
| Templater / DataView | ✗ | These are Obsidian plugins, not file-format features. The build sees the raw template text. Resolve templates before committing. |
| Folder notes | partial | A `Folder.md` next to `Folder/` is treated as a regular entity. There is no "folder is its own note" semantics. |
| Frontmatter aliases | ✓ via `atlas.aliases:` | The plain `aliases:` top-level field is **not** read. Use `atlas.aliases:`. |

### Reasoning for unsupported

- **Note / section embeds (`![[Note]]`, `![[Note#Heading]]`)** — embeds are scoped to images only; transcluding another note's content raises the same player-vs-DM filtering question as a wikilink, without the benefit of a visible link. Link to the note instead.
- **Block references** — they're heavyweight (every paragraph needs an id) and rare in the kind of prose-canon this tool serves.

## Map limitations

| Limitation | Status | Workaround |
|---|---|---|
| One map at a time in the viewer | by design | Switch maps via the viewer's map picker. Hierarchical, not spatial. |
| No tile pyramid | not yet | Large maps (>4K px on the long side) work but eat memory on mobile. Plan: `scripts/atlas/tile-map.ts` slices maps into Leaflet tiles. Not built yet. |
| No multi-map composite canvas | by design | World-canvas mode (multiple maps spatially composited) is on the [non-goals list](NON_GOALS.md) under "Full GIS-style multi-map alignment". |
| `atlas.json` loaded whole | not yet | For 5+ maps with rich entity content, per-map data chunking is the planned scale-out. Today the whole atlas loads on first visit. |
| Pin clustering at low zoom | not yet | At 200+ pins on the overview map, the cluster gets unreadable. Add Leaflet markercluster or priority-based culling. The schema's `pin.priority` is already in place. |

## Soundscapes

Ambient audio is authored in the editor's **Sound** tab and plays in the player viewer as visitors pan into a sound area. See [WORKFLOWS.md](WORKFLOWS.md#ambient-sound) for the authoring flow.

| Limitation | Status | Notes |
|---|---|---|
| Audio needs a user gesture before it can start | by design (browser policy) | Browsers block autoplay until the visitor interacts with the page. The viewer surfaces an "enable sound" control; ambience begins on that first gesture, not on page load (`AudioEngine.unlock()` must run from a user-gesture handler). |
| Starter loops ship compressed | shipped | The three seed loops (`wind-hollow`, `water-trickle`, `cavern-drone`) ship as Ogg (`src`) with an M4A/AAC fallback twin (`srcFallback`) for browsers that can't decode Ogg/Vorbis (notably Safari). |
| Codec support varies by browser | partial | The schema supports a primary bed (`src`) plus a `srcFallback` twin so a browser that can't decode one codec uses the other. Safari, in particular, does not decode Ogg/Vorbis — beds that use Ogg need an AAC/M4A fallback authored. |

## Editor limitations

| Limitation | Status |
|---|---|
| Desktop-only | by design — see [NON_GOALS.md](NON_GOALS.md#hard-nos), "Tablet DM mode". |
| No mobile-friendly editor | by design |
| Save plugin is dev-only | by design — never shipped to production. |
| Single-user, no collaboration | by design — see [NON_GOALS.md](NON_GOALS.md) under "Multi-user real-time editing". |
| In-memory undo, no persistence | by design — the canonical undo is git. |
| No multi-cursor frontmatter editing | by design — Obsidian/VS Code handles that. The editor is for visual placement. |

## Search limitations

| Limitation | Status | Workaround |
|---|---|---|
| Substring matching only | by design | A typo (`Thornhld`) returns zero results. Fuzzy search is on the [non-goals list](NON_GOALS.md) until scale proves the current UX insufficient. |
| Body indexed in full (capped at 4KB per entry) | by design | Long lore entries are truncated for the index. The side panel always shows the full body. |
| Max 40 results | by design | Refine with the type/tag filter or be more specific. |
| Phrase search (`"..."`) | shipped | Quoted spans (`"exact phrase"`) match only as an exact, case-insensitive contiguous substring; unquoted terms outside the quotes still match individually. |

## Theming

| Limitation | Status | Workaround |
|---|---|---|
| Dark theme only (no light/parchment) | by design (current) | The app's design center is a "fantasy command-center" dark palette. `next-themes` is wired in the dependency tree but no light palette exists. Adding light mode is a real design exercise, not just a toggle — deferred until a parchment palette is designed. |

## Mobile player

| Limitation | Status |
|---|---|
| Pin hit-boxes ≥44px on touch | shipped — Leaflet `iconSize: [44, 44]` (WCAG 2.5.5 AAA). Visual SVG remains ~22px and is centered inside the hit area. |
| Bottom-sheet entity panel | shipped |
| Pinch-zoom + pan | shipped |
| Search palette is keyboard-first | by design — works on mobile via the search button, but the keyboard shortcut path is desktop-oriented. |

## Accessibility — color-only cues audit

WCAG 1.4.1 says color must not be the *only* way to convey information. The map renders a few classes of overlay; here is where each currently stands.

| Layer | Color used? | Other cues |
|---|---|---|
| Pins | yes (fill) | shape varies by preset (teardrop, circle, square, diamond, shield, star) — independent of color. ✓ |
| Regions | yes (fill + stroke) | name surfaced via hover Tooltip (and click Popup). ✓ — added in the Batch H audit. No fill pattern yet. |
| Routes | yes (stroke) | optional `dashed: true` adds a dash pattern; `weight` is per-route; mode/distance shown via hover Tooltip. Partial — two solid routes are still distinguished by color only at a glance. |
| Fog | single color (binary) | not a differentiation issue — fog is on or off. ✓ |
| Grid | single color | not a differentiation issue. ✓ |

**Recommendation for authors:** when two routes share a map and are similar in length, set one to `dashed: true` or vary `weight` so the distinction is not color-only. The build does not enforce this — it's a content-side choice.

**Not yet addressed:** region fill patterns (stripes/dots) are not supported. If two adjacent regions ship the same fill color, only the hover tooltip distinguishes them. Adding a `pattern:` field to regions would be the future fix; it has not been needed in current canon.

## Authentication and hosting

| Limitation | Status |
|---|---|
| No hosted DM editor | by design — local + GitHub Pages model. See [NON_GOALS.md](NON_GOALS.md). |
| No accounts, no auth | by design |
| Player site is fully public | by design — anything in `public/atlas/` is web-accessible to anyone with the URL. Don't put DM content there. See [VISIBILITY_AND_PLAYER_SAFETY.md](VISIBILITY_AND_PLAYER_SAFETY.md). |
| No "private link" mode | not built |

## Privacy and security

| Limitation | Status |
|---|---|
| Service-worker cache invalidation requires a new build | by design — Vite content hashes handle JS/CSS; `atlas.json` is fetched at runtime. See [WORKFLOWS.md](WORKFLOWS.md#cache-invalidation). |
| Asset license tracking | shipped — the `assetCredits` registry in `world.yaml` (loaded by `scripts/atlas/loadWorldConfig.ts`) records per-asset source/license/author, surfaced on the published [Credits page](../src/pages/AtlasCredits.tsx). |
| External URL assets are not scanned | by design — the safety scanners look at local files. Don't link DM-only images from external CDNs. |

## Things that have been considered and rejected

See [NON_GOALS.md](NON_GOALS.md) for the explicit "we won't build this" list.
