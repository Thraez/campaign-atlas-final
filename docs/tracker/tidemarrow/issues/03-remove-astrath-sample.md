# Remove the old Astrath sample content

Status: ready-for-agent
Blocked by: 02

The three May events and the three imported NPCs (`content/astrath-deeprealm/events/`, `imports/`), the sample `_drafts/Wip-Note.md`, and the sample maps in `world.yaml` that Tidemarrow replaces.

## Acceptance criteria

- No sample entity or map left; build tests use their own fixtures, not this content.
- `npm run atlas:publish` passes.
