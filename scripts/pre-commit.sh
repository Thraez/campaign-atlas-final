#!/bin/sh
# Unset git env vars so vitest --changed can run its own git calls correctly.
# (git sets GIT_DIR when invoking hooks; vitest --changed calls git internally.)
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

# `npm run typecheck:all` targets tsconfig.app.json + tsconfig.scripts.json
# directly. Plain `tsc --noEmit` resolves the solution-style root tsconfig
# (files:[], project references) and type-checks NOTHING, so it must not be
# used as the gate.
npm run typecheck:all || exit 1
npm run lint || exit 1

# `format:check` used to live only in the PR workflow. Since branches now merge
# straight to main, that workflow rarely runs and the format gate went unchecked
# for months (67 committed files had drifted by 2026-08-06). Run it here, where
# every commit passes through. `.prettierrc.json` sets endOfLine:"auto" so this
# is not CRLF-noisy on Windows checkouts.
npm run format:check || exit 1

# Tests related to the changes, through the same runner as `npm run test:ci`
# (scripts/dev/run-sharded-tests.ts). It fails closed: a non-zero vitest exit
# blocks the commit unless scripts/dev/shardOutcome.ts recognises it as "no
# tests relate to these changes" or the known worker-timeout noise, which gets
# one re-run. If it blocks on infrastructure noise, fix it or re-run; never
# bypass the hook.
npm run test:changed || exit 1
