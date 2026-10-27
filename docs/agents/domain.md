# Domain docs

How the skills use the atlas's domain docs. Single context: one `GLOSSARY.md` and one `docs/adr/` at the root.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root: the atlas's words (visibility, player build, fog, sync...).
- **`docs/adr/`**: the ADRs that touch the area you're about to work in.
- **`docs/PRODUCT_SPEC.md`** for what the atlas is for, **`docs/VISIBILITY_AND_PLAYER_SAFETY.md`** before touching anything that decides what ships to players, and **`docs/CODEBASE_MAP.md`** for where code lives.

## Where decisions go

- **ADR** (`docs/adr/NNNN-slug.md`) only when all three hold: hard to undo, surprising without context, a real trade-off. Format in the `domain-modeling` skill.
- **Everything smaller** goes in the ticket or spec that made it. `docs/decisions.md` is closed: it keeps its old entries and takes no new ones.
- When a decision changes, update the ADR's status (`superseded by ADR-NNNN`) instead of deleting it.

## Use the glossary's words

When your output names an atlas concept (a ticket title, a test name, UI text), use the term as `GLOSSARY.md` defines it. Don't drift to synonyms it lists under _Avoid_.

If the concept you need isn't in the glossary, either you're inventing language the atlas doesn't use (reconsider) or there's a real gap (add it through `domain-modeling`).

## Flag ADR conflicts

If your output contradicts an ADR, say so explicitly instead of silently overriding it:

> _Contradicts ADR-0001 (player safety is a build gate), but worth reopening because…_
