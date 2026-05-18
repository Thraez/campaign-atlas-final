# Obsidian Markdown Parity + Authoring Assist — Design

Date: 2026-05-18
Status: Design complete, awaiting owner review
Roadmap: Item 1 of the post-Part-3 roadmap ("formatting-assist UI"), reframed during brainstorming into a render-parity feature.

## Problem and goal

The DM authors world and campaign notes in Obsidian markdown. The atlas tool renders those notes into a DM view, a player view, and a published static site. Today the tool's renderer covers CommonMark + GFM plus a few Obsidian extensions (`[[wikilink]]`, `![[image]]`, `%%`/`:::dm` strip), but several Obsidian-core constructs the DM uses do not render, and the same markdown renders through different code paths in different surfaces.

**North star: there must be no difference between Obsidian and the tool in markdown formatting**, for the Obsidian *core* feature set (no community plugins). This is also forward-looking — the owner intends, eventually, to make an Obsidian vault the direct content source (roadmap item 4); building parity now makes that a drop-in rather than a rewrite.

**Parity bar: semantic/structural**, not pixel-clone. Every in-scope Obsidian-core construct renders as the equivalent styled element (a callout looks and folds like a callout, a highlight is highlighted) in *this app's* visual language. Matching Obsidian's own theme CSS is explicitly not a goal.

The owner is a DM, not a developer. Flows must stay sleek; technical internals (asset folders, path forms) must be hidden, not surfaced as decisions.

## Non-goals

Explicitly out of scope, documented so "no difference" is bounded and honest:

- Note and section embeds (`![[Note]]`, `![[Note#Heading]]`, `![[Note#^block]]`). Owner only uses embeds for images.
- Math (`$…$`, `$$…$$` / KaTeX).
- Mermaid and other diagram code blocks.
- `#tag` pill rendering.
- Any Obsidian community-plugin syntax (Dataview, etc.).
- WYSIWYG / contenteditable. Markdown text remains the single source of truth.

## Architecture

### The parity spine (load-bearing decision)

Markdown is currently rendered in at least three places through different pipelines:

- `src/atlas/content/renderEntityMarkdown.ts` — `marked` + `stripDmBlocks` + wikilink/embed regex. Used by the reading view / `EntityPanel`.
- `src/atlas/entity/EntityPanes.tsx` DM pane — `tokenizeWikilinks` + `marked` **directly, no strip** (the DM pane shows DM content by design).
- `src/atlas/content/projectEntityForPlayer.ts` → player pane and the published build (parity-locked).

Adding constructs ad hoc to one path guarantees divergence between surfaces — exactly the "looks different" the north star forbids, and it would reach the published player path inconsistently.

**Decision:** introduce one shared *Obsidian-parity markdown core* — a single module that owns the `marked` instance, its extensions, and the pre/post passes (DM-strip ordering, wikilink tokenization, image-embed resolution). Every render site consumes this module; no site configures `marked` itself. This mirrors the existing `projectMapForPlayer` / `projectEntityForPlayer` pattern ("same code, not two implementations"). A parity-lock test asserts that the same markdown input produces consistent HTML across the DM-pane path, the reading-view path, and the player-projection path (DM-only content excepted, since strip is intentional there).

This spine is built first because every later phase rides on it.

### In-scope constructs (gaps vs current renderer)

1. **Callouts** — `> [!type] Optional title`, including foldable `> [!type]-` (collapsed) / `> [!type]+` (expanded). Full Obsidian-core type set and aliases (note, info, tip/hint, success/check/done, question/help/faq, warning/caution/attention, failure/fail/missing, danger/error, bug, example, quote/cite, abstract/summary/tldr, todo). Icons/colors mapped to existing app theme tokens. Foldable callouts render as native disclosure (`<details>/<summary>`) so they fold in DM, player, and published views.
2. **Highlight** — `==text==`.
3. **Footnotes** — `[^id]` references and `[^id]:` definitions, numbered with backreferences. Edge case: when the player strip removes a `%%`/`:::dm` block that contained a footnote definition, the parity core must drop the now-orphaned reference rather than emit a dangling marker.
4. **Task lists** — `- [ ]` / `- [x]`. `marked`-GFM parses these; this is render/style parity, non-interactive in the reading/player panes.
5. **Image embeds** — `![[name.ext]]` already works in the reading path; routing it through the spine makes it render identically in the DM editing pane too, and emits the relative path form (`atlas/assets/images/name.ext`) instead of the current leading-slash form that the asset validator flags as GitHub-Pages-subpath-breaking.

Retained as-is and routed through the spine: CommonMark, GFM (tables, strikethrough, task lists), `[[wikilink|alias]]`, `%%`/`:::dm` strip.

### Secrecy contract (unchanged)

Secrecy stays a single mechanism: content wrapped in `%%…%%` or `:::dm…:::` is stripped from player and published output. Strip runs **before** parse (already the order in `renderEntityMarkdown`), so a callout — or anything else — inside a DM block never reaches players. Callouts carry no visibility semantics; they are formatting only. There is no per-callout or per-block visibility choice. This adds zero new trust-boundary surface: the existing fog/secret scans (`check-no-secrets`, `check-derived-secrets`) already cover this path. A regression test asserts a callout inside a `%%` block is absent from player output.

### Authoring assist

A progressive-disclosure toolbar above the existing body `<textarea>` (bound to `useEntityEditDraft`'s markdown string via `setBody`). Pure text + selection manipulation; no WYSIWYG. Two tiers:

- **Always visible:** the high-frequency inline actions (bold, italic, highlight, heading, list, quote, link/wikilink, callout).
- **"More" dropdown:** lower-frequency block constructs (footnote, task list, table, code block, the full callout type list).

Plus **entry-template inserts** — one-click snippets that emit plain Obsidian markdown (so they round-trip to a vault and serve the topic-4 future): Lazy-DM NPC entry, Location entry, flat Secrets-&-Clues list, Read-aloud box. These fill the blank-body gap (entity creation produces an empty body today; no Part-3 overlap). Template shapes are grounded in established TTRPG prep practice (Sly Flourish / Return of the Lazy Dungeon Master, WotC published-adventure structure, the Alexandrian).

### Image flow (full: import + library, security-gated)

Today the DM must hand-place image files into `public/atlas/assets/images/` — a developer action that violates the sleek-UX principle. The blocker: the save endpoint's path allowlist (`src/atlas/save/sourcePathAllowlist.ts`, explicitly the single source of truth so a malicious or buggy client cannot widen the write surface) permits asset writes only to `public/atlas/assets/maps/`, **not** `images/`.

Full scope, delivered as its own security-gated phase:

- **Widen the allowlist** to `public/atlas/assets/images/<file>.{png,jpg,jpeg,webp}`, mirroring the existing `maps/` branch shape exactly (fixed segment count, extension allowlist, no traversal). This is a deliberate security-boundary change; it is reviewed and tested with the same caution class as the fog/secret pipeline work (roadmap items 2–3): Opus design, explicit threat reasoning, dedicated tests.
- **"Import image" button** — file picker → copies the file into `public/atlas/assets/images/` via the save endpoint, subject to `validateAsset` rules (extension allowlist, size budget, relative reference form).
- **"Insert image" library picker** — a grid of existing images in that folder; clicking inserts `![[name]]` at the cursor. This is the sleek primary path (no typing, no path knowledge).
- **`![[A…` autocomplete** — optional convenience over the same image list.

## Risks and constraints

- **Multi-render-site divergence** — the primary risk; mitigated by building the parity spine (Phase 0) before anything rides on it.
- **HTML sanitizer coordination** — `sanitizeAtlasHtml`'s allowed-attribute/element list must permit callout markup, `<details>/<summary>`, and the data attributes callouts use, or callouts get stripped post-render. The wikilink implementation already had to coordinate with the sanitizer (`data-link` in `ALLOWED_ATTR`); the same coordination is required here. Concrete integration constraint, called out per phase.
- **`marked` extension provenance** — prefer vetted, pinned `marked` extensions for callouts and footnotes over hand-rolled regex, to stay faithful to CommonMark/Obsidian semantics; each must be verified to survive the sanitizer.
- **Footnote orphan references** under player strip — handled in Phase 2.
- **Security boundary widening** for image import — handled as a discrete, carefully gated phase, not folded into the toolbar phase.
- **Callout theme mapping** brushes the deferred Part-4 visual-polish work — keep it semantic/structural; do not gold-plate visuals in this project.

## Phased plan

Each phase is independently shippable and passes the full project gate: `tsc` clean, Vitest green, ESLint clean, `npm run atlas:publish` scans clean, **and a manual browser smoke** (per the B4.5 lesson: green automated gates do not prove the page renders).

- **Phase 0 — Parity core spine.** One shared markdown-core module; route every render site through it; image-embed routed through it with the relative-path fix; parity-lock test (DM / reading / player consistent). No user-visible feature alone; de-risks divergence first. Success: identical HTML across surfaces for a parity fixture; image embed renders in the DM editing pane.
- **Phase 1 — Callouts.** Full type set, titled, foldable via `<details>`, theme-mapped; sanitizer allowlist updated; `%%`-strip regression test; browser-verify fold in DM, player, and published. Success: every callout type renders and folds in all three surfaces; callout inside `%%` absent from player build.
- **Phase 2 — Highlight + footnotes + task-list styling.** Footnote numbering/backrefs; orphan-reference reconciliation under player strip. Success: `==`/footnotes/task lists render at parity; stripped-block footnote leaves no dangling marker.
- **Phase 3 — Residual parity audit.** Reconcile Obsidian-vs-`marked` single-newline line-break behavior; document the non-goal list in-repo so "no difference" is true for the in-scope set. Success: a representative real DM note renders structurally identically to Obsidian.
- **Phase 4 — Authoring assist.** Progressive-disclosure toolbar + entry templates emitting plain Obsidian markdown into the draft. Ships after the renderer is true, so buttons never produce markdown that renders wrong. Success: every toolbar action and template produces valid Obsidian markdown that round-trips and renders at parity.
- **Phase 5 — Image import + library (security-gated).** Widen the save allowlist to `images/` (threat-reviewed, tested) → "Import image" write → "Insert image" library picker → optional autocomplete. Treated with the fog/secret caution class. Success: DM imports and inserts an image end-to-end without touching the filesystem or any path; allowlist rejects traversal/extension abuse in tests.

Phases 0–3 deliver the literal north star ("export my Obsidian files, same functionality") with no UI. Phase 4 is the convenience layer. Phase 5 is the security-sensitive image workflow. Topic-4 forward-compatibility is a deliberate property of the Phase 0 spine, not extra work.

## Open questions

None blocking. Phase boundaries are independently shippable, so scope can stop after any phase if priorities change; Phases 0–1 are the highest value-per-effort and the recommended minimum.
