# docs/

Focused docs for the campaign atlas. The root [README.md](../README.md) is the long design reference; this folder slices it into reader-friendly pieces.

## Start here

- [QUICK_START.md](QUICK_START.md) — clone, install, see the seed world, publish to GitHub Pages. ~10 minutes.

## Concept

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — what the atlas is, who it's for, what makes it different.
- [NON_GOALS.md](NON_GOALS.md) — explicit "won't build" list. Read before requesting a feature.

## Authoring and shipping

- [WORKFLOWS.md](WORKFLOWS.md) — session-prep cycle, Creator Cockpit, save plugin, rollback flow, cache invalidation.
- [VISIBILITY_AND_PLAYER_SAFETY.md](VISIBILITY_AND_PLAYER_SAFETY.md) — visibility states, `%%` blocks, `:::dm` callouts, the three safety scanners, rumor semantics.
- [IMPORT_EXPORT.md](IMPORT_EXPORT.md) — Obsidian vault import, import-batch tracking, handouts, backups.

## Reference

- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) — Obsidian feature support matrix, mobile/editor constraints, what's planned vs not.
- [../CLAUDE.md](../CLAUDE.md) — hard rules for repo agents (humans should read too).
- [../README.md](../README.md) — original long-form design doc. Source of truth for architecture details not yet pulled into focused docs.

## Conventions

- Docs are written in plain English. No emoji unless adding semantic value.
- Cross-link rather than duplicate. If a topic appears in two docs, one is canonical and the others link to it.
- Code blocks use the project's actual syntax (YAML for `world.yaml`, markdown for canon, JSON for config).
- Forward-references (e.g. mentioning a planned feature) say "planned" or "not yet" so readers know what's shipped.
