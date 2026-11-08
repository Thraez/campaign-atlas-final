# 0003. Schema v2: the ocean, the map tree and campaign files

Status: proposed (2026-11-08)

## Context

ADR-0002 chose to rebuild the map model. Today's source is one `world.yaml` per world
(`schemaVersion: 1`, `scripts/atlas/schemaVersion.ts`), read by `loadWorldConfig`
(`scripts/atlas/loadWorldConfig.ts`). Maps are flat; the viewer switches between them with a
`<Select>`. Fog lives in `world.yaml` (`fog:` per map, `FogOverlay` in
`src/atlas/content/schema.ts`), so there is one fog for everyone. Pins come from note frontmatter
(`atlas.placements`, 6 notes today). The build reads only `atlas.config.json`'s `defaultWorld`.

The agreed goals (`docs/GOALS.md`) need: one ocean with every world map on it, maps nested inside
maps (continent, city, dungeon), and several campaigns over the same atlas, each with its own fog
and map states. The plan's sketch is `docs/rebuild-2026-11/plan.md` section 4 (branch
`rebuild-plan-2026-11`). This ADR fixes the source file shapes. Who sees what, per campaign, and
what each campaign's output is, are ADR-0004.

## Decision

**Three kinds of source file, all `schemaVersion: 2`:**

| File | Holds |
|---|---|
| `<contentRoot>/_atlas/atlas.yaml` | `schemaVersion`, `ocean` (width, height, sea style), `worlds` (folder ids), `campaigns` (ids), `onOcean` (each top-level map's `x`, `y`, `scale`, `rotation` on the ocean) |
| `<contentRoot>/<world>/_atlas/world.yaml` | `schemaVersion`, `world` (`id`, `name`), world-level settings carried over from v1 (calendar, credits, asset credits, import folders, water), `maps:` (each with its layers, scale, zoom range, `parent`, `frame`, `enterZoom`, and its `regions`, `routes`, `pins`, `sound` nested under it), and `notes:` (per-campaign note visibility, ADR-0004) |
| `<contentRoot>/_atlas/campaigns/<id>.yaml` | `id`, `name`, `maps:` keyed by map id: `state` (`unknown`, `fogged`, `open`) and, when fogged, `reveals`, `conceals`, `featherPx` |

**The map tree.**

- A map with no `parent` is a top-level map and sits on the ocean; it must appear in `atlas.yaml`
  `onOcean` exactly once, or the build fails naming it.
- A map with a `parent` sits inside it. `frame` (`x`, `y`, `width`, `height`, `rotation`) is in the
  parent's pixel space. `enterZoom` is the parent zoom at which the viewer enters the child.
- Map ids are unique across every world (the ocean and the campaign files name maps by id alone).
  A `parent` must be a map of the same world. An unknown parent, a cycle or a duplicate id fails
  the build.
- Coordinates stay local to each map (`[x, y]`, top-left origin, `docs/CODEBASE_MAP.md`
  invariant 3). Each map keeps its own scale and zoom range.

**Items live under their map.** v2 has no top-level `regions:`, `routes:` or `fog:`. Pins move from
frontmatter into `maps[].pins` (`note`, `x`, `y`, `visibility`). In a v2 world, a note that still
carries `atlas.placements` fails the build (the v2 test world has none; the migration moves them;
after cutover Sync strips them).

**Fog leaves `world.yaml`.** Fog and map state are per campaign, in the campaign file only. A map not
listed in a campaign file is `unknown` to that campaign.

**Visibility values** on maps and items are either one value (every campaign) or a map of campaign
id to value (`{ main: player, sandbox: rumor }`). A key that is not a listed campaign fails the
build, so a typo can't silently hide an item in the real campaign. What the values mean is
ADR-0004.

**Versions.** v1 is a content root with no `atlas.yaml` whose `world.yaml` has no `schemaVersion`
or `1`. v2 is `atlas.yaml` plus world files, all `schemaVersion: 2`. Any mix (an `atlas.yaml` next to
a v1 `world.yaml`, or a v2 `world.yaml` with no `atlas.yaml`) fails the build. v1 loads into the
same in-memory model as one world, one campaign `main`, every map `open` unless its v1 fog is
enabled (then `fogged`), so today's site builds unchanged. The v1 path is deleted at retire.

**Output shape.** A v2 player `atlas.json` adds, and only adds: `ocean` (size, sea, the top-level
placements of maps that ship), and per map `parent`, `frame`, `enterZoom`. The v1 output gains
nothing.

**Where the v2 test world lives.** `content-next/`, its own content root with its own config
(`atlas.next.config.json`, read through `build-atlas.ts --config`), committed (it is made-up test
content), built by its own commands into a gitignored dir outside `public/`, never published, until
cutover.

## Options rejected

- **One file per map.** Easier merges, but the parent/child checks and the ocean placement would
  span many files; one `world.yaml` per world keeps the tree readable in one place.
- **Fog in `world.yaml`, keyed by campaign.** Puts every campaign's progress in the world file, and
  a new campaign would edit the world. Campaign files keep a campaign's state in one place.
- **A seamless canvas below the world level** (cities on the same canvas as continents). A tiling
  engine; `docs/GOALS.md` "Not now".
- **Global coordinates.** Breaks every existing coordinate and the per-map scale.

## Consequences

- `scripts/atlas/schemaVersion.ts` learns v2; `CURRENT_ATLAS_SCHEMA_VERSION` becomes 2 only for the
  v2 path, and v1 keeps loading without a migration step (the migration is a separate script,
  `atlas:migrate-v2`, run at cutover).
- The builder, the scans and Sync must loop over worlds and campaigns; `cfg.defaultWorld` and
  `worlds[0]` go (R-13, R-14; viewer phases later).
- `schemas/world.schema.json` (editor autocompletion) describes v1 only until a follow-up adds v2
  schemas.
- The tickets: R-10 (types), R-12 (loader), R-13 (build), R-16 (test world), R-20 (migration).

## Open for Isak

1. **Should a top-level map that is missing from `onOcean` fail the build, or just not show on
   the ocean?** Recommended: fail. The new editor's Add map always places a map, and a silent
   missing map is harder to find than an error.
2. **Can a child map sit in a map of another world** (a portal city drawn on two worlds)?
   Recommended: no for now; parent must be in the same world. Cross-world links can be pins that
   link to a map later.
3. **Where do v2 source map images live?** Today layers point at `public/atlas/assets/maps/`, and
   everything in `public/` is copied into every site build. Recommended: `content/<world>/_atlas/images/`
   (as `ux-flows.md` says), outside `public/`, so only a campaign's build copies (and fogs) what
   that campaign may see. Applies to `content-next/` from the start; real content moves at cutover.
4. **A campaign file present but not listed in `atlas.yaml`, or listed with no file.**
   Recommended: both fail the build, naming the file.
