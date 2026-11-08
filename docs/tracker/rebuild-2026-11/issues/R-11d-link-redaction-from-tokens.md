# R-11d Link redaction from wikilink tokens

Status: done
Blocked by: R-11a
Size: S
Branch: `rebuild-r11d-token-redaction`
Folds in: `docs/tracker/arch-2026-11/issues/08-one-secret-note-rule.md` (the redaction half; R-11a
does the secret-note predicate)
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

`projectEntityForPlayer` redacts links to secret notes from the shipped `body` by rebuilding a
regex from the trimmed link target (step 3, `src/atlas/content/projectEntityForPlayer.ts` ~254-268).
A link written `[[ Name ]]` (spaces inside the brackets) doesn't match that regex, so the secret
note's name stays in the player `body`. Redact from the token positions `tokenizeWikilinks` already
found instead, using R-11a's one secret-note predicate for "is the target secret".

## Acceptance criteria

- Before the change, a test records today's player `body` and `bodyHtml` for every entity of
  `content/` (a committed snapshot, or before/after builds as in R-11b), so the change is proved
  to touch only links that were leaking.
- Redaction replaces each link to a secret target by its token span (start and end in the source
  string), not by a regex over the target; the replacement text stays `…` and the link is marked
  broken as today.
- Tests: `[[ Name ]]`, `[[Name|alias]]`, `[[ Name | alias ]]`, `[[Name#Heading]]`, a target
  written in different case, and two links to the same secret in one body: none leaves the secret
  name or alias in `body` or `bodyHtml`. A link to a note that ships is untouched.
- After the change the snapshot of `content/` is identical except for entities whose body held a
  leaking link form; the PR lists them (expected: none today, or say which).
- `npm run gate` passes.

## Touches

- `src/atlas/content/projectEntityForPlayer.ts`, maybe `src/atlas/content/parseWikilinks.ts`
  (`tokenizeWikilinks`, only to expose token positions), tests under `src/test/`.

## Out of scope

- The secret-note predicate itself (R-11a). Which notes ship per campaign (R-11a, R-11b).
