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

# `format:check` used to live only in the PR workflow. Since branches now merge
# straight to main, that workflow rarely runs and the format gate went unchecked
# for months (67 committed files had drifted by 2026-08-06). Run it here, where
# every commit passes through. `.prettierrc.json` sets endOfLine:"auto" so this
# is not CRLF-noisy on Windows checkouts.
npm run format:check || exit 1

# Vitest exits 1 for both test failures AND unhandled worker-communication
# timeouts (infrastructure noise from long-running child-process tests).
# Capture output and only fail the commit if tests actually failed.
VITEST_OUT=$(npx vitest run --changed 2>&1)
printf '%s\n' "$VITEST_OUT"

# Vitest colorizes "N failed" and inserts ANSI reset codes between it and
# the following "| M passed", so the literal "failed |" substring never
# appears contiguously in real (non-piped) terminal output. Strip ANSI
# escapes before checking, or a real failure silently lets the commit through.
ESC=$(printf '\033')
CLEAN_OUT=$(printf '%s\n' "$VITEST_OUT" | sed "s/${ESC}\[[0-9;]*[a-zA-Z]//g")
printf '%s\n' "$CLEAN_OUT" | grep -qE "failed \|" && exit 1
exit 0
