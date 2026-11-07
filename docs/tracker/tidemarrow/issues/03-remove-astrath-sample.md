# Remove the old Astrath sample content

Status: ready-for-agent
Blocked by: 02, H-04 (hosting private: Cloudflare Access, repo private)

Waits for H-04 (R-01, 2026-11-07): the GitHub repo is public, so real vault notes can't land in `content/` until hosting is behind Cloudflare Access and the repo is private; Sync refuses real writes and `check-vault-content` fails publish until then.

The three May events and the three imported NPCs (`content/astrath-deeprealm/events/`, `imports/`), the sample `_drafts/Wip-Note.md`, and the sample maps in `world.yaml` that Tidemarrow replaces.

## Acceptance criteria

- No sample entity or map left; build tests use their own fixtures, not this content.
- `npm run atlas:publish` passes.
