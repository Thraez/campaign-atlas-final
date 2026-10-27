# Vault image copy: stay inside the vault, don't overwrite

Status: ready-for-agent
Area: Sync from Obsidian

`indexVaultImages` (`scripts/vite-plugin-atlas-save.ts` ~1212) checks `path.resolve`, not
`realpath`, so a symlinked image pointing outside the vault can be copied. The copy writes with
`process.cwd()` instead of the server root (~1251) and silently overwrites `<entityId>-<n>`.
Its re-encode policy is a second copy of the save path's (~500-541).

## Acceptance criteria

- A symlink in the vault that points outside it is refused (test).
- The copy never overwrites an existing file (test).
- It writes under the server root, through the same image cleaning as save.
