# Product spec

What the atlas is, who it's for, and what makes it different.

## One-sentence pitch

A static, GitHub-Pages-hosted interactive atlas for D&D worlds, with Obsidian markdown as canon, dual-mode publish (player-safe public site + private DM editor), and aggressive build-time spoiler protection.

## The user

**One DM**, per world. Comfortable with markdown, comfortable with git, has an Obsidian vault or is willing to write canon in plain text. Wants:

- A map their players can browse without seeing DM-only content.
- A search-and-wiki experience for the lore they've written.
- A "5-minute session prep" loop: edit canon, drag a pin, push, done.
- Confidence that secrets do not leak — *ever*.

The atlas is **not** for:

- VTT users running combat (use Foundry, Roll20, Owlbear Rodeo).
- Players authoring shared canon (single-author tool).
- Worlds where the DM doesn't want a public web presence.

## The spine

```text
Obsidian markdown + world.yaml          ← canon
   │
   ▼
   npm run atlas:build:player --strict  ← build pipeline
   │
   ▼
   atlas.json + search-index.json       ← generated artifact
   │
   ▼
   GitHub Pages (static)                ← player viewer
```

Two modes:

- **Player build** — published. Strips `dm`/`hidden` entities, `profile.dm`, DM relationships, `%%` blocks, `:::dm` callouts. Cross-reference leak detection. Three safety scanners gate publish.
- **DM build** — local only. Writes to `.local-atlas/` (gitignored by default). Includes everything.

## What makes this different from other DM tools

| Atlas | World Anvil | Obsidian-only | Foundry |
|---|---|---|---|
| Static public site, no auth | Hosted with paid tiers | Private vault only | Hosted, focused on session play |
| Markdown is canon | Proprietary editor | Markdown is canon | Built-in editor / JSON state |
| One-way publish (DM-edit, player-read) | Read/comment by tier | Local-only | Multi-user real-time |
| Aggressive build-time spoiler scan | Visibility tags, manual review | None (private) | Player permission system |
| Free, open-source, self-hosted | Subscription | Free, local | Subscription / one-time license |

This atlas is the niche where:

- You already write canon in markdown.
- You want players to have a wiki + map without giving them edit rights or a login.
- You want spoiler safety as a hard property, not a habit.
- You're willing to do session prep at a keyboard, not a tablet.

## The four design promises

1. **Obsidian-markdown canon, always.** The tool reads `.md` and `.yaml`. It never writes a binary format you can't open in another tool. `content/` is a valid Obsidian vault on its own.
2. **Strict player-safe publish.** Multiple independent checks before any deploy. Hard exit codes for each failure mode. The publish chain is the spine.
3. **Local-first DM editor.** The Creator Cockpit at `/atlas/edit` runs in `npm run dev`. It is physically removed from production builds. No accounts, no hosted editor.
4. **Generated artifacts are derived.** `atlas.json` is never canon. A pre-tool hook prevents AI agents from hand-editing it. Humans should respect the same rule.

## How features get prioritized

See [NON_GOALS.md](NON_GOALS.md) for the explicit "won't build" list. In short:

- Features that protect the spine (safety, build determinism, schema robustness) are prioritized.
- Features that improve the DM's 5-minute prep loop are prioritized.
- Features that improve the player's "browse and discover" experience are prioritized.
- Features that add multi-user / hosted / VTT scope are rejected.

When in doubt, re-read this doc and ask: does this feature serve **one DM running one world**? If yes, it's on the table. If no, push back.

## What to read next

- [QUICK_START.md](QUICK_START.md) — get running in 10 minutes.
- [VISIBILITY_AND_PLAYER_SAFETY.md](VISIBILITY_AND_PLAYER_SAFETY.md) — the safety model in detail.
- [WORKFLOWS.md](WORKFLOWS.md) — how a DM uses this day-to-day.
- [IMPORT_EXPORT.md](IMPORT_EXPORT.md) — bringing an Obsidian vault in, taking content out.
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) — what we don't do (yet or by design).
- [NON_GOALS.md](NON_GOALS.md) — what we have decided not to build.
- [../README.md](../README.md) — the long design / reference document.
- [../CLAUDE.md](../CLAUDE.md) — hard rules for working in this repo.
