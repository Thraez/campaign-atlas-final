# Continuous-development roadmap — policy

**Created:** 2026-05-29
**Last updated:** 2026-08-06
**Read by:** the hourly self-developing routine (see `continuous-dev-routine.md`)
**Purpose:** tell the routine *what kind of thing* it may build, and — the part that actually matters —
*what it must never build on its own.*

This file is **policy**. It does not hold work. The poppable, ordered units live in
`continuous-dev-queue.md`; the design-gated reserve lives in `continuous-dev-nice-to-haves.md`; unblessed
candidates sit in `continuous-dev-deferred-pool.md` (**not poppable**); finished work is archived in
`continuous-dev-done.md`.

The routine builds a WANT if one is available. If none remains, it may build a NICE-TO-HAVE *only if that
item clearly passes the design check*. If it ever finds itself wanting to do something on the HAND-BACK or
NEVER lists, it **stops and writes a note for the human** instead of building.

The guiding rule: **doing nothing this hour and waiting for a human is always safer than inventing
mediocre work.** When unsure, stop.

Every change must pass the full gate before it is committed (see the routine doc for exact commands):
TypeScript clean · ESLint clean · all tests green · atlas safety scans green.

---

## Where the work actually comes from

| File | Role | Poppable? |
|---|---|---|
| `continuous-dev-queue.md` | Sequenced WANTS the routine works top-to-bottom | **Yes** |
| `continuous-dev-nice-to-haves.md` | Design-gated reserve, opened only at the REFUEL POINT | Yes, if it passes the design check |
| `continuous-dev-deferred-pool.md` | Unblessed candidates awaiting DM promotion | **No** |
| `continuous-dev-done.md` | Append-only archive | n/a |

**Two checks before building any unit, no exceptions** (they are also step 2 of the queue's own
instructions): confirm it isn't **already built** (grep the done-archive for its distinguishing nouns),
and confirm its **premise is still true** (open the file/line it cites). Every backlog entry is a snapshot
of the day it was written, not a current fact. A 2026-08-05 hand-back proposed six candidates and three of
them had already shipped — that is the failure mode these checks exist to stop.

---

## Status of the original WANTS (all shipped)

The three founding WANTS are **done** and are kept here only so the history reads straight:

- **A. Speed up publishing** — the ten build-time scans now run as one parallel pass. The old
  "40% faster / under 20s" target was dead on arrival (the build dominates); the realistic scan-phase win
  is what shipped. Guarded by `npm run atlas:publish:integrity-smoke`, which must stay green forever.
- **B. Verify the Obsidian import folder-mapping** — the four unverified gaps were closed. This was the
  precondition for the later vault work (queue section V, shipped 2026-08-05).
- **C. Richer markdown rendering** — highlights (`==text==`), footnotes and task-lists shipped. Further
  renderer scope is bounded by `docs/MARKDOWN_PARITY.md` and `docs/KNOWN_LIMITATIONS.md`.

The nice-to-have reserve named at creation time (phrase search, pin de-cluttering, asset credits, import
report polish, coverage/hygiene nibbles) has **also fully shipped** — `continuous-dev-nice-to-haves.md`
runs N1–N141 with nothing open. Phrase search lives in `src/atlas/search/parseSearchQuery.ts`.

**"Coverage + hygiene nibbles" is no longer a safe infinite filler.** It was the always-available fallback
for ~200 runs and it is now mined out; reaching for it today produces make-work. If the queue is empty,
the correct move is to stop and hand back, not to invent a nibble.

---

## 🛑 HAND BACK — the routine must NOT build these; stop and queue them for the human

Hitting one of these is a **stop-and-report** event, not a build event. These need design judgment the
routine must not fake. **This list is unchanged and still binding.**

- **DM-editor re-sequencing (Parts 2–4)** — needs a human strategy call; the panel structure shifted under
  the old plans. Source: `docs/superpowers/specs/2026-05-28-editor-roadmap-restrategy-brief.md`.
- **Vault-as-source** — a genuine architecture fork, with real risk to the DM's own files. Note that the
  *bounded* slices of this (change detection, image embeds, folder-scoped browsing) shipped as queue
  section V in Aug 2026 — that does **not** unlock the broader fork, which remains human-only. Source:
  `docs/superpowers/specs/2026-05-28-vault-as-source-strategy-brief.md`.
- **Map tiling / per-map chunking** — performance architecture, multi-session, design-heavy.
- **Relationship graph view** — a whole new surface; design first.
- **Published progressive-fog player mechanic** — already deferred; needs its own brainstorm → spec → plan.

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

## Where the loop stands

Roughly 250 units have shipped since 2026-05-29. The founding WANTS, the 100-unit Q backlog, the vault
refuel (V1–V15) and the entire nice-to-have reserve are all closed out.

**The honest constraint now:** the backlog has been fed almost entirely by *reading the code* — agents
finding things that look improvable — and barely at all by *using the app*. The last human dogfooding pass
was 2026-05-30. That is why the reserve drained into micro-polish and then ran dry. The highest-value
refuel is no longer another ideation sweep; it is the DM walking the player viewer and the DM editor and
saying what got in the way.

The human stays the source of **direction**; the routine stays the source of **execution**.
