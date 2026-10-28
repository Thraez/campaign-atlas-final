# Agent docs match the merge flow

Status: done (wind-down docs PR, 2026-10-28)
Area: agent docs

`docs/agents/workflow.md` still said "Work on `main`, no PRs". `AGENTS.md` said to stop at any
conflict. `State.md` held a 300-line merge queue. The current flow is a branch and a PR per ticket,
merged on the full local gate plus a clean Opus review, without GitHub CI. The PR check runs only by
hand (#90), and a merge into `main` publishes. Rewritten in the wind-down PR. `State.md` is cut to
where things stand, open work and the provisional calls.
