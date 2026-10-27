# Plan — Strict pre-commit hook

**Spec:** `docs/superpowers/specs/2026-05-28-strict-precommit-hook.md`
**Branch suggestion:** `feat/precommit-hook`
**Precondition:** IDB flake fix is merged to `main`. Do NOT start until `npm test` reports 951/951 on `main`.

## Steps

1. **Verify precondition.**
   ```
   git checkout main && git pull && npm test
   ```
   Must show all tests passing. If not, stop — flakes are still live.

2. **Verify the three commands all pass clean today on `main`.**
   ```
   npx tsc --noEmit
   npx eslint .
   npx vitest run
   ```
   All three must exit 0 before adding the hook. Otherwise the hook would reject every commit until cleanup, including the cleanup commit itself (chicken-and-egg).

3. **Add `simple-git-hooks`.**
   ```
   npm install --save-dev simple-git-hooks
   ```

4. **Add hook config to `package.json`.** Append a top-level field:
   ```json
   "simple-git-hooks": {
     "pre-commit": "npx tsc --noEmit && npx eslint . && npx vitest run"
   }
   ```

5. **Add a `prepare` script so new clones install the hook automatically.** In `package.json` `scripts`:
   ```json
   "prepare": "simple-git-hooks"
   ```

6. **Activate the hook on this machine.**
   ```
   npx simple-git-hooks
   ```

7. **Plant a failing test to verify the hook fires.** Temporarily add a `describe.only("fail-test", () => { it("fails", () => expect(true).toBe(false)); });` to any test file. Try `git commit` — must be rejected. Remove the planted test.

8. **Confirm a clean commit lands.**
   ```
   git add . && git commit -m "test(hook): clean commit smoke test"
   ```
   Should succeed. Note the duration (must be < ~90 s).

9. **Document setup.** Either add a short section to `README.md` under "Development" or create `docs/dev-setup.md`:
   > After cloning, run `npm install`. The `prepare` script will install a pre-commit hook that runs `tsc --noEmit`, `eslint .`, and `vitest run` before every commit. To bypass intentionally (e.g., for a WIP commit), use `git commit --no-verify`.

10. **Lint + typecheck + test (manual sanity).**
    ```
    npm run lint && npx tsc --noEmit && npm test
    ```

11. **Commit and PR.** Suggested message: `chore(dev): add strict pre-commit hook (tsc + eslint + vitest)`.

## Verification before claiming done

- Pre-commit hook rejects a planted failure (evidence in PR description)
- Hook duration < 90 s on a sample clean commit
- Setup documented in one place
- New clone (or `rm -rf node_modules && npm install`) auto-installs the hook via `prepare`

## Rollback

`git revert` of the PR removes the hook config and dependency. Then run `rm .git/hooks/pre-commit` once on this machine.
