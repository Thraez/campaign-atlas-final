# Publish refuses to run off `main`

Status: ready-for-agent
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
