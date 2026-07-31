# Vault as source — design

**Date:** 2026-07-31
**Status:** design, approved scope pending review
**Supersedes framing in:** memory note `idea_vault_as_source.md` (2026-05-16)

---

## The problem

The DM's world lives in an Obsidian vault of **2,179 notes**. The atlas holds
**7**. Everything built into the atlas so far — map labels, timeline, calendar,
browse, search, the editor — is scaffolding around seven notes.

Getting a note in today means hand-copying it into `content/` and fixing it up.
That step is why the atlas is empty.

The DM's own words (2026-05-16):

> "make this tool straight up read my obsidian vault ... and I just choose which
> files to publish. that would be amazing. Then maybe it could also show the images."

## What the vault actually looks like

Measured 2026-07-31, not assumed:

| Folder | Notes | Publishable? |
| --- | ---: | --- |
| `Z_Worldbuilding_Research` | 1,587 | No — research |
| `11_DmToolBox` | 186 | No — tooling |
| `00_SessionNotes` | 62 | No — DM only |
| `03_Entities` | 55 | **Yes** |
| `Z_Codex_Proposals` | 50 | No — proposals |
| `10_DmNotesAndSecrets` | 49 | **Never** |
| `01_Lore` | 30 | **Yes** |
| `02_Regions` | 21 | **Yes** |
| `09_Glossary` / `04_Factions` | ~8 | **Yes** |

Roughly **110 of 2,179 notes** are atlas-worthy — about 5%.

Frontmatter across the four publishable folders (79 notes, 72 with frontmatter):

- `aliases` 67 · `tags` 59 · `status` 49 · `role` 35 · `summary` 35
- **`type` on only 14** · **`visibility` on 0**

Useful values already present:

- `tags: npc` on **35** notes — maps directly to the atlas `npc` type
- `type: region` on **9**, `type: continent` on 1 — map directly
- `tags: stub` on **29** — self-declared "not finished"
- `role: Main | Story | Side | Misc` — narrative weight, not a type
- `status: alive | missing | dead | imprisoned` — **in-world state, not editorial
  readiness.** It cannot tell us whether a note is current.

### The three facts that drive the design

1. **Selection must be default-deny.** With a folder named
   `10_DmNotesAndSecrets`, an allow-everything-then-exclude model is one typo
   from a leak. A note publishes only if explicitly chosen.
2. **The atlas's required fields don't exist in the vault.** `visibility` appears
   zero times; `type` on 18% of notes. Supplying them by editing ~110 vault notes
   would mean the tool writes into the DM's own files — the single risk worth
   avoiding. So the choices live on the atlas side.
3. **A lot of notes are outdated and being reworked** (DM, 2026-07-31), and the
   vault carries no signal for it. Therefore publishing must be **pinned to what
   the DM approved**, never silently following the vault.

---

## Approaches considered

### A. True live source — the build reads the vault directly

`atlas.config.json` points `contentRoot` at the vault; include/exclude globs pick
folders; the build parses vault notes at build time.

*Cheapest to reach* — the pipeline already supports `contentRoot`, `include`, and
`exclude`. But every build depends on live vault state, so a rewrite in progress
reaches players on the next publish. It also makes the build machine-specific,
and inverts the deliberate "curate what enters the repo" boundary.

**Rejected**: unsafe for a vault in active rework — which is precisely this vault.

### B. Curated mirror — approving a note copies it into `content/` ✅ **Recommended**

The tool *browses* the vault read-only. Approving a note copies its current
content into `content/`, where the existing pipeline picks it up unchanged.
Later, the tool compares vault vs copy and reports drift.

The DM never hand-manages the copy — it is an implementation detail. What they
experience is "browse my vault, tick what publishes, get told when something I
published has changed."

*Why this wins:*

- **Pinning is free.** Published content is a committed file. A rework in
  Obsidian cannot reach players until the DM accepts it.
- **The entire existing pipeline, all 12 scans, and ~3,000 tests keep working**
  untouched. The player-safety guarantees are not renegotiated.
- **Publishing stays reproducible.** `public/atlas/atlas.json` is committed and
  the site builds from it, so GitHub never needs the vault.
- Drift is a plain file diff — reviewable in git, explainable to the DM.

*Cost:* ~110 small markdown files duplicated into the repo. They are the
published artifact anyway.

### C. Obsidian plugin that pushes to the atlas

Rejected: a second codebase in another runtime, and it puts write logic inside
the vault — the opposite of the safety goal.

---

## Design (Approach B)

### Data flow

```
Obsidian vault  ──read-only──►  Vault browser (editor panel)
                                        │  DM ticks a note
                                        ▼
                            vault.selection.yaml   (atlas repo, committed)
                                        │  approve = copy note bytes
                                        ▼
                                   content/…            (existing)
                                        │
                                   build-atlas          (unchanged)
                                        ▼
                            public/atlas/atlas.json → player site
```

Nothing in this diagram ever writes to the vault.

### Configuration — `atlas.config.json`

```jsonc
"vault": {
  "path": "../DnD-Campaign-Repository/Obsidian-Vault-DnD",
  "candidates": ["03_Entities", "01_Lore", "02_Regions", "04_Factions", "09_Glossary"],
  "blocked":    ["10_DmNotesAndSecrets", "00_SessionNotes", "Z_*", "**/.trash/**"]
}
```

- `path` is relative, so the sibling-folder layout works on any machine.
- `candidates` is what the browser may show. Everything else is invisible.
- `blocked` is a **hard** deny checked independently of `candidates`. A blocked
  path cannot enter the selection even if `candidates` is later widened. Two
  independent gates, because one is a typo away from failing.

### Selection — `vault.selection.yaml` (committed)

```yaml
version: 1
notes:
  - path: 03_Entities/Corven.md
    id: corven
    type: npc               # suggested from tags, DM-confirmed
    visibility: player
    approvedHash: 9f2c1a3e  # sha256 of the note when approved
```

`approvedHash` is the whole drift mechanism: on each build the tool re-hashes the
vault note and compares. Equal → current. Different → **"Corven changed in your
vault since you published it"**, with a diff and an Update button. Never
automatic.

### Type inference

The DM confirms, never types. Precedence:

1. `type:` in frontmatter, if it names a known atlas type (9 regions, 1 continent)
2. a `tags:` entry naming a known type (35 × `npc`)
3. the containing folder (`02_Regions` → region)
4. otherwise → ask

This reuses `suggestFiling()` and `isKnownEntityType()`, already shipped and
tested — the same idea that produced "2 notes look like characters."

`role: Main | Story | Side` maps to pin label priority, so major characters get
labelled before minor ones. `tags: stub` renders greyed with "not finished yet"
and is excluded from bulk-approve.

### Images

Obsidian `![[picture.png]]` embeds resolve against the vault, are copied out to
`public/atlas/assets/images/`, and the reference is rewritten. Copying outward is
additive and cannot harm the vault. The existing `check-image-privacy` scan
already runs over that folder.

### Wikilinks — mostly already solved

`build-atlas.ts` already carries cross-reference leak detection: it builds a full
name index and treats a public entry wikilinking to a DM-only entity as a
spoiler, including the case where only the *display text* would leak
(`build-atlas.ts:397`, `:473`, `:495`). This design inherits that; it does not
reinvent it.

The genuinely new case is a link to a note the DM simply **hasn't selected** —
absent from `content/` entirely, so it resolves to nothing. Required behaviour:
render the display text as plain text, emit no link, no path, no "missing page"
affordance that would advertise the note exists.

**Residual risk the tool cannot remove:** an approved note may name something
secret in its own link text. That text is the DM's own writing in a note they
chose to publish; no static check can distinguish it from ordinary prose. Worth
saying plainly rather than implying the tool guarantees more than it does.

### The DM experience

A "Your vault" panel in the editor:

- browse the candidate folders, search by name
- each note shows its suggested type and a tick box
- ticking approves; the copy happens invisibly
- a "3 notes changed in your vault" banner with review/update per note
- blocked folders are absent — not greyed, absent

No paths, no hashes, no YAML shown. Consistent with the existing bar: the DM
sees their world, not the plumbing.

---

## Safety properties, and how each is proven

| Property | Test |
| --- | --- |
| A blocked folder can never publish | Attempt to select from `10_DmNotesAndSecrets` → rejected, even when added to `candidates` |
| Nothing publishes unless selected | Add a note to the vault, rebuild → absent from output |
| The vault is never written | Hash every vault file before/after a full approve+build cycle → unchanged |
| Rework doesn't reach players | Change an approved note in the vault, rebuild → player output still shows the approved text, drift reported |
| Unselected wikilink targets don't leak | Published note links to an unselected note → output contains display text only; no link, no path, no "missing page" marker |

Each of these must be **mutation-checked** — deliberately break the code and
confirm the test fails. Per the audio-prune lesson (2026-07-30), a regression
test that has never failed proves nothing.

---

## Out of scope for v1

- Writing back to the vault (edits in the atlas do not touch Obsidian)
- DM-visible content from secrets/session notes — hard-blocked by decision
- Dataview / templater / plugin-generated content
- Live file watching; selection and drift are checked at build and on panel open

## Open questions

None blocking. Two to settle during implementation:

1. Whether `content/astrath-deeprealm/imports/*` (the 3 hand-copied notes) are
   retired once their vault originals are approved. Recommend yes, after parity.
2. Whether bulk-approve is offered at all in v1, or one note at a time.
   Recommend one at a time first — 110 notes is tractable, and bulk-approve is
   the operation most likely to publish something unintended.
