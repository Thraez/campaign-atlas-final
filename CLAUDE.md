@AGENTS.md

Claude-specific notes:

- `/handover` writes to project memory `handovers/SESSION.md`; see `handover_protocol.md`.
- The pre-tool hook (`.claude/hooks/block-generated-paths.ps1`, run with `pwsh`) is wired in
  `.claude/settings.json`; keep it working when editing settings.
