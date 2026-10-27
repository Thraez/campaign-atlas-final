# Obsidian Markdown Parity — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one shared markdown-rendering core so every surface renders identically (Phase 0), then add Obsidian callouts (`> [!type]`, foldable) through that core so they render at parity in DM, player, and published views (Phase 1).

**Architecture:** Today `marked` is configured/called in two places with different pre/post passes (`renderEntityMarkdown.ts` and `EntityPanes.tsx`), so any new construct diverges between surfaces. Phase 0 introduces `src/atlas/content/markdownCore.ts` — the single owner of the `marked` instance and its extensions — exposing `markdownToHtml(md)` (marked only) and `renderMarkdownBodyToSafeHtml(md)` (marked + sanitize). Both existing call sites delegate to it, keeping their own wikilink/strip pre-passes. Phase 1 registers a callout block-extension on that shared instance, so callouts appear everywhere by construction. Secrecy is unchanged: `stripDmBlocks`/`%%` runs before the core, so a callout inside a DM block never reaches players.

**Tech Stack:** TypeScript, `marked` ^18.0.3 (custom block extension, no new dependency), `isomorphic-dompurify` (existing `sanitizeAtlasHtml`), Vitest, Tailwind/CSS theme tokens in `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-05-18-obsidian-markdown-parity-design.md` (Phases 0–1).

**Scope:** This plan is Phases 0–1 only. Phases 2 (highlight/footnotes/task-lists), 3 (residual parity audit), 4 (authoring toolbar), 5 (security-gated image flow) are independently shippable and get their own plans after 0–1 lands.

**Test/verify commands:**
- Single test file: `npx vitest run <path>`
- Types: `npx tsc --noEmit`
- Lint: `npm run lint`
- Slice gate (end of each phase): `npm test -- --run` + `npx tsc --noEmit` + `npm run lint` + `npm run atlas:publish` + **manual browser smoke** (managed preview; green automated gates do not prove the page renders — the B4.5 lesson).

**Pre-existing known-failing tests (ignore, not caused by this work):** `src/test/session/idbStore.test.ts`, `src/test/session/useEditorSession.test.tsx`.

**Depends on:** nothing. Phase 1 depends on Phase 0 (callout extension is registered in the Phase 0 core module).

---

## File Structure

- `src/atlas/content/markdownCore.ts` — **create.** Single owner of the `marked` instance + extensions. Exports `markdownToHtml(md: string): string` and `renderMarkdownBodyToSafeHtml(md: string): string`. Phase 1 adds the callout extension here.
- `src/atlas/content/renderEntityMarkdown.ts` — **modify.** Replace its local `marked.parse` + `sanitizeAtlasHtml` with `renderMarkdownBodyToSafeHtml`. Keep EMBED_RE/WIKILINK regex pre-passes.
- `src/atlas/entity/EntityPanes.tsx` — **modify.** Replace inline `marked.parse(...)` with `markdownToHtml(...)`; keep the existing `tokenizeWikilinks → markdownToHtml → renderLinkTokens → sanitizeAtlasHtml` order.
- `src/atlas/sanitizeHtml.ts` — **modify (Phase 1).** Add `details`, `summary` to `ALLOWED_TAGS`; `open`, `data-callout` to `ALLOWED_ATTR`.
- `src/index.css` — **modify (Phase 1).** Add `.atlas-callout` styles using existing theme tokens, next to the existing `.atlas-wikilink` rules.
- Tests: `src/test/content/markdownCore.test.ts`, `src/test/content/markdownCore-callout.test.ts`, `src/test/content/callout-secrecy.test.ts`.

---

# PHASE 0 — Parity spine

### Task 0.1: Create the shared markdown core

**Files:**
- Create: `src/atlas/content/markdownCore.ts`
- Test: `src/test/content/markdownCore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/content/markdownCore.test.ts
import { describe, it, expect } from "vitest";
import { markdownToHtml, renderMarkdownBodyToSafeHtml } from "@/atlas/content/markdownCore";

describe("markdownCore", () => {
  it("renders GFM tables and strikethrough", () => {
    const html = markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>gone</del>");
  });

  it("renderMarkdownBodyToSafeHtml strips script injection", () => {
    const html = renderMarkdownBodyToSafeHtml("ok\n\n<script>alert(1)</script>");
    expect(html).toContain("ok");
    expect(html).not.toContain("<script>");
  });

  it("is deterministic (same input → same output, the parity guarantee)", () => {
    const md = "# Title\n\n- one\n- two";
    expect(markdownToHtml(md)).toBe(markdownToHtml(md));
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/content/markdownCore.test.ts`
Expected: FAIL — module `@/atlas/content/markdownCore` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/atlas/content/markdownCore.ts
/**
 * The single owner of the `marked` instance and its extensions.
 *
 * Every surface (reading view, DM editing pane, player projection, published
 * build) renders markdown through this module so the SAME markdown produces
 * the SAME HTML everywhere — there is no second `marked` configuration.
 * Obsidian-parity extensions (callouts, etc.) are registered here once.
 *
 * Secrecy is NOT handled here: `stripDmBlocks`/`%%` runs in the caller BEFORE
 * this module sees the text, so DM-only content never reaches the renderer.
 */
import { Marked } from "marked";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

const marked = new Marked({ gfm: true, breaks: false });

/** Marked-only render. Callers that inject post-render tokens (wikilinks)
 *  use this and sanitize themselves AFTER their post-pass. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Marked + sanitize, for callers with no post-render injection. */
export function renderMarkdownBodyToSafeHtml(md: string): string {
  return sanitizeAtlasHtml(markdownToHtml(md));
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/test/content/markdownCore.test.ts`
Expected: PASS.

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/content/markdownCore.ts src/test/content/markdownCore.test.ts
git commit -m "feat(markdown): add shared markdown core (single marked owner)"
```

---

### Task 0.2: Route renderEntityMarkdown through the core

**Files:**
- Modify: `src/atlas/content/renderEntityMarkdown.ts:1-2,32-33`
- Test: `src/test/content/renderEntityMarkdown.test.ts` (existing — must stay green)

- [ ] **Step 1: Run the existing test (baseline green)**

Run: `npx vitest run src/test/content/renderEntityMarkdown.test.ts`
Expected: PASS (record this is green before changing anything).

- [ ] **Step 2: Implement the rewire**

In `src/atlas/content/renderEntityMarkdown.ts`, replace the `marked` import and the final parse+sanitize.

Change line 1 from:

```ts
import { marked } from "marked";
```

to:

```ts
import { renderMarkdownBodyToSafeHtml } from "@/atlas/content/markdownCore";
```

Replace the final two lines of `renderEntityMarkdown` (currently):

```ts
  const html = marked.parse(text, { async: false }) as string;
  return sanitizeAtlasHtml(html);
```

with:

```ts
  return renderMarkdownBodyToSafeHtml(text);
```

Remove the now-unused `sanitizeAtlasHtml` import if ESLint flags it (the regex pre-passes for EMBED_RE/WIKILINK_RE stay untouched).

- [ ] **Step 3: Run the existing test (still passes)**

Run: `npx vitest run src/test/content/renderEntityMarkdown.test.ts`
Expected: PASS — identical output (same marked, same sanitizer, just centralized).

- [ ] **Step 4: Types + lint + commit**

Run: `npx tsc --noEmit` → clean. Run: `npm run lint` → clean.

```bash
git add src/atlas/content/renderEntityMarkdown.ts
git commit -m "refactor(markdown): renderEntityMarkdown delegates to shared core"
```

---

### Task 0.3: Route the EntityPanes DM pane through the core

**Files:**
- Modify: `src/atlas/entity/EntityPanes.tsx:2,31-36`
- Test: `src/test/content/markdownCore.test.ts` (extend with the parity-lock case)

The DM pane currently calls `marked.parse` directly (line 34). Order must stay: `tokenizeWikilinks → markdown → renderLinkTokens → sanitize`. Swap only the markdown step to the shared core.

- [ ] **Step 1: Write the failing parity-lock test**

Append to `src/test/content/markdownCore.test.ts`:

```ts
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

describe("markdownCore parity-lock", () => {
  it("the DM-pane pipeline and a direct core render agree on block structure", () => {
    const body = "## Heading\n\n> a quote\n\n- item";
    // DM-pane pipeline (no wikilinks present → tokens unchanged)
    const { tokenized, links } = tokenizeWikilinks(body, { resolveByName: () => undefined });
    const panePath = sanitizeAtlasHtml(renderLinkTokens(markdownToHtml(tokenized), links, {}));
    // Direct core render
    const corePath = renderMarkdownBodyToSafeHtml(body);
    expect(panePath).toBe(corePath);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/content/markdownCore.test.ts`
Expected: PASS already (proves the pipelines are equivalent for wikilink-free content — this is the regression guard for the rewire).

- [ ] **Step 3: Implement the rewire**

In `src/atlas/entity/EntityPanes.tsx` line 2, replace:

```ts
import { marked } from "marked";
```

with:

```ts
import { markdownToHtml } from "@/atlas/content/markdownCore";
```

In the `dmHtml` `useMemo` (line ~34), replace:

```ts
    const html = marked.parse(tokenized, { async: false }) as string;
```

with:

```ts
    const html = markdownToHtml(tokenized);
```

(`renderLinkTokens` + `sanitizeAtlasHtml` lines stay exactly as they are.)

- [ ] **Step 4: Run the parity test + EntityPanes regression**

Run: `npx vitest run src/test/content/markdownCore.test.ts`
Expected: PASS.
Run: `npx vitest run src/test -t "EntityPanes"` (any existing EntityPanes/pane suites)
Expected: PASS.

- [ ] **Step 5: Phase 0 slice gate + commit**

Run, in order — all must pass (ignore the two known-failing session tests listed in the header):
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --run`
- `npm run atlas:publish`
- **Browser smoke:** start the managed preview, open an entity in the editor, confirm the DM pane and reading view still render markdown (headings, lists, a table) unchanged.

```bash
git add src/atlas/entity/EntityPanes.tsx src/test/content/markdownCore.test.ts
git commit -m "refactor(markdown): EntityPanes DM pane delegates to shared core (parity spine complete)"
```

---

# PHASE 1 — Callouts

### Task 1.1: Allow callout markup through the sanitizer

**Files:**
- Modify: `src/atlas/sanitizeHtml.ts:24-43,45-52`
- Test: `src/test/content/markdownCore-callout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/content/markdownCore-callout.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

describe("sanitizer allows callout markup", () => {
  it("keeps details/summary/open/data-callout", () => {
    const html = `<details class="atlas-callout atlas-callout-note" data-callout="note" open><summary>Note</summary><p>body</p></details>`;
    const out = sanitizeAtlasHtml(html);
    expect(out).toContain("<details");
    expect(out).toContain("data-callout=\"note\"");
    expect(out).toContain("open");
    expect(out).toContain("<summary>Note</summary>");
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/content/markdownCore-callout.test.ts`
Expected: FAIL — `details`/`summary` stripped (not in `ALLOWED_TAGS`).

- [ ] **Step 3: Implement**

In `src/atlas/sanitizeHtml.ts`, in `ALLOWED_TAGS` add `"details", "summary"` to the "Block + headings" group:

```ts
  "p", "blockquote", "pre", "hr", "br",
  "details", "summary",
```

In `ALLOWED_ATTR` add `open` and `data-callout`:

```ts
  "class", "data-link", "data-id", "data-broken", "data-display", "data-callout",
  "open",
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/test/content/markdownCore-callout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sanitizeHtml.ts src/test/content/markdownCore-callout.test.ts
git commit -m "feat(sanitize): allow callout details/summary markup"
```

---

### Task 1.2: Callout block extension on the shared core

**Files:**
- Modify: `src/atlas/content/markdownCore.ts`
- Test: `src/test/content/markdownCore-callout.test.ts` (extend)

Obsidian fold semantics: no suffix or `+` = expanded (`open`); `-` = collapsed (no `open`). Title defaults to the capitalized type when omitted.

- [ ] **Step 1: Write the failing tests**

Append to `src/test/content/markdownCore-callout.test.ts`:

```ts
import { markdownToHtml } from "@/atlas/content/markdownCore";

describe("callout extension", () => {
  it("renders a basic callout with default title", () => {
    const h = markdownToHtml("> [!note]\n> hello");
    expect(h).toContain('data-callout="note"');
    expect(h).toContain("<summary>Note</summary>");
    expect(h).toContain("hello");
    expect(h).toContain("<details");
    expect(h).toContain("open"); // no suffix = expanded
  });

  it("uses a custom title and renders nested markdown", () => {
    const h = markdownToHtml("> [!warning] Be careful\n> with **bolds**");
    expect(h).toContain('data-callout="warning"');
    expect(h).toContain("<summary>Be careful</summary>");
    expect(h).toContain("<strong>bolds</strong>");
  });

  it("collapsed with '-' omits the open attribute", () => {
    const h = markdownToHtml("> [!tip]- Hidden\n> secret tip");
    expect(h).toContain('data-callout="tip"');
    expect(h).not.toMatch(/<details[^>]*\sopen/);
  });

  it("does not swallow a plain blockquote", () => {
    const h = markdownToHtml("> just a quote");
    expect(h).toContain("<blockquote>");
    expect(h).not.toContain("data-callout");
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/content/markdownCore-callout.test.ts`
Expected: FAIL — no callout extension; `> [!note]` renders as a blockquote.

- [ ] **Step 3: Implement the extension**

In `src/atlas/content/markdownCore.ts`, add the extension and register it on the instance. Insert before `export function markdownToHtml`:

```ts
const CALLOUT_BLOCK =
  /^ {0,3}> ?\[!(\w+)\]([+-]?)(.*)(?:\n|$)((?:^ {0,3}> ?.*(?:\n|$))*)/m;

const CALLOUT_TITLES: Record<string, string> = {
  note: "Note", info: "Info", tip: "Tip", hint: "Tip", important: "Important",
  success: "Success", check: "Success", done: "Success",
  question: "Question", help: "Question", faq: "Question",
  warning: "Warning", caution: "Warning", attention: "Warning",
  failure: "Failure", fail: "Failure", missing: "Failure",
  danger: "Danger", error: "Error", bug: "Bug",
  example: "Example", quote: "Quote", cite: "Quote",
  abstract: "Abstract", summary: "Abstract", tldr: "Abstract", todo: "Todo",
};

function calloutExtension() {
  return {
    name: "callout",
    level: "block" as const,
    start(src: string) {
      const m = src.match(/^ {0,3}> ?\[!/m);
      return m ? m.index : undefined;
    },
    tokenizer(this: { lexer: { blockTokens: (s: string) => unknown[] } }, src: string) {
      const m = CALLOUT_BLOCK.exec(src);
      if (!m || m.index !== 0) return undefined;
      const [raw, typeRaw, fold, titleRaw, bodyRaw] = m;
      const type = typeRaw.toLowerCase();
      const title =
        titleRaw.trim() || CALLOUT_TITLES[type] ||
        type.charAt(0).toUpperCase() + type.slice(1);
      // Strip the leading "> " from each body line.
      const body = (bodyRaw ?? "")
        .split("\n")
        .map((l) => l.replace(/^ {0,3}> ?/, ""))
        .join("\n")
        .trim();
      return {
        type: "callout",
        raw,
        calloutType: type,
        open: fold !== "-",
        title,
        tokens: this.lexer.blockTokens(body),
      };
    },
    renderer(
      this: { parser: { parse: (t: unknown[]) => string } },
      token: { calloutType: string; open: boolean; title: string; tokens: unknown[] },
    ) {
      const inner = this.parser.parse(token.tokens);
      const openAttr = token.open ? " open" : "";
      const t = token.calloutType.replace(/[^a-z0-9-]/g, "");
      return (
        `<details class="atlas-callout atlas-callout-${t}" data-callout="${t}"${openAttr}>` +
        `<summary>${token.title}</summary>${inner}</details>`
      );
    },
  };
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({ extensions: [calloutExtension()] });
```

Remove the earlier standalone `const marked = new Marked(...)` line from Task 0.1 (it is now replaced by the two lines above, with `.use(...)` registering the extension).

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/test/content/markdownCore-callout.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Full markdown core regression**

Run: `npx vitest run src/test/content/markdownCore.test.ts`
Expected: PASS (GFM, sanitize, parity-lock still hold).

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/content/markdownCore.ts src/test/content/markdownCore-callout.test.ts
git commit -m "feat(markdown): Obsidian callout block extension on shared core"
```

---

### Task 1.3: Callout styling (theme tokens)

**Files:**
- Modify: `src/index.css` (add near the existing `.atlas-wikilink` rules)

No test (pure CSS); verified in the Phase 1 browser smoke.

- [ ] **Step 1: Add styles**

Append these rules to `src/index.css` (after the existing `.atlas-*` block; tokens already defined in `:root`):

```css
.atlas-callout {
  border-left: 3px solid hsl(var(--accent));
  background: hsl(var(--muted) / 0.4);
  border-radius: 6px;
  padding: 0.5rem 0.85rem;
  margin: 0.75rem 0;
}
.atlas-callout > summary {
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  color: hsl(var(--accent));
}
.atlas-callout > summary::-webkit-details-marker { display: none; }
.atlas-callout > summary::before { content: "▸ "; }
.atlas-callout[open] > summary::before { content: "▾ "; }
.atlas-callout-warning, .atlas-callout-caution, .atlas-callout-attention,
.atlas-callout-important {
  border-left-color: hsl(var(--primary));
}
.atlas-callout-warning > summary, .atlas-callout-caution > summary,
.atlas-callout-attention > summary, .atlas-callout-important > summary {
  color: hsl(var(--primary));
}
.atlas-callout-danger, .atlas-callout-error, .atlas-callout-failure,
.atlas-callout-fail, .atlas-callout-bug, .atlas-callout-missing {
  border-left-color: hsl(var(--destructive));
}
.atlas-callout-danger > summary, .atlas-callout-error > summary,
.atlas-callout-failure > summary, .atlas-callout-fail > summary,
.atlas-callout-bug > summary, .atlas-callout-missing > summary {
  color: hsl(var(--destructive));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat(markdown): callout theme styling"
```

---

### Task 1.4: Secrecy regression — callout inside a DM block never reaches players

**Files:**
- Test: `src/test/content/callout-secrecy.test.ts`

`renderEntityMarkdown` runs `stripDmBlocks` before the core. Prove a callout inside `%%`/`:::dm` is gone in player render.

- [ ] **Step 1: Write the test**

```ts
// src/test/content/callout-secrecy.test.ts
import { describe, it, expect } from "vitest";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";

describe("callout secrecy", () => {
  const body = [
    "Public intro.",
    "",
    "%%",
    "> [!danger] The lich's phylactery",
    "> is in the well.",
    "%%",
    "",
    "Public outro.",
  ].join("\n");

  it("player render (showDmNotes:false) contains no callout and no secret text", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("Public intro.");
    expect(html).toContain("Public outro.");
    expect(html).not.toContain("phylactery");
    expect(html).not.toContain("data-callout");
  });

  it("DM render (showDmNotes:true) keeps the callout", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: true });
    expect(html).toContain('data-callout="danger"');
    expect(html).toContain("phylactery");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/content/callout-secrecy.test.ts`
Expected: PASS (strip runs before the core; this is the guard that it stays that way).

- [ ] **Step 3: Commit**

```bash
git add src/test/content/callout-secrecy.test.ts
git commit -m "test(markdown): callout inside DM block is stripped from player render"
```

---

### Task 1.5: Phase 1 slice gate

- [ ] **Step 1: Full gate**

Run, in order — all green (ignore the two known-failing session tests in the header):
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --run`
- `npm run atlas:publish`

- [ ] **Step 2: Browser smoke (mandatory — automated green ≠ rendered page)**

Start the managed preview. In an entity body, author:

```
> [!note] Test note
> body with **bold** and a [[wikilink]]

> [!danger]- Collapsed danger
> hidden until clicked
```

Verify in the **DM editing pane**, the **reading view**, and the **player pane**:
- the note renders as a styled callout with its title and bold/wikilink intact;
- the danger callout starts collapsed and expands on click;
- a plain `> quote` still renders as an ordinary blockquote.

Then wrap a callout in `%%…%%` and confirm it disappears from the player pane.

- [ ] **Step 3: Final commit (if smoke required tweaks, commit them; else nothing to do)**

```bash
git status   # expect clean if smoke passed with no changes
```

---

## Self-Review

**Spec coverage (Phases 0–1):**
- Parity spine / single marked owner → Tasks 0.1–0.3 ✓
- Image-embed routed through spine → carried by Task 0.2 (renderEntityMarkdown keeps EMBED_RE, now feeds the shared core) ✓
- Callouts: full type set, titles, foldable, theme-mapped → Tasks 1.2–1.3 ✓
- Sanitizer coordination → Task 1.1 ✓
- Secrecy unchanged, callout-in-DM-block stripped → Task 1.4 ✓
- Per-phase gate incl. browser smoke → Tasks 0.3, 1.5 ✓
- Relative-path image-embed fix and footnote/highlight/task-list → deferred to Phase 2/3 plans (out of this plan's stated scope) — noted, not a gap.

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `markdownToHtml` / `renderMarkdownBodyToSafeHtml` used identically across Tasks 0.1, 0.2, 0.3, 1.2; callout token shape (`calloutType`, `open`, `title`, `tokens`) consistent between tokenizer and renderer; CSS class `atlas-callout-<type>` matches the renderer's emitted class.
