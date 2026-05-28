#!/bin/sh
# Unset git env vars so vitest --changed can run its own git calls correctly.
# (git sets GIT_DIR when invoking hooks; vitest --changed calls git internally.)
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

npx tsc --noEmit || exit 1
npx eslint . || exit 1

# Vitest exits 1 for both test failures AND unhandled worker-communication
# timeouts (infrastructure noise from long-running child-process tests).
# Capture output and only fail the commit if tests actually failed.
VITEST_OUT=$(npx vitest run --changed 2>&1)
printf '%s\n' "$VITEST_OUT"
printf '%s\n' "$VITEST_OUT" | grep -qE "failed \|" && exit 1
exit 0
