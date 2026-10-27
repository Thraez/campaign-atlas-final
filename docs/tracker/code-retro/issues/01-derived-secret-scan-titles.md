# The derived-secret scan sees the titles the build ships

Status: done
Area: safety scans

`scripts/check-derived-secrets.ts` builds its list of secret titles differently from the build: no title-casing (build: `build-atlas.ts` ~233-240), a case-sensitive match (~246), and it applies the config's `exclude`, so `_dm/` and `_drafts/` titles never enter the list (~174).

## Acceptance criteria

- An untitled DM note `isle-de-marque.md` puts the build's exact title ("Isle De Marque") in the secret list, and a player note mentioning "isle de marque" in any case fails the scan.
- Titles from `_dm/` and `_drafts/` are in the list.
- Tests first, in the existing derived-secrets test file.

## Comments

2026-10-27: after the ADR-0001 fix, `npm run atlas:check-derived public/atlas` still says "vault has no hidden/dm entities", although Corven, Edric and Soreth are now `dm`. The scan works out secrecy with the old `player` default. Fix that here too (ticket 06 then removes the duplicate rule for good).

2026-10-27, branch `code-retro-fixes`: new `scripts/atlas/noteIdentity.ts` holds `deriveTitle`, `resolveVisibility` and `isSecretNote` (the ADR-0001 rule). The build and `check-derived-secrets.ts` both import them, so the scan's titles and secrecy are the build's. The scan reads excluded folders too, and matches in any letter case on whole words. Whole words, because case-insensitive substring matching would flag the slug `mira` inside "miracle". The cost: a secret name glued into a longer word (`SecretLairEntrance`) is no longer caught. Six new tests in `src/test/derived-secret-scan.test.ts`. On the real content, `atlas:check-derived public/atlas` now derives 7 names (Corven, Edric, Soreth and two aliases, plus a `_drafts` note) and is clean. `atlas:publish:integrity-smoke`: all 5 scans still catch their fault. The visibility rule in `src/atlas/import/mergeImportFrontmatter.ts` is still a second copy, for ticket 06.
