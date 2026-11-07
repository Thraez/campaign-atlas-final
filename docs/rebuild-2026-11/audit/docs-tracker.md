# Audit facts: docs and tracker (2026-11-07)

Sources: `main` (983b5d0) docs; `docs-2026-11-07-improve-loop` branch (State.md, arch-2026-11 tickets);
PR branches for eval-46..50 ticket text; `gh pr list`. Facts only. Paths are relative to the repo.
Note: main's `State.md` is stale (says "nothing is pushed, no PR open", main = 2f4e7e6); the docs
branch version is current (main = 983b5d0, PRs #92-#98 merged and published). I ran `git fetch origin`
on the six PR branches to read them (remote refs only; no working-tree change).

## 1. Ticket census

Tickets by folder on `main` (68), then the ones that exist only on branches.

| Folder | Total | done | wontfix | ready-for-human | ready-for-agent |
| --- | --- | --- | --- | --- | --- |
| audit-2026-10 | 8 | 7 | 0 | 1 | 0 |
| code-retro | 9 | 7 | 2 | 0 | 0 |
| eval-2026-10 (01-45) | 45 | 40 | 0 | 1 | 4 |
| tidemarrow | 3 | 0 | 0 | 0 | 3 |
| agent-retro | 3 | 2 | 0 | 1 | 0 |
| **Total on main** | **68** | **56** | **2** | **3** | **7** |

Branch-only: eval-2026-10/46-50 (5 tickets, status `done` on their PR branches, unmerged) and
arch-2026-11/01-09 (docs branch only: 3 `in-review`, 6 `ready-for-agent`). Tracker README says
tickets use states ready-for-agent / ready-for-human / in-review / done / wontfix. Size is given
only in arch-2026-11 (S, S-M, M); other tickets give none.

### Open / not-done tickets

| Id | Title | State | Area | Size |
| --- | --- | --- | --- | --- |
| audit/05 | Rename the world once its new name settles | ready-for-human | docs/pipeline | - |
| eval/07 | Vite 8 with Vitest 5 | ready-for-human (after Tidemarrow) | dependencies | - |
| agent-retro/03 | No scheduled CI | ready-for-human | CI | - |
| eval/27 | One reduce-motion switch | ready-for-agent on main; built in #104 | viewer | - |
| eval/39 | One client for reading and saving canon | ready-for-agent | editor/sync | - |
| eval/44 | Soundscape draft per map | ready-for-agent on main; built in #107 | editor | - |
| eval/45 | Deleted pins on other maps count as unsaved | ready-for-agent on main; built in #99 | editor | - |
| tidemarrow/01 | First sync of the four vault folders | ready-for-agent | sync | - |
| tidemarrow/02 | Tidemarrow map with the vault's 16 pins | ready-for-agent (blocked by 01) | pipeline/viewer | - |
| tidemarrow/03 | Remove the Astrath sample content | ready-for-agent (blocked by 02) | pipeline | - |
| eval/46 | One spoiler-leak rule for regions and routes | done on branch, #100 | safety | - |
| eval/47 | Discard all leaves world settings and calendar unsaved | done on branch, #103 | editor | - |
| eval/48 | Map Import Wizard zip strips map metadata | done on branch, #102 | editor/safety | - |
| eval/49 | Ruler and route/fog drawing take the same click | done on branch, #105 | editor | - |
| eval/50 | Publish Check wikilink and relationship leak rules match build | done on branch, #106 | safety | - |
| arch/01 | Publish scans find the real atlas.json and fog layers | in-review, #109 | safety | S-M |
| arch/02 | Sound-only areas inside fog ship to players | ready-for-agent | safety | S-M |
| arch/03 | Editor player lens and build agree on fog | ready-for-agent | editor/pipeline | M |
| arch/04 | Delete dead EntityReadingView | in-review, #108 | viewer/editor | S |
| arch/05 | "Recently revealed" works on the live site | ready-for-agent | viewer/publish | M |
| arch/06 | Delete redundant audio prune plugin | ready-for-agent | pipeline | S |
| arch/07 | world.yaml visibility typo fails closed | in-review, #110 | safety | S |
| arch/08 | One secret-note rule; body redaction from tokens | ready-for-agent | safety | S |
| arch/09 | check-player-files fails a site with no atlas.json | ready-for-agent | safety | S |

Wontfix (parked by Isak 2026-10-27): code-retro/05 map-space module (coordinate flip),
code-retro/09 editor draft registry.

## 2. Recurring problem themes (evidence by ticket id)

**A. Editor state is held per page or per slot, but the data is per map or per world.** Biggest
cluster; the same shape returned six times.
- eval/30: save wrote only the active map's drafts but cleared every map's; undo after a map switch
  applied map A's edit to map B; duplicated pins stayed "unsaved". Three "unsaved" signals disagreed
  (`hasUnsavedChanges`, `perMapDirtyCount`, `worldYamlDirty`).
- eval/44: soundscape draft is one slot, edits land on the wrong map. eval/45: deleted pins on other
  maps not counted or saved. eval/47: world settings and calendar drafts never registered with the
  session, so "Discard all" left "1 unsaved change". eval/31: Save chip said "No changes to save"
  with an entity edit pending. eval/49: ruler and drawing both take the same click.
- code-retro/09 (wontfix): "every draft is wired by hand into four lists; missing one gives a silent
  'All changes saved' (fixed three times already)". Soundscape edits persist only while the tab is
  mounted. `AtlasPlacementEditor.tsx` is 110 KB (AGENTS.md "search, don't read whole").

**B. A save that did not happen reads as a save / stale hashes.**
- eval/33: a rolled-back write answers HTTP 207, passes `res.ok`, drafts cleared with nothing written.
- eval/17, 32, 36: after a 409 the stale `baseHash` is never refreshed, every later save fails
  (entity panel, world.yaml, character keys: "the ticket 32 class").
- eval/42: failed entity save lost the form. eval/08: any editor Save dropped `world.yaml` keys the
  editor did not model (the `import:` block). code-retro/03: sync map not saved on failed rebuild.
- eval/39 (open): one canon client with typed outcomes proposed as the structural fix.

**C. The same safety/visibility rule re-implemented in several places that disagree.**
- audit/01: build published a note with no visibility as `player` while docs and Sync said `dm`
  (Corven, Edric, Soreth were live). code-retro/06: five places computed id/title/type/visibility.
- eval/46: four places judge a region/route leak and disagree (`rumor` region to DM entity passed
  Publish Check, failed publish). eval/50: Publish Check wikilink/relationship rules differ from the
  build (could show "No DM-content leakage detected" for an atlas whose publish fails).
- arch/07 (world.yaml loader turned an invalid visibility into `player`), arch/08 (secret-note rule
  copied), arch/03 (editor lens ignores `conceals`, keeps character-locked pins the build drops).

**D. Leaks through world.yaml, assets and non-note artifacts (not markdown notes).**
- eval/40: `public/atlas/assets/maps/world.yaml` (with `fog: reveals:` polygons) shipped to players;
  the build pruned only images. eval/34: image pruning matched file names, so DM `elf.png` shipped
  when `shelf.png` was referenced; the privacy scan used the same rule. eval/05: vault image copy
  escaped its folder. eval/43: service worker precached unshipped files.
- arch/02: sound-only areas inside fog ship to players (`filterSoundscape.ts` ignores fog; areas with
  no visibility ship). arch/01: fog scan and image-twin check look in the wrong path in `dist`, so
  they "skip" and pass. eval/41: build reads character keys from a different path than the editor
  writes (fails safe, secrets never ship). eval/48: wizard zip wrote raw JPG bytes with GPS EXIF.
- agent-retro/spec: the third (adversarial safety) review found four leaks live on `main` that the
  Standards and Spec reviews missed: DM note overwriting a player entity in Sync, image path escape,
  the `publish: false` bypass, a failed build that still wrote the player atlas.

**E. Tests mock the response shape, so bugs shipped unseen.** eval/13: vault scan answered
`{files}` but the client required `data.ok`; "Sync has likely never run end to end" since 2026-06-17;
tests mocked `ok: true`. eval/33: test faked the failure as 500, real code gave 207.

**F. Sync from Obsidian fragility.** code-retro/02 (title casing lost; top-level `type:` ignored,
537 of 619 vault notes use it), 03 (stray images on 409, moved note duplicates), 04 (Staging hid
visibility it would write), eval/13 (DM folders written into `content/` as `dm`), eval/05, eval/08.
Sync has not yet run on the real vault: tidemarrow/01 is ready-for-agent. Four vault notes have
unclosed DM blocks and the build refuses them (State.md "Waiting on Isak").

**G. Viewer URL/deep-link and navigation resolved by several code paths.** eval/38 (load vs Back vs
`openEntity` resolve map/center differently), eval/35 (credits links dead; viewer URL hand-built in
four pages), eval/20 (pin label mode vs zoom), audit/08 (map flies with no size, NaN).

**H. Coordinate flip.** Only one tracker item: code-retro/05 says about 20 hand-written `H - y` sites
bypass `src/atlas/map/coords.ts`; wontfix "reopen if a pin or click lands in the wrong place".
GOALS.md says the flip must hold on every layer. No bug ticket records an actual flip failure.

**I. Process churn.** agent-retro/spec: merge rules changed three times, docs lagged (02); CI minutes
ran out (03); the gate was a scratch script (01, now `npm run gate`). Docs say 3 min test shards;
single unsharded vitest runs out of memory (AGENTS.md).

## 3. Open PRs #99-#110 (all 12 open, none merged)

Merge order from State.md (docs branch): 99, 100, 106, 102, 103, 107, 104, 105, 109, 108, 110, 101.
Auto mode refused `gh pr merge`, so they wait for Isak. Each cut from main, gate-green, Opus review clean.

| PR | Title | Branch | Top-level areas touched | Purpose |
| --- | --- | --- | --- | --- |
| 99 | eval-45: deleted pins save, on any map | eval-45-deleted-pins-counted | docs/tracker, src/atlas, src/pages, src/test | Count and save deleted pins on non-active maps |
| 100 | eval-46: one spoiler-leak rule | eval-46-one-world-yaml-leak-rule | docs/tracker, scripts/atlas, scripts/build-atlas.ts, src/atlas, src/pages, src/test | One `linkLeaksToPlayers` predicate for build, Publish Check, drafts |
| 101 | docs: State.md and workflow notes | docs-2026-11-07-improve-loop | State.md, docs/agents, docs/tracker | Queue, arch tickets, retro notes; goes last |
| 102 | eval-48: wizard zip strips map metadata | eval-48-wizard-zip-strips-metadata | README.md, docs/CODEBASE_MAP.md, docs/tracker, scripts/atlas, scripts/vite-plugin-atlas-save.ts, src/atlas, src/test | Map Import Wizard strips EXIF like editor upload |
| 103 | eval-47: Discard all clears world settings | eval-47-discard-all-clears-world-settings | docs/tracker, src/atlas, src/pages, src/test | Register world settings and calendar as session holders |
| 104 | eval-27: one reduce-motion switch | eval-27-one-reduce-motion-switch | docs/tracker, src/atlas, src/hooks, src/index.css, src/main.tsx, src/pages, src/test | Calm mode becomes one reduce-motion switch (Isak checks the button) |
| 105 | eval-49: ruler and drawing never take the same click | eval-49-ruler-and-drawing-one-click | docs/tracker, src/atlas, src/pages, src/test | `resolveMapClickTool` decides who owns a click |
| 106 | eval-50: Publish Check judges link leaks like the build (stacked on #100) | eval-50-link-leak-rules-match-build | docs/tracker, scripts/atlas, scripts/build-atlas.ts, src/atlas, src/pages, src/test | Wikilink/relationship leak rules match build |
| 107 | eval-44: soundscape draft per map (stacked on #103) | eval-44-soundscape-draft-per-map | docs/tracker, src/atlas, src/pages, src/test | Soundscape draft keyed by map |
| 108 | arch-04: delete dead EntityReadingView | arch-04-delete-entity-reading-view | src/atlas, src/test | Remove dead component; leak tests render EntityPanes |
| 109 | arch-01: publish scans find the real atlas.json and fog layers | arch-01-scans-find-real-artifacts | scripts/atlas, scripts/check-*.ts (4 scans), src/test | Fog scan and others read real artifact paths |
| 110 | An invalid world.yaml visibility loads as dm (arch-07) | arch-07-invalid-visibility-fails-closed | docs/VISIBILITY_AND_PLAYER_SAFETY.md, docs/adr, scripts/atlas, src/test | Typo in world.yaml visibility fails closed to `dm` (ADR addendum) |

Overlap: #100/#106 and #102/#103/#107 both edit `AtlasPlacementEditor.tsx` area or build-atlas.ts; two are stacked.

## 4. GOALS.md (2026-10-27), item by item

Evidence is repo state at main 983b5d0 unless noted.

| Goal | Verdict | Evidence |
| --- | --- | --- |
| Atlas = players' atlas for the whole world; Tidemarrow first map | not done | `content/` and `world.yaml` still hold the Astrath sample (map `astrath-deeprealm-overview`, upload-* layers); no `tidemarrow` file under `content/` or `public/atlas`; tidemarrow/01-03 ready-for-agent |
| Old Astrath sample removed | not done | tidemarrow/03 blocked by 02 |
| Only Isak and AI use the editor; players see only the site | done | editor behind `__INCLUDE_EDITOR__`; NON_GOALS; live site https://thraez.github.io/campaign-atlas-final/ |
| No/invalid visibility counts as `dm` everywhere (ADR-0001) | partly | audit/01, code-retro/06 done; world.yaml loader invalid value still becomes `player` on main; fix is #110 (arch/07), open |
| Every safety scan passes before publish; CI blocks failing publish | partly | scan registry (eval/01) done, publish gated on `test:ci`; arch/01 shows fog scan skips in `dist` (fix #109 open); arch/02 sound areas in fog not scanned; arch/09 |
| DM-only vault content never in player build/search/assets | partly | eval/34, 40, 43 done; arch/02, eval/46/50 open; the repo is public so `content/` DM notes are readable on GitHub (State.md "Waiting on Isak": Isak to make it private) |
| Weekly dependency audit green | done (as of audit/02) | eval/06 done; `npm-audit.yml` still weekly; agent-retro/03 open on scheduled CI |
| Sync: dry run lists create/update/leave, writes nothing | done in code, not run on real vault | code-retro/07 (PR #79) |
| Sync: 01/02 arrive `player`; 03/04 arrive `dm` | done in code, not run | code-retro/04, tidemarrow/01 unrun |
| Sync: title, type, links survive | done in code | code-retro/02 |
| Sync idempotent; moved note updates in place | done in code | code-retro/03 |
| Sync folder set excludes DM/session/toolbox folders | done | eval/13 |
| Tidemarrow map with 16 pins from `World Map.markers.json` | not done | tidemarrow/02 |
| Pins, clicks, fog land where drawn; flip holds on every layer | partly / unverified | no flip bug ticket; code-retro/05 wontfix (about 20 hand-written `H - y` sites); no round-trip test |
| Isak checks map look; look-changes stay ready-for-human | in use | State.md lists pending look-and-feel checks (#63-#81) |
| Typecheck, lint, `test:ci` pass on Mac and PC | done | audit/03; `npm run gate` (agent-retro/01, merged) |
| Generated-path hook works on both computers | done on Mac; PC not confirmed | `docs/PC-CLEANUP.md` pending on PC (State.md) |
| Not now: world rename (audit/05), map-space and draft-registry refactors | parked | audit/05 ready-for-human; code-retro/05, 09 wontfix |

## 5. PRODUCT_SPEC / NON_GOALS / KNOWN_LIMITATIONS versus the owner's new goals

New goals: one connected atlas of ALL his worlds and maps; hidden zones, travel, fog, notes on every
place; story engine with hover-to-read regions, monuments, people; browser editor stays.

Direct conflicts (quoted from files):
- PRODUCT_SPEC pitch and "The user": "One DM, per world" and "does this feature serve **one DM
  running one world**?" Scope is one world per atlas; goals say all worlds.
- NON_GOALS "Full GIS-style multi-map alignment": "Maps link hierarchically (overview -> city ->
  dungeon), not by world coordinates. A unified spatial canvas is a bigger commitment than the world
  content needs." KNOWN_LIMITATIONS: "One map at a time in the viewer (by design)", "No multi-map
  composite canvas (by design)".
- NON_GOALS "Travel-time crunch beyond route speed": atlas renders `MapScale` and route speed only;
  travel calculators "belong elsewhere".
- NON_GOALS "Per-party fog / multiple view profiles (deferred)": base fog is one per-map player
  secret; per-party variants are deferred (spec `docs/superpowers/specs/2026-05-19-fog-player-mechanic-design.md`).
- NON_GOALS "Server-backed player notes": player notes are local-only browser storage; no accounts,
  no sync. Conflicts with "notes on every place" only if those notes are meant to be DM-authored
  shared (not local player notes); the files do not distinguish.
- NON_GOALS "AI-generated lore" and "Combat tracker / rules content": not in conflict, but bound
  "story engine" (DM voice is the product).
- GOALS.md "What the atlas is for": one world (`astrath-deeprealm`, name may change), other
  continents "later as more maps or layers" (hierarchy of maps inside one world).
- PRODUCT_SPEC design promise 3: editor "runs in `npm run dev`... physically removed from production
  builds. No accounts, no hosted editor." Matches "browser editor stays" (local); NON_GOALS "Hosted
  DM editor with auth" stays a hard no.
- PRODUCT_SPEC "Two modes": player build is "Strips dm/hidden entities ... Seven safety scanners";
  "hidden zones" is not a defined term; today fog (reveals/conceals polygons per layer) and
  `visibility` (player, rumor, dm, hidden) exist.
- KNOWN_LIMITATIONS "Pin clustering", "atlas.json loaded whole (5+ maps)", "No tile pyramid": scale
  limits that a many-worlds atlas would hit; all marked "not yet".
- NON_GOALS "First-class rumor / theory / contradiction types: model these in prose" and "Setup
  scaffolder": no conflict.

Already supported (no conflict): regions with hover Tooltip and click Popup (KNOWN_LIMITATIONS
accessibility table); routes with mode and distance Tooltip; fog per map (reveals and conceals);
pins with `priority`; hierarchical map links; ambient sound areas; player-local notes; browser editor
(Creator Cockpit at `/atlas/edit`, `npm run dev` only). Not found in docs: "monuments" as a type;
a "world" level above maps (worlds today = one `world.yaml` per content folder); any travel
calculator beyond route speed.
