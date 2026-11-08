# R-10 Schema v2 types

Status: ready-for-agent
Blocked by: R-04 (done); ADR answers (done 2026-11-08: Isak accepted every recommendation)
Size: S
Branch: `rebuild-r10-schema-v2-types`

The rebuild's first code ticket. Write the TypeScript types for schema v2 (ADR-0003): the ocean
(`atlas.yaml`), the map tree (`parent`, `frame`, `enterZoom`), campaign files, per-campaign
visibility values and the `notes:` block. Types and pure validators only; nothing reads them yet.
Every later phase 2 ticket (resolver, loader, build, test world) builds on these.

Status is `ready-for-human` only until Isak answers the ADRs' open questions (notably question 5
in ADR-0004, which adds a `notes: vault | hidden` field to the campaign type). After that it is ready for an
agent; set the ADRs to `accepted` with his answers in the same PR.

## Acceptance criteria

- A new module (suggested `src/atlas/content/schemaV2.ts`, in `src/` so `scripts/` can import it, as
  `visibility.ts` does) exports types for:
  - `AtlasFileV2`: `schemaVersion: 2`, `ocean` (`width`, `height`, `sea`), `worlds: string[]`,
    `campaigns: string[]`, `onOcean: { map, x, y, scale, rotation }[]`;
  - `WorldFileV2`: `schemaVersion: 2`, `world: { id, name }`, the v1 world-level settings carried
    over (calendar, credits, asset credits, import folders, water; reuse the existing types in
    `src/atlas/content/schema.ts`), `maps: MapV2[]`, `notes?: Record<noteId, NoteOverride>`;
  - `MapV2`: `id`, `visibility`, `layers`, `scale`, `zoom`, optional `parent`, `frame`
    (`x`, `y`, `width`, `height`, `rotation`), `enterZoom`, and nested `regions`, `routes`, `pins`
    (`note`, `x`, `y`, `visibility`), `sound`;
  - `CampaignFileV2`: `id`, `name`, `maps: Record<mapId, { state: "unknown" | "fogged" | "open",
    reveals?, conceals?, featherPx? }>`, plus whatever ADR-0004 question 5 settles (recommended
    `notes: "vault" | "hidden"`, optional in the file and read as `hidden` when missing: the
    validator returns `hidden` for a missing field, never `vault`; a test pins it);
  - `VisibilityValue = EntityVisibility | Record<campaignId, EntityVisibility>`;
  - `NoteOverride`: `visibility: VisibilityValue`, `basedOn: EntityVisibility`, `belongsTo?: string[]`.
- Pure shape validators (no file IO) for the three files that return typed values or a list of
  errors naming the path (`maps[2].frame.width`). Unit tests cover: a valid sample of each file
  (plan.md section 4's sketch, adapted), a missing required field, a wrong `state`, a per-campaign
  visibility value with a non-string, and a `frame` with a negative size.
- Visibility values are kept as written (an invalid one is not rejected here: the resolver,
  R-11a, turns it into `dm`). Validators do reject structural errors (wrong types, missing ids).
- ADR-0003 and ADR-0004 set to `accepted (date)` with Isak's answers folded into their text.
- `GLOSSARY.md` gains: ocean, map tree, frame, campaign, campaign file, map state, `notes:` block.
- `npm run typecheck:all` and `npm run lint` pass; no existing test changes.

## Touches

- New `src/atlas/content/schemaV2.ts` (+ test), `docs/adr/0003-*.md`, `docs/adr/0004-*.md`,
  `GLOSSARY.md`.

## Out of scope

- Cross-file rules (unknown parent, cycles, `onOcean` coverage, campaign keys that aren't listed,
  v1/v2 mix): R-12.
- What a visibility value means for a campaign: R-11a.
- JSON schemas for editor autocompletion (`schemas/world.schema.json` stays v1).
- Any change to `src/atlas/content/schema.ts`'s v1 types or to the atlas.json output types (R-13).

No adversarial player-safety review needed (types only, nothing ships differently).
