# Publish refuses to run off `main`

Status: done
Area: publish

Bug, found 2026-10-27. `scripts/atlas/runPublishPush.ts` commits on whatever branch is checked
out (~113) and then runs `git push origin main` (~122). On a feature branch the new commit is not
deployed, any unpushed local `main` commits go out instead, and `snapshotBaseline` still advances,
so the next diff is wrong.

## Acceptance criteria

- Publish checks that `HEAD` is `main` before it stages anything and returns a `wrong-branch`
  status (shown in the editor's Publish panel) otherwise. Nothing is committed or pushed.
- It pushes `HEAD:main`, not a local `main` it didn't just commit to.
- A test runs it on a feature branch and sees `wrong-branch`, no commit, no push, no snapshot.

## Comments

2026-10-27, branch `eval-09-publish-branch`:

- `runPublishPush` reads the branch with `git symbolic-ref --short HEAD` first, before the
  re-verify rebuild and before staging, and returns `{ status: "wrong-branch", branch }` unless
  it is `main` (`branch` is `""` on a detached HEAD). It now pushes `HEAD:main`.
- New result in `src/atlas/publish/publishTypes.ts`; `usePublishFlow` has a `wrong-branch` state
  and `pushBranch`; the Publish panel says "Publishing only works from the main branch", names
  the branch, and says nothing was committed or pushed.
- Tests: `runPublishPush.integration.test.ts` "refuses with wrong-branch on a feature branch: no
  commit, no push, no snapshot" (also puts an unpushed commit on local `main` and checks origin
  doesn't get it; verify is never called), "refuses with wrong-branch on a detached HEAD", "on
  main, origin/main ends at the commit it just made". Both refusal tests failed on the old code
  (it returned `published`). Plus a hook test and two panel tests.
- Out of scope, not done: the "Check" step (`/__atlas/publish-check`) still runs its full rebuild
  on a feature branch; the refusal only shows after "Publish". Checking the branch up front would
  save the DM a wasted check. Also, on `main`, any earlier unpushed local `main` commits still go
  out with the publish commit, since they are ancestors of `HEAD`.
