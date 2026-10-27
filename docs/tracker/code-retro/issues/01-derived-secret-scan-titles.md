# The derived-secret scan sees the titles the build ships

Status: ready-for-agent
Area: safety scans

`scripts/check-derived-secrets.ts` builds its list of secret titles differently from the build: no title-casing (build: `build-atlas.ts` ~233-240), a case-sensitive match (~246), and it applies the config's `exclude`, so `_dm/` and `_drafts/` titles never enter the list (~174).

## Acceptance criteria

- An untitled DM note `isle-de-marque.md` puts the build's exact title ("Isle De Marque") in the secret list, and a player note mentioning "isle de marque" in any case fails the scan.
- Titles from `_dm/` and `_drafts/` are in the list.
- Tests first, in the existing derived-secrets test file.

## Comments

2026-10-27: after the ADR-0001 fix, `npm run atlas:check-derived public/atlas` still says "vault has no hidden/dm entities", although Corven, Edric and Soreth are now `dm`. The scan works out secrecy with the old `player` default. Fix that here too (ticket 06 then removes the duplicate rule for good).
