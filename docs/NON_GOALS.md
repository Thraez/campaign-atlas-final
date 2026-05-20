# Non-goals

This atlas has a small, deliberate spine: Obsidian-canon markdown → build pipeline → dual-mode publish (player-safe static site + private DM editor). It is **not** a virtual tabletop, a rules database, or a multi-user authoring platform.

This document lists what we have decided **not** to build. If a feature request matches one of these, push back — the cost of saying yes here is a permanent surface-area tax on every later change.

> For the **markdown-rendering** boundary (which Obsidian-core constructs render at parity vs. which are explicit non-goals — embeds, math, mermaid, `#tag` pills, community plugins, WYSIWYG), see [docs/MARKDOWN_PARITY.md](MARKDOWN_PARITY.md).

## Hard nos

| Idea | Why we don't build it |
|---|---|
| **Combat tracker, initiative, rules content** | Out of scope. Foundry, Roll20, Owlbear Rodeo exist. We are a lore atlas, not a VTT. |
| **Multi-user real-time editing** | Massive complexity (CRDTs, presence, conflict UI) for an audience of one DM per world. Git already handles single-author workflow. |
| **Hosted DM editor with auth** | Defer until a real second user exists. The local + GitHub Pages model is solid. If we ever build it: GitHub fine-grained PAT in localStorage, save-as-PR-only, never direct-commit. |
| **Server-backed player notes** | Player notes are deliberately local-only (browser storage, optional export). No accounts, no sync, no privacy surface. |
| **AI-generated lore** | We are a tool, not a generator. The DM's voice is the product. |
| **Per-party fog / multiple view profiles** _(deferred)_ | Base fog is a per-map enforced player secret. Per-party variants would multiply state across parties, sessions, and entities — useful in ~5% of campaigns; complexity tax on 100% of users. Revisit once the base mechanic has lived through a campaign. See `docs/superpowers/specs/2026-05-19-fog-player-mechanic-design.md`. |
| **Full GIS-style multi-map alignment** | Maps link hierarchically (overview → city → dungeon), not by world coordinates. A unified spatial canvas is a bigger commitment than the world content needs. |
| **Combat-tracker-shaped player suggestion approval workflow** | Player-submitted suggestions are a separate product. Don't bolt one on. |
| **Travel-time crunch beyond route speed** | We render `MapScale` and route speed. Dragon-vs-horse-vs-weather calculators belong elsewhere. |
| **Fuzzy search (fuse.js, character-skip tolerance)** | The current substring search is "you know the name." Add fuzzy only when scale proves the current UX insufficient. |
| **Setup-under-10-minutes scaffolder** (`npx create-campaign-atlas`) | Premature. The data model needs to lock first. Once a second world ships, revisit. |
| **First-class rumor / theory / contradiction types** | Model these in prose. The `rumor` visibility state covers the common case; bolting on first-class types over-models the domain. |
| **Tablet DM mode** | Defer until session prep on iPad is actually tried. The desktop editor is the design center. |

## Soft nos (revisit later)

These are not hard nos — they're explicitly parked until evidence justifies them:

- **Privacy policy / terms of service.** Not needed for personal use; needed if the editor is ever hosted with auth.
- **Commercial / open-source license decision.** Premature to pick a model.
- **Visual regression on map rendering.** Probably overkill until the rendering pipeline changes shape.

## If you find yourself drawn to one of these

Re-read [docs/PRODUCT_SPEC.md](PRODUCT_SPEC.md) (or the README's "Core design model" section if PRODUCT_SPEC hasn't been extracted yet). The spine is: one DM, one (or a few) worlds, Obsidian as canon, GitHub Pages as the player site. Everything else is a tax.
