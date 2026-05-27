# Spec — Project hygiene cleanups

**Date:** 2026-05-28
**Status:** Ready for execution
**Recommended model:** Haiku 4.5 (or Sonnet 4.6 if Haiku not preferred) — pure mechanical work
**Depends on:** nothing
**Estimated session:** 15–25 minutes

## What this fixes (plain language)

Three "still looks like a fresh template" smells. Each is small and independent; do them in one session or skip individually.

## The three items

### A. Rename `package.json` `name`

Today:
```json
"name": "vite_react_shadcn_ts"
```

Target:
```json
"name": "campaign-atlas-final"
```

That field has no functional effect for this private project, but it leaks "scaffolded, not owned" every time anyone looks at `package.json`.

### B. Remove `lovable-tagger` if unused

`lovable-tagger` is in `devDependencies` (line 79 of `package.json`). Check whether anything imports it:

```
git grep -n "lovable-tagger" -- "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs" "vite.config.*"
```

- **If unused:** remove from `devDependencies`, verify `npm install`, `npm run dev`, and `npm run build` all still work.
- **If used (most likely in `vite.config.ts` under a development-mode conditional):** leave it, and add a one-line `README` note explaining why it's there.

### C. Optional — add minimal CI workflow

If the project does not already have a GitHub Actions workflow under `.github/workflows/`, add one:

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
```

**Only add this if there is no existing workflow.** Check first:
```
ls .github/workflows/ 2>/dev/null
```

This step is **dependent on the IDB flake fix being merged** — same reason as the pre-commit hook. If the flakes are still live, skip Item C and revisit after `2026-05-28-idb-flake-fix` lands.

## Success criteria

- `package.json` `name` reads `campaign-atlas-final`.
- `lovable-tagger` either gone (with `npm install` confirmed clean) or documented as needed.
- If a CI workflow was added: a green CI run on the PR.
- `npm test` and `npm run build` both pass on the resulting commit.

## Non-goals

- Replacing `simple-git-hooks` with husky, or other tooling swaps.
- Touching the `dependencies` list beyond `lovable-tagger`.
- Updating the project description, repository field, etc., unless explicitly requested.

## Constraints

- The `vite.config.ts` conditional that may load `lovable-tagger` is the only risky touch point. If you can't tell whether it's needed, leave it alone — the cost of leaving an unused devDep is tiny.

## What to read first

- `package.json`
- `vite.config.ts`
- Anywhere `lovable-tagger` is referenced (if anywhere)
