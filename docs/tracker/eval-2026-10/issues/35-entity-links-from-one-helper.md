# Entity links come from one helper; credits links work

Status: done (PR #83, merged 2026-10-28)
Area: player site

Found by the fifth sweep (2026-10-28), verified by reading. `AtlasCredits.tsx` (~38, 65) links
to `/?entity=<id>`. That route is the landing page (`App.tsx` ~53), which ignores the parameter,
so every credits link is dead. The id isn't URI-encoded either. The viewer URL is also built by
hand in `AtlasTimeline.tsx` (~230), `AtlasBrowse.tsx` (~282) and `CharacterSecretsPage.tsx`
(~116).

## Acceptance criteria

- A failing test first: a credits link opens the viewer on that entity.
- One `entityHref(id)` (in `src/atlas/deepLink.ts`), used by all four pages, encodes the id.
- A test per page: its entity link resolves to the viewer with that entity open.
