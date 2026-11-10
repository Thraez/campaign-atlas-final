# content-next: the v2 test world

A small made-up schema v2 content root (ADR-0003, R-16) that phases 2-6 prove themselves on. Every
name and text here is invented: the repo is public, so nothing comes from the vault or `content/`.
It is built only through `atlas.next.config.json` and is never published (outputs go to the
gitignored `.atlas-campaigns/` and `dist-campaigns/`, outside `public/`).

See it per campaign: `npm run atlas:tree -- --config atlas.next.config.json`.
`scripts/atlas/atlas-tree.test.ts` checks the verdicts below; change both together.

## Layout

- `_atlas/atlas.yaml`: the ocean (3000x2000), worlds `quessaly` and `skerrow`, campaigns `main`
  and `sandbox`, and the two top-level maps' places on the ocean.
- `_atlas/campaigns/main.yaml` ("Lantern Road"): `notes: vault`, every map `open`.
- `_atlas/campaigns/sandbox.yaml` ("Sandbox"): `notes: hidden`; `oskmark` `fogged` (only x < 300
  revealed); `skerrow-isles` not listed, so `unknown`.
- `quessaly/`: the three-level tree. `quessaly-world` (on the ocean) > `oskmark` (continent, framed
  in it) > `brindlecross`, `tallowford` and `mirefold` (cities, framed in `oskmark`); `mirefold` >
  `mirefold-cellars`.
- `skerrow/`: a second world, `skerrow-isles` (on the ocean) > `hookhaven`.
- Map images: lossless PNGs in `<world>/_atlas/images/`, drawn by
  `scripts/dev/generate-test-world-maps.mjs`.
- Sound beds: `quessaly/_atlas/audio/frog-chorus.ogg` and `reed-whisper.ogg`, half-second Opus
  tones (ffmpeg `sine`), one file per area so a test can look for each file's bytes in an output.
- Note bodies are one plain sentence each and name no campaign, region id or other test detail:
  every shipped body reaches some campaign's output, and an output must name no other campaign
  and nothing hidden from it (R-17). The cases live in this file, not in the notes.

## Cases

Each case by name, and what the resolver decides for `main` / `sandbox`.

| Case                                                                    | Where                                                                                                                              | main                      | sandbox                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| Note visible in both campaigns                                          | note `haskel-thimbleby` (also `mossbeck-well`)                                                                                     | ships                     | ships                                                                           |
| Note hidden only via `notes:` in one campaign                           | note `marra-quillon` (entry `{ main: dm, sandbox: player }`)                                                                       | hidden (`entry`)          | ships                                                                           |
| Region visible in one campaign only                                     | region `reedmere` on `oskmark` (`{ main: player }`); ride-on sound `reed-whisper` follows it                                       | ships                     | hidden (`visibility`; `region-hidden`)                                          |
| Map (a city) visible in one campaign only                               | map `brindlecross` (`{ main: player }`) and its pin of `gilda-moth`                                                                | ships                     | hidden (`visibility`)                                                           |
| Map `unknown` in one campaign                                           | map `skerrow-isles` (not in `sandbox.yaml`)                                                                                        | ships, `open`             | hidden (`unknown-state`)                                                        |
| Pin, route and sound-only area inside a hidden region (ADR-0004 rule 9) | region `the-murkwater` on `oskmark` (`dm`); pin of `mossbeck-well`, route `eel-path`, sound `frog-chorus` inside it, each `player` | region hidden; items hidden (`in-hidden-region`); the note ships, with a build warning | same as main |
| Region `player` wholly inside a hidden region | region `sunken-bell` inside `the-murkwater` | hidden (`in-hidden-region`) | hidden (`in-hidden-region`) |
| Route crossing a hidden region with no waypoint inside | route `ferrymans-cut` across `the-murkwater` | hidden (`in-hidden-region`) | hidden (`in-hidden-region`) |
| Region wholly containing a hidden region (rule 9's container exception) | region `the-fenlands` around `the-murkwater`, sharing no edge | ships | ships |
| City whose frame sits partly over a hidden region | map `mirefold`, frame at (220, 350) on `oskmark`; its region `bog-market` and child map `mirefold-cellars` | hidden (`frame-in-hidden-region`); `mirefold-cellars` `parent-hidden` | same as main |
| Region hidden in one campaign only, with a route through it | region `heron-flats` (`{ sandbox: player }`); route `heron-trail` | region hidden (`visibility`); route hidden (`in-hidden-region`) | both ship |
| Map fogged in one campaign, open in the other, with a pin under the fog | map `oskmark`; pin of `haskel-thimbleby` at (450, 120)                                                                             | `open`; pin ships         | `fogged`; pin hidden (`fogged`)                                                 |
| Note with frontmatter `dm`                                              | note `the-ninth-lantern`                                                                                                           | hidden (`secret`)         | hidden (`secret`)                                                               |
| `notes:` entry with a stale `basedOn`                                   | note `wexley-tarn` (entry `basedOn: rumor`, frontmatter `player`)                                                                  | hidden (`stale-entry`)    | hidden (`stale-entry`)                                                          |
| Second city whose frame sits under a fogged map's fog (ADR-0004 rule 4) | map `tallowford`, frame at (400, 250) on `oskmark`; its pin of `pellam-ferry`                                                      | ships                     | hidden (`frame-fogged`)                                                         |
| Second world whose every map is hidden from one campaign (rule 5)       | world `skerrow`; `hookhaven` is `open` in `sandbox` but its parent isn't; note `the-tide-warden`                                   | ships                     | world hidden (`no-map-ships`); `hookhaven` `parent-hidden`; note `world-hidden` |
| Campaign with `notes: hidden` / `notes: vault`                          | `sandbox` / `main`; note `pellam-ferry` has no entry, `gilda-moth`'s entry names `main` only                                       | both ship                 | both hidden (`not-named`)                                                       |

Plain items, for the counts: region `saltmeadow` and route `gull-road` on `quessaly-world`,
region `gannet-rock` on `skerrow-isles` (hidden in `sandbox` with its map).

The loader reads this root with no warnings; the resolver finds no orphan `notes:` entries and no
name collisions, one stale entry (`wexley-tarn`) per campaign, and one shipped note whose every
pin rule 9 hides (`mossbeck-well`, in `the-murkwater`) per campaign.

## Sentinels (R-17)

`src/test/build/campaign-stores.test.ts` builds both campaigns and checks that nothing hidden
from a campaign reaches its store: every id and name in its `must-not-ship.json`, the other
campaign's id and name, and the bytes of every hidden map image and sound bed. The hidden items
it names on purpose: map `brindlecross` and its image (sandbox), world `skerrow` and
`hookhaven.png` (sandbox), pin of `mossbeck-well`, route `eel-path` and sound `frog-chorus` with
`frog-chorus.ogg` (rule 9, both), sound `reed-whisper` with `reed-whisper.ogg` (sandbox), note
`marra-quillon` (main). A note body linking a hidden map (`[[Brindlecross]]`, `[[Hookhaven]]`)
is added by the test in a temp copy, since a strict build fails on it. So are plain-text
mentions of a hidden item or of the other campaign's name (body, heading, `summary`, `tags`), each
of which fails every player build with exit 12, and local file URLs (markdown and HTML images and
links, reference definitions), which fail it with exit 1.
