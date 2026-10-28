# No scheduled CI

Status: ready-for-human (Isak decides what GitHub Actions may still spend)
Area: `.github/workflows/`

CI minutes ran out on 2026-10-28. #90 made the PR check manual. Two workflows still spend minutes:

- `npm-audit.yml` runs every Monday (`schedule`). It could become `workflow_dispatch` only, with
  `npm audit` added to the local gate (01).
- `publish-atlas.yml` runs `test:ci` (4 shards, about 3 min) on every merge before it deploys (ticket
  eval-24). The local gate has already run those tests. Dropping them saves minutes, but a merge made
  in GitHub's UI would then publish untested.

Isak's call: keep, make manual, or drop each one.
