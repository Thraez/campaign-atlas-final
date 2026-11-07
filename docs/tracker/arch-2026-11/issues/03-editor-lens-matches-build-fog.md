# The editor's player lens and the build agree on fog

Status: ready-for-agent
Blocked by: the Morning queue (editor page and build are in open PRs)
Area: editor preview, build
Payoff: med · Size: M

The lens (`AtlasPlacementEditor.tsx` ~648-653) calls a point fogged when it is outside every
reveal; it ignores `conceals`, which `isLit` (`src/atlas/fog/effectiveLit.ts`) and the build
(`build-atlas.ts` ~773-776) honour. It also keeps character-locked secret pins the build drops
(~828-831). The region and route branches of `projectMapForPlayer.ts` (~38-47) are dead: the only
caller passes `[]`.

## Acceptance criteria

- `projectMapForPlayer` takes the fog overlay, uses `isLit` and the lock rule; the build calls it.
- A test: a pin inside a conceal is hidden in the lens and absent from the build.
