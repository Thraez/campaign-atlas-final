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
#
# This gate used to IGNORE the exit code entirely and fail only when the output
# matched "failed |". That fails OPEN: a missing binary, a bad vitest config, a
# crash before any test ran, or zero collected tests all produce output with no
# "failed |" in it, so the commit sailed through with nothing verified. The
# publish-atlas.yml workflow deliberately skips tests because it trusts this
# hook, so that hole was the whole test gate on the shipping path.
#
# Now: fail closed. A non-zero exit blocks the commit unless the output shows
# BOTH a clean test result AND the specific worker-timeout signature we know is
# infrastructure noise.
VITEST_OUT=$(npx vitest run --changed 2>&1)
VITEST_EXIT=$?
printf '%s\n' "$VITEST_OUT"

# Vitest colorizes "N failed" and inserts ANSI reset codes between it and
# the following "| M passed", so the literal "failed |" substring never
# appears contiguously in real (non-piped) terminal output. Strip ANSI
# escapes before checking, or a real failure silently lets the commit through.
ESC=$(printf '\033')
CLEAN_OUT=$(printf '%s\n' "$VITEST_OUT" | sed "s/${ESC}\[[0-9;]*[a-zA-Z]//g")

# An explicit failure line always blocks, whatever the exit code says.
if printf '%s\n' "$CLEAN_OUT" | grep -qE "failed \|"; then
  echo "pre-commit: tests failed." >&2
  exit 1
fi

if [ "$VITEST_EXIT" -eq 0 ]; then
  exit 0
fi

# Non-zero exit, case 1: `--changed` matched no test files. Vitest exits 1 for
# this, but for a docs- or config-only commit it is the correct outcome, not a
# failure. Matched on vitest's exact wording so a real crash can't borrow it.
if printf '%s\n' "$CLEAN_OUT" | grep -qF "No test files found"; then
  echo "pre-commit: no tests relate to these changes; nothing to run." >&2
  exit 0
fi

# Non-zero exit, case 2: only one other signature is tolerated — the known
# worker-communication timeout, AND only when a passing summary proves the
# suite actually ran.
if printf '%s\n' "$CLEAN_OUT" | grep -qE '\[vitest-worker\]: Timeout calling' &&
  printf '%s\n' "$CLEAN_OUT" | grep -qE "Tests +[0-9]+ passed"; then
  echo "pre-commit: tolerating known vitest worker-timeout noise (tests themselves passed)." >&2
  exit 0
fi

# Everything else — missing binary, config error, crash, no tests collected —
# blocks the commit.
echo "pre-commit: vitest exited $VITEST_EXIT without a clean pass. Blocking commit." >&2
echo "pre-commit: if this is infrastructure noise, fix it or re-run; do not bypass." >&2
exit 1
