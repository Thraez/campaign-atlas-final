# Atlas roadmap — where we're taking this next

**Created:** 2026-06-15 · **Status:** approved direction (human brainstorm session) · **Owner:** the DM
**Companion artifacts:** seven build-ready specs and three design-session briefs under
`docs/superpowers/specs/2026-06-15-*`; the build queue refuel in `docs/automation/continuous-dev-queue.md`
(section **I** + nice-to-haves **N3 / N25 / N26**).

This is the master plan that turns the ranked wishlist in `docs/DEVELOPMENT_WANTS.md` into a *sequenced*
roadmap with a north star, three committed goals, and a clear split between what the build-robot runs on its
own and what needs you in the room.

---

## North star

> **A world that's effortless for me to build — moving freely between Obsidian and the atlas editor — and
> rock-solid and rich for my players to explore.**

Everything below serves that sentence. When a choice is unclear, the tie-breaker is: *does it make building
smoother, sharing safer, or exploring richer — in that order?*

## The three goals, in priority order

1. **Effortless for me to build.** Creating a world by hand in the editor and pulling notes in from Obsidian
   should both feel native, with neither tool fighting the other.
2. **Rock-solid for players.** The published site never breaks, never leaks a DM secret, and you can trust
   exactly what your players will and won't see.
3. **A richer world players enjoy.** Connections, a relationship web, fog that reveals as the campaign
   advances, a distance ruler — depth that pays off at the table.

"Make this usable by *other* DMs" is explicitly **out of scope** for this roadmap. We are building *your*
tool, deeply.

---

## Reality check — most of the cheap wins are already shipped

The hourly build-robot has been busy. As of **v0.3.0** (`ec9e6f30`, 2026-06-15) these are **done** and should
*not* be re-planned:

- **Foundation / "nothing embarrassing":** the Event-selection white-screen crash + an app-wide error
  boundary; proper-case names ("Corven", not "corven"); original-case search snippets; the CSS build warning;
  accessible names on icon-only controls. *(D-series, E1 — v0.1.0)*
- **Most of "effortless to build":** the editor auto-builds its data on first run (no terminal, no scary
  banner); imported notes get categorized instead of vanishing into a `lore` bucket; the import
  folder-mapping bugs are fixed; a clear post-import report. *(E3, E4, F1, B — v0.1.0/v0.2.0)*
- **Most of "rock-solid for players":** an honest "preview as players see it" view; phrase search; pin-label
  de-cluttering on crowded maps; richer markdown (highlights, footnotes, task-lists); *flagging* of dropped
  image embeds and broken links in Publish Check. *(G1, E5, F3, C, E2, E6 — through v0.3.0)*
- **Look & feel:** the animated "living water" ocean with per-map DM controls. *(H1, H2 — v0.3.0)*
- Plus 20 test-coverage/hardening nibbles (N5–N24).

What that leaves is a **smaller, sharper** backlog than the wishlist implied — and notably, the lead goal
(seamless Obsidian round-trip) is the part that's barely started, because it's the hard part.

---

## The plan, in three phases

### Phase 1 — the certain wins (robot-runnable now)

Bounded, clearly-right, no design call needed. Queued as **section I**; the robot builds **I1 → I4** in order.

| # | What it does for you | Goal | Spec |
|---|----------------------|------|------|
| **I1** | Shows each entity's **Connections** in the reading pane (the data exists, it was just never displayed) — honoring per-link player/DM visibility | Richer world | `2026-06-15-connections-on-entity-page-design.md` |
| **I2** | A **distance ruler** — click two points on a map, get the distance in world units | Richer world | `2026-06-15-map-distance-ruler-design.md` |
| **I3** | **Shareable links** that land on the exact spot a player was looking at, with working Back | Rock-solid | `2026-06-15-deep-link-pan-open-design.md` |
| **I4** | Fixes the **README** so its editor description matches the real editor | Housekeeping | `2026-06-15-docs-readme-editor-rail-design.md` |

I1 is the standout: high payoff, low effort, and it's the natural foundation for the relationship graph later.

### Phase 2 — design-gated nice-to-haves (robot builds after a design-check)

These change what players *see*, so each gets a design-check before the robot touches it. Parked as
nice-to-haves **N3 / N25 / N26**.

- **N25 — render inline portraits** (`![[Portrait.png]]`). Today they silently vanish; this makes them show.
  *Touches the build pipeline, with a guard to hand back if it grows into an asset-import project.*
- **N26 — show planned/broken links** as a visible "planned link" style, so your half-written threads are
  visible instead of looking like plain text. *(The player-facing styling must never reveal the link's
  target — a hard secrecy rule the spec enforces.)*
- **N3 — asset credits.** A `credit` field on images plus an auto-generated credits page. **Needs your
  explicit sign-off** before building (it adds a permanent new page + schema field).

### Phase 3 — the big bets (your design sessions, never auto-built)

These are real architecture or new-surface decisions. The robot **must not** build them; each gets a human
brainstorm → spec → plan. I've written a **brief** for the three highest-value ones so a future session starts
from a grounded position, sequenced by your priority stack:

1. **Obsidian read-only merge** — *the heart of goal #1.* A re-runnable import that merges updated Obsidian
   prose into existing atlas entities while **provably preserving** your atlas-side work (pins, placements,
   visibility, relationships) and **never writing back to your vault.** This is the safe slice of
   "vault-as-source." → `2026-06-15-obsidian-readonly-merge-brief.md`
2. **One-click Publish** — *goal #1, sharing half.* A single Publish button in the editor that builds, runs
   the safety scans, pushes, and says "your players can see it now." → `2026-06-15-one-click-publish-brief.md`
3. **Relationship graph** — *goal #3.* A visual web of who-connects-to-whom, built on top of I1. →
   `2026-06-15-relationship-graph-brief.md`

Already-written briefs on disk that round out the long horizon (pick up when you're ready — not rewritten
here): **progressive fog** for players (`2026-05-19-fog-player-mechanic-design.md`), the **deeper editor
overhaul** parts 2–4 (`2026-05-28-editor-roadmap-restrategy-brief.md`), and **map tiling** for very large maps
(deferred performance bet).

---

## The one safety decision that shapes goal #1

For "both tools first-class," the atlas **reads** your Obsidian vault but **never writes to it.** Two-way sync
was rejected: a bug that corrupts a feature is annoying; a bug that corrupts your real campaign notes is
unacceptable. The "bounce between them" feel is preserved a different way —

- **Prose and lore live in Obsidian** (where you write).
- **Map structure lives in the atlas** (pins, fog, regions, routes, relationships, visibility) — none of which
  exists in Obsidian.

They don't overlap, so they don't fight. A smart, re-runnable *merge* import gives you the round-trip without
the risk. If you ever genuinely need to push one note back, that becomes a deliberate, you-click-it,
you-review-it action — never automatic. This decision is baked into the Obsidian-merge brief above.

---

## How the work actually gets done

- **The robot** (hourly `continuous-dev` routine) executes the certain WANTs (I1–I4) and, after a design-check,
  the nice-to-haves (N25, N26 — and N3 once you bless it). It builds one bounded unit per run, passes the full
  gate (types, lint, tests, atlas safety scans), and hands back when the certain work runs dry.
- **You** stay the source of *direction*. The big bets (Phase 3) are yours to start when you want them; each
  begins with a brainstorm session against its brief.

The division is deliberate: the robot never invents direction, and it never touches anything that could risk
your files or leak DM content without a human in the loop.

---

## Done criteria for this roadmap pass

- [x] Seven build-ready specs + three big-bet briefs written and code-grounded (2026-06-15).
- [x] Queue refueled: section **I** (I1–I4) above the refuel point; **N3/N25/N26** parked as design-gated;
      stale nice-to-haves (N1/N2/N4) marked superseded.
- [ ] Refuel landed on the robot's branch (`auto/continuous-dev`) with the conflict-lock protocol — *see the
      integration note when ready to ship.*
- [ ] `docs/DEVELOPMENT_WANTS.md` reconciled against shipped reality.

---

## Pointers

- **Wishlist (source of ideas):** `docs/DEVELOPMENT_WANTS.md`
- **Operational queue (what the robot pops):** `docs/automation/continuous-dev-queue.md`
- **Policy / guardrails:** `docs/automation/continuous-dev-roadmap.md`
- **Non-goals:** `docs/NON_GOALS.md`
- **All Phase-1/2 specs and Phase-3 briefs:** `docs/superpowers/specs/2026-06-15-*`
