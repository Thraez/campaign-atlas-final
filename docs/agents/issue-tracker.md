# Issue tracker: local Markdown in docs/tracker

Specs, tickets and wayfinder maps live as Markdown files in `docs/tracker/`, committed to git so they travel between computers. Not in `.scratch/` or `previews/`: those are git-ignored and only for throwaway output.

## Conventions

- One feature or effort per folder: `docs/tracker/<slug>/`
- The spec is `docs/tracker/<slug>/spec.md`
- Tickets are one file each at `docs/tracker/<slug>/issues/<NN>-<slug>.md`, numbered from `01`, never one combined file
- State is a `Status:` line near the top of each ticket: `ready-for-agent`, `ready-for-human` (needs Isak's look or a decision), `done` or `wontfix`
- Order is the number: work the lowest open, unblocked ticket first. A `Blocked by: NN, NN` line near the top holds a ticket back.
- Comments append at the bottom under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `docs/tracker/<slug>/`, creating the folder if needed.

## When a skill says "fetch the relevant ticket"

Read the file at the given path. The user normally passes the path or the ticket number.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `docs/tracker/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `docs/tracker/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `docs/tracker/<effort>/issues/` for files that are open, unblocked and unclaimed; the lowest number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then add a pointer (gist + link) to the map's Decisions so far.
- **Research tickets** write their findings into the ticket or `docs/tracker/<effort>/research/`, on `main`, not on a pushed `research/<name>` branch.
