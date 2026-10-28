# State

Updated 2026-10-28 on the Mac. Branch `main`.

## Where it stands

- Reworked on 2026-10-27: Matt Pocock's skills installed (`docs/agents/`), goals agreed with Isak
  (`docs/GOALS.md`), ADR-0001 (a note with no visibility is DM-only), tickets in `docs/tracker/`.
- The atlas becomes the players' atlas for the world, Tidemarrow first, filled from the vault by
  Sync from Obsidian. Today it still shows the old Astrath sample (three events).
- Live site: https://thraez.github.io/campaign-atlas-final/. Every PR from #57 to #90 is merged and
  published (2026-10-28); no PR is open. The player build ships only allowed files (eval 40), and
  `world.yaml` and the audio manifest 404 on the live site.
- Merges run on the full local gate plus an Opus review, without GitHub CI (`docs/agents/workflow.md`).
  The PR check runs only by hand (#90).
- The side sessions wound down on 2026-10-28; the redesign comes later at a normal pace. How the two
  days went: `docs/tracker/agent-retro/`.

## Open work

Lowest number first within each folder.

- `eval-2026-10/30`: a save drops other maps' region, route and fog drafts. Data loss: until it
  ships, save before switching maps. Build it first.
- `eval-2026-10/27` (one reduce-motion switch), `29` (editor map uploads stay lossless), `37`
  (build lock), `38` (deep links), `39` (one canon client), `41` (the build reads the editor's
  character keys).
- `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample.
- `eval-2026-10/07`: Vite 8 with Vitest 5, after Tidemarrow.
- `agent-retro/01`-`03`: from the retro.
- Parked notes: `docs/tracker/eval-2026-10/README.md`.

## Waiting on Isak

- The repo is public, so the DM notes in `content/` are readable on GitHub. Decided 2026-10-27:
  Isak makes it private and takes GitHub Pro so Pages keeps working.
- The world's new name (`audit-2026-10/05`).
- In the vault, in Obsidian: four notes have an unclosed DM block (`%%` or `:::dm`), so the build
  refuses them after a sync: blood-moon-circle, the-sovereign-eternal, sister-peline-thrace,
  the-penitent-of-harkafell.
- Look-and-feel checks on merged work (a bad result becomes a ticket): search (#63), the editor map
  (#64, #67), the missing-bytes toast (#66), the layer path field (#68), zooming pin labels (#70),
  a reload with sound on, desktop and phone (#71), offline in a browser (#78), the Sync panel (#79),
  the Save chip and the conflict notice (#80, #81).
- The provisional calls below, in a batch.
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).

## Provisional calls

Isak's rule, 2026-10-27: work never stops on a question. Each open question gets the recommended
answer, logged here and built on; he reviews this list in batches, and a reversal becomes a ticket.

| Date       | Question                                                                                                | Call                                                       | Why                                                            | Ticket |
| ---------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| 2026-10-27 | Q2: one search for palette, Browse and Timeline?                                                        | Yes, the palette's syntax on all three                     | The same query finds different notes on different pages        | 14     |
| 2026-10-27 | Q3: editor draws regions and routes in the player style?                                                | Yes, one drawing module; the editor adds handles on top    | What the DM checks should be what players see                  | 15     |
| 2026-10-27 | Q4: delete the unreachable entity-editing tabs?                                                         | Yes; the vault owns profiles and relationships             | ~800 lines reached only from tests; git keeps them             | 16     |
| 2026-10-27 | Q5: ticket "one client for canon" now?                                                                  | Yes, starting with rebase-on-conflict, ahead of code-retro | A real bug: after a 409 every later save of that entity fails  | 17     |
| 2026-10-27 | eval-16 review: delete the test-only `profileFields.ts` and `buildEntityFrontmatterPatch` too?          | Yes, with the tabs                                         | Follows Q4: the vault owns profiles; the build never read them | 16     |
| 2026-10-28 | eval-19 review: may a DM type a map layer path outside `assets/maps/`?                                  | No; it falls back to the default under maps/               | Maps stay lossless; a `.webp` name under images/ would convert | 19     |
| 2026-10-28 | code-retro 06 review: may one badly formed note anywhere (`_dm/`, `_drafts/` too) stop the publish?     | Yes; fail closed                                           | A note the build can't read can't be shown safe                | c-06   |
| 2026-10-28 | Sweep 3 Q1: `maps:optimize` stays lossless (PNG to lossless WebP, JPG copied as is)?                    | Yes; tidemarrow/02 reworded                                | Lossy re-encoding smears labels and fog edges                  | 22     |
| 2026-10-28 | Sweep 3 Q2: a saved "sound on" unlocks audio on the first tap anywhere?                                 | Yes; the invite shows until then                           | Browsers block audio until a user gesture                      | 21     |
| 2026-10-28 | Sweep 3 Q3: the PR check and publish both run `test:ci`; publish is gated on tests?                     | Yes (about 3 min more per publish)                         | A merge in GitHub skips the hook, so publish trusts nothing    | 24     |
| 2026-10-28 | Sweep 3 Q4: calm mode becomes the one "reduce motion" switch (map, ocean, transitions)?                 | Yes; moved out of sound settings, OR'd with the OS setting | Calm mode stops the waves but not the map's flights            | 27     |
| 2026-10-28 | Sweep 3 Q5: the offline menu claims only what is stored; install caches atlas.json and the current map? | Yes; portraits and audio stay cached on visit              | Precaching every picture makes the install too heavy           | 25     |
| 2026-10-28 | eval-22 review: may the editor re-encode a JPG map lossy to strip its metadata? | No; drop the metadata segments, keep the image data | Maps stay lossless; one more q85 pass smears labels | 29 |
| 2026-10-28 | eval-22 review: may `maps:optimize` delete the PNG once its WebP twin is in place and repointed? | Yes, as `images:optimize` does; git keeps it | Otherwise every map ships twice and every run re-encodes | 22 |
| 2026-10-28 | eval-21 review: should Dismiss on the "resume sound" invite leave sound off? | Yes; taps on the invite's own buttons don't count as the gesture | Dismiss has to mean no sound | 21 |
| 2026-10-28 | eval-21: does a bed set up while muted or in a hidden tab ("paused") count as playing? | Yes; the label can't show while muted anyway | Otherwise unmuting doesn't bring the label back until a pan | 21 |
| 2026-10-28 | eval-22: sharp 0.34.5 has no WebP `exact`; what happens to a PNG with colour under transparent pixels? | Skipped by the script, refused by Save; nothing converts unless all 4 channels match | Lossless must mean exact; a sharp bump can lift it later | 22 |
| 2026-10-28 | eval-24 review: should the PR check keep its 4 parallel shard jobs? | Yes; each job calls a per-shard entry of the same runner; publish runs `test:ci` | One runner and retry rule, without making every PR wait for the shards one after another | 24 |
| 2026-10-28 | eval-25 review: does "installing" mean the service-worker install, or a menu click? | The SW install: each new worker saves `atlas.json`, the search index and the current map; the menu item stays for other maps | Q5's reason ("too heavy") is about an automatic install; a new deploy also refreshes the saved map | 25 |
| 2026-10-28 | eval-25 review: may "Clear offline cache" keep the app shell? | Yes; the label stays and says the app itself stays | Deleting the shell left the menu stuck until a new worker installed | 25 |
| 2026-10-28 | code-retro 07 review: Staging now gets the sync map (match by sync map, type-conflict hold): keep it? | Yes; check it in the Sync panel | The editor never ran either check before; a renamed note now keeps its id | c-07 |
| 2026-10-28 | code-retro 07 safety fix: hold every vault note more secret than its player entity, including untagged notes in DM-default folders (many `03_Entities` rows)? | Yes; the DM ticks them, or tags them `player` in the vault | A held row costs a click; a wrong tick leaks a secret | c-07 |
| 2026-10-28 | Sweep 4: one save writes every map's drafts (rather than blocking map switches while dirty)? | Yes | All maps share one world.yaml; blocking switches would get in the DM's way | 30 |
| 2026-10-28 | Sweep 4: undoing an edit made on another map switches to that map first? | Yes | Refusing would strand the undo stack; applying it in place corrupts the other map | 30 |
| 2026-10-28 | Sweep 4: Save with only an entity edit pending points to the entity panel rather than saving it? | Yes | The entity panel owns that save and its conflict handling (ticket 17) | 31 |
| 2026-10-28 | Sweep 5 Q1: the canon client returns a typed outcome union rather than throwing error classes? | Yes | Every caller already branches on the reason; the compiler then catches an unhandled case like the 207 | 39 |
| 2026-10-28 | Sweep 5 Q2: fix the rolled-back write that reads as a save now, ahead of the canon client? | Yes | It loses drafts and sync-map entries today; 39 waits on two stacks | 33 |
| 2026-10-28 | Sweep 5 Q3: an entity link with no center opens the URL's map if valid, else the entity's placement on the default map, else its first placement? | Yes | Respects the link, then the default view | 38 |
| 2026-10-28 | Sweep 5 Q4: save protocol types and size caps live in `src/atlas/save/saveProtocol.ts`, imported by the plugin? | Yes | The plugin already imports from `src/atlas/save/`; no new dependency direction | 39 |
| 2026-10-28 | Sweep 5 Q5: player-image pruning matches full asset paths, not file names? | Yes | Name matching keeps `elf.png` when `shelf.png` ships, and one folder's image keeps another's | 34 |
| 2026-10-28 | eval-34 review: the image-privacy scan can't read `.ico`/`.bmp` metadata (sharp); check their names only and print each skipped file? | Yes | Otherwise the site's own `favicon.ico` fails every scan; the skip is named, not silent | 34 |
| 2026-10-28 | eval-36 review: the build reads `character-keys.yaml` through the editor's parser, so `Bob: 12345` counts as key "12345"? | Yes | The editor offers Bob as a secret's target; the build skipped him until a re-save. Entries the parser rejects get the existing warning | 41 |
| 2026-10-28 | eval-40 review: the player build both prunes off-allowlist files and fails a scan on them? | Yes | The prune keeps a normal build safe; the scan catches a build that skipped the plugin | 40 |
| 2026-10-28 | eval-40 review: drop the audio manifest from the player build? | Yes | Only the editor reads it, and it lists the DM's source bed names | 40 |
| 2026-10-28 | eval-40 review: hashed audio ships only when `atlas.json` references it, any extension? | Yes | A `.opus` bed was pruned silently; reference beats a format list | 40 |
| 2026-10-28 | eval-40 review: images may sit anywhere under `atlas/`, and the image prune covers the same area? | Yes | A map layer outside `assets/` vanished; the prune still drops unreferenced ones | 40 |
