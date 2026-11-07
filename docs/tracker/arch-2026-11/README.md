# Architecture pass, 2026-11-07 (code outside the open PRs)

An architecture and retro pass (Opus, medium) over the code none of PRs #99-#107 touch. Ranked by
payoff over size. "Overlaps" names an open PR's file the fix would edit; those wait until the queue
merges. Already ticketed elsewhere, not repeated: eval-39, the pin anchor offset, WebP map
metadata, the map-space module, a draft registry, build-atlas stages, Vite 8.

| #   | Ticket                                                   | Payoff   | Size | Overlaps open PR    |
| --- | -------------------------------------------------------- | -------- | ---- | ------------------- |
| 01  | Publish scans find the real atlas.json and fog layers    | high     | S-M  | no                  |
| 02  | Sound-only areas inside fog ship to players              | med-high | S-M  | `build-atlas.ts`    |
| 03  | The editor's player lens and the build agree on fog      | med      | M    | editor page, build  |
| 04  | Delete the dead `EntityReadingView`                      | low-med  | S    | no                  |
| 05  | "Recently revealed" works on the live site               | med-low  | M    | `SearchPalette.tsx` |
| 06  | Delete the redundant audio prune plugin                  | low      | S    | no                  |
| 07  | A world.yaml visibility typo fails closed (Isak: `dm`)   | med      | S    | no                  |
| 08  | One secret-note rule; body redaction from tokens         | low      | S    | no                  |
| 09  | check-player-files fails a built site with no atlas.json | low-med  | S    | no (after 01)       |

Built this round: 01, 04 and 07 (their PRs are in State.md's Morning queue).
