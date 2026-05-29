# Continuous-development roadmap — first ~30 runs

**Created:** 2026-05-29
**Read by:** the hourly self-developing routine (see `continuous-dev-routine.md`)
**Purpose:** tell the routine *what* to build, in priority order, and — just as important — *what it must never build on its own.*

The routine works this list **top to bottom**. It builds a WANT if one is available. If no WANT
remains, it may build a NICE-TO-HAVE *only if that item clearly passes the design check*. If it ever
finds itself wanting to do something on the HAND-BACK or NEVER lists, it **stops and writes a note for
the human** instead of building.

The guiding rule: **doing nothing this hour and waiting for a human is always safer than inventing
mediocre work.** When unsure, stop.

Every change must pass the full gate before it is committed (see the routine doc for exact commands):
TypeScript clean · ESLint clean · all tests green · atlas safety scans green.

---

## ✅ WANTS — certain, design-aligned, build with confidence

Build these first, in order. Each is inside the app's deliberate scope and already blessed.

> The sequenced, bite-sized breakdown of these (A1/A2, B1/B2, C1–C3) lives in
> `continuous-dev-queue.md` — that's what the routine actually pops from. This section is the priority
> *policy*; the queue is the operational backlog.

### A. Speed up publishing
- **What:** collapse the ten separate build-time scans into one parallel pass (~18s → ~13s).
- **Why certain:** already specced; guarded by the integrity-smoke harness already on `main`.
- **Source:** `docs/superpowers/specs/2026-05-28-atlas-publish-speedup.md`, `docs/superpowers/plans/2026-05-28-atlas-publish-speedup.md`.
- **Hard gate add-on:** `npm run atlas:publish:integrity-smoke` must stay green throughout.
- **Note:** the old "40% faster / under 20s" target is **dead** — the build dominates and is out of scope.
  Realistic win is the scan phase only (~6.5s → ~1s). Do not chase the old number.
- **Rough size:** 2–3 runs.

### B. Verify the Obsidian import folder-mapping
- **What:** confirm the four unverified gaps in how imported vault folders map to atlas categories.
- **Why certain:** bounded, blessed, and a precondition for any future vault work.
- **Source:** `docs/superpowers/plans/2026-05-16-import-folder-mapping.md`.
- **Rough size:** 1–2 runs.

### C. Richer markdown rendering (next slice)
- **What:** add highlights (`==text==`), footnotes, and task-lists to the renderer.
- **Why certain:** improves fidelity to the DM's own Obsidian notes; mechanical `marked` extensions with
  existing secrecy regression coverage.
- **Source:** `docs/superpowers/specs/2026-05-18-obsidian-markdown-parity-design.md` (Phases 0+1 shipped; this is the next phase).
- **Guardrail:** write a tight spec slice first. **If that spec balloons past a small mechanical change, stop and hand back.**
- **Rough size:** 3–4 runs.

---

## 🟡 NICE-TO-HAVES — build only when no WANT remains

Smaller, bounded, inside scope. The design check must pass *cleanly* before the routine touches one.
When genuinely unsure which to pick, prefer the **hygiene/coverage nibble** — it is the safest filler.

- **Phrase search** (`"exact phrase"`) in the player search. Sanctioned future enhancement in the docs;
  distinct from fuzzy search (which is on the NEVER list).
- **Pin de-cluttering at high pin counts** — use the existing `pin.priority` field to thin labels when a
  map is crowded. Player-facing readability.
- **Asset credits** — a `licenses:` frontmatter field plus an auto-generated credits page.
- **Import report polish** — a clearer "here's what came in / what was skipped" summary after an import.
- **Coverage + hygiene nibbles** — small, safe test-coverage additions and dead-code removal in
  weakly-covered modules. *This is the always-available safe filler.*

---

## 🛑 HAND BACK — the routine must NOT build these; stop and queue them for the human

Hitting one of these is a **stop-and-report** event, not a build event. These need design judgment the
routine must not fake.

- **DM-editor re-sequencing (Parts 2–4)** — needs a human strategy call; the panel structure shifted under
  the old plans. Source: `docs/superpowers/specs/2026-05-28-editor-roadmap-restrategy-brief.md`.
- **Vault-as-source** — a genuine architecture fork (4+ shapes, real risk to the DM's own files). Highest
  upside *and* highest risk. Never autonomous. Source: `docs/superpowers/specs/2026-05-28-vault-as-source-strategy-brief.md`.
- **Map tiling / per-map chunking** — performance architecture, multi-session, design-heavy.
- **Relationship graph view** — a whole new surface; design first.
- **Published progressive-fog player mechanic** — already deferred; its own brainstorm → spec → plan.

---

## ⛔ NEVER — hard refuse (the app's stated non-goals)

If the routine ever ideates one of these, it refuses and records why. See `docs/NON_GOALS.md`.

- Combat tracker, initiative, or rules content
- AI-generated lore
- Multi-user / real-time collaboration / hosted auth
- Theme toggle (light/parchment)
- Mobile or touch editor (the editor is desktop-only by design)
- Per-party fog variants
- Fuzzy search (until scale proves the current search insufficient)

---

## Realistic shape of the first 30 runs

WANTS **A, B, C** are the real wins and land early (~6–9 runs). The middle fills with bounded
nice-to-haves. As the certain work runs dry, runs should increasingly end with *"nothing certain left —
here are the candidates I think you should bless next,"* handed back via the routine's handover.

The human stays the source of **direction**; the routine stays the source of **execution**.
