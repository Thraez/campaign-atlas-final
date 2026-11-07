# Delete the redundant audio prune plugin

Status: ready-for-agent
Area: player build (vite)
Payoff: low · Size: S

`prunePlayerFilesPlugin`'s allowlist already removes every source-named audio bed; its header
(`vite-plugin-prune-player-files.ts` ~17-19) says whichever plugin runs first removes them.
`vite.config.ts` (~179) still registers `prunePlayerAudioPlugin`.

## Acceptance criteria

- The plugin and its test are gone; a test shows the files plugin removes a source-named bed.
