#!/bin/sh
# Unset git env vars so vitest --changed can run its own git calls correctly.
# (git sets GIT_DIR when invoking hooks; vitest --changed calls git internally.)
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

# `npm run typecheck:all` targets tsconfig.app.json + tsconfig.scripts.json
# directly. Plain `tsc --noEmit` resolves the solution-style root tsconfig
# (files:[], project references) and type-checks NOTHING, so it must not be
# used as the gate.
npm run typecheck:all || exit 1
npx eslint . || exit 1

# Vitest exits 1 for both test failures AND unhandled worker-communication
# timeouts (infrastructure noise from long-running child-process tests).
# Capture output and only fail the commit if tests actually failed.
VITEST_OUT=$(npx vitest run --changed 2>&1)
printf '%s\n' "$VITEST_OUT"
# Vitest's colorized summary line puts ANSI codes between "failed" and "|"
# (e.g. "1 failed\x1b[39m\x1b[22m\x1b[2m | ..."), which defeats a literal
# "failed |" match — strip escape codes before grepping.
printf '%s\n' "$VITEST_OUT" | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' | grep -qE "failed \|" && exit 1
exit 0
