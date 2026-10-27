# PC cleanup: line the Windows copy up with GitHub

Written 2026-10-27 on the Mac. For Claude (or Isak) on the Windows PC, in `C:\Users\pvpro\Documents\campaign-atlas-final`. The folder keeps its name; the Mac uses the same name.

## Why

The PC ran this project's continuous-dev routine (hourly Claude runs on branch `auto/continuous-dev`) until it went idle in September. Its last State.md (2026-10-11) lists leftovers on the PC: 38 identical local `claude/*` branches, a `campaign-atlas-t1` worktree, empty `*-worktrees` folders, orphan folders under `.claude/worktrees`, and 3 stashes. The Mac reworked the project on 2026-10-27 (Matt Pocock's skills, the routine retired, a safety fix), so GitHub's `main` is the version to keep. Work that only exists on the PC is out of date: it goes to backup branches on GitHub first, and anything still wanted is redone on the Mac rather than merged.

You're reading this from GitHub before your own copy has it, so read it with `git fetch`, then `git show origin/main:docs/PC-CLEANUP.md`.

## Steps

Run them in order and stop at the first one that doesn't do what it says. In PowerShell, run each command on its own line (PowerShell 5 doesn't accept `&&`).

1. **Check this is the right repo.** `git remote -v` must show `github.com/Thraez/campaign-atlas-final`. If not, stop and tell Isak.
2. **Turn the routine off for good.** In the Claude desktop app, open the scheduled routines and delete (or disable) the hourly continuous-dev and code-quality routines for this project, so they don't wake up when the PC has tokens again. Write down their names.
3. **Stop the dev server.** Stop `npm run dev` (port 8080) if it's running, so the editor can't write files during the steps.
4. **Look before changing anything.** Run these and write down what they show:
   - `git status --short`
   - `git branch -vv`
   - `git worktree list`
   - `git stash list`
   - `git log origin/main..main --oneline` and `git log origin/auto/continuous-dev..auto/continuous-dev --oneline`
   - for each `claude/*` branch: `git log origin/main..<branch> --oneline` (most should print nothing)
5. **Back up anything not on GitHub.**
   - Uncommitted changes in the main folder: `git switch -c pc-backup-2026-10`, then `git add -A`, `git commit -m "PC leftovers before lining up with GitHub"`, `git push origin pc-backup-2026-10`. Skip if step 4's status was clean.
   - Each branch from step 4 that has commits GitHub lacks (including `main` and `auto/continuous-dev`): `git push origin "<branch>:refs/heads/pc-backup-<branch-with-slashes-as-dashes>"`.
   - Each worktree with uncommitted changes: commit them on that worktree's branch first (from inside the worktree), then push the branch as above.
   - Stashes: find the one holding `content/astrath-deeprealm/imports/kellan-brecht.md` (`git stash show --name-only "stash@{N}"`). That one can go: the vault has a newer Kellan Brecht note. Push each other stash: `git push origin "stash@{N}:refs/heads/pc-backup-stash-N"`.
6. **Check the backups reached GitHub.** `git ls-remote origin "pc-backup-*"` must list every branch you pushed in step 5. If one is missing, stop: don't do step 7.
7. **Line `main` up with GitHub.**
   - `git switch main`
   - `git reset --hard origin/main`

   This throws away the PC's own version of `main`. It's safe only because step 6 proved the backups are on GitHub.
8. **Remove the old worktrees and branches.**
   - For each worktree from step 4 other than the main folder: `git worktree remove <path>` (add `--force` only if step 5 backed it up).
   - `git worktree prune`
   - Delete the empty `*-worktrees` folders next to the repo and everything under `.claude\worktrees\` (move them to the Recycle Bin, so they can come back).
   - Delete each local `claude/*` branch: `git branch -D <branch>`. Only those step 4 showed with no commits beyond `origin/main`, or that step 5 backed up.
   - `git branch -D auto/continuous-dev` (the Mac tags and deletes the remote one).
   - Drop the kellan-brecht stash: `git stash drop "stash@{N}"`. Drop the others only after step 6 showed them on GitHub.
9. **Install and test.** `npm ci`, then `npm run typecheck:all`, `npm run lint`, `npm run test:ci`. All three should pass. The generated-path hook now runs on `node` (it used `pwsh`); nothing to set up.
10. **Check Sync still finds the vault.** If `.local-atlas\editor-settings.json` exists (machine-local, not in git), its `vaultPath` must be `C:\Users\pvpro\Documents\DnD-Campaign-Repository\Vault-DnD`, not the old `Obsidian-Vault-DnD` folder.

## Not affected

- The folder name and Claude's project memory for it stay as they are. That memory's `handovers/ACTIVE.md` and `SESSION.md` belong to the retired routine; the repo's `State.md` and `docs/tracker/` replace them.
- The backup branches stay on GitHub until the Mac has looked through them and Isak says they can go.

## Report

Tell Isak, in plain words: what step 4 showed, which routines step 2 turned off, which backup branches you pushed, whether each step worked, the test results, and anything that didn't match this guide.
