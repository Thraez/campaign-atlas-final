# P-01 Overlays stop piling up (folds in R-39)

Status: built, awaiting review and gate
Branch: `polish-p01-overlay-stack`
Plan: `docs/polish-2026-11/plan.md`, P-01. Folds in
`docs/tracker/rebuild-2026-11/issues/R-39-audio-toast-overlap.md`.

## What

The sound invite, the "Atlas update available" toast and the map hint piled on top of the minimap,
Wander and each other, and every map overlay drew above the menu drawer, the search dialog and the
place sheet. On a phone the update toast was about 100 px wide, one word per line, with no way to
close it.

## Acceptance criteria

- At 375 px and on desktop the sound invite, the update toast and the map hint cover neither the
  minimap, Wander nor each other, and can still be tapped or dismissed; tap targets are at least
  40 px high on a phone.
- Every map-floating overlay sits under the menu drawer, the search dialog and the sheet scrims,
  through a named z-index scale rather than more magic numbers.
- The update toast has a proper width on a phone.
- Text that overprinted is separated ("Updated <date>" over "n of m places", the Legend over the
  search field).
- No sound logic changes; v1 and desktop otherwise unchanged.

## What was done

- **Stacking.** The viewer's map area (`<main id="atlas-main">`) is `isolate`: everything floating
  on the map is one layer under the toolbar, page toasts and every scrim. That alone fixes the hint,
  Legend, Wander and minimap drawing over the drawer, search and sheet, and the two overprints.
- **Scale.** CSS variables in `src/index.css` (`:root`), Tailwind names in `tailwind.config.ts`:
  page level `--z-chrome` 30 (toolbar), `--z-toast` 40 (offline indicator), `--z-scrim` 50 (the
  shadcn `z-50`, named, not changed); inside the map `--z-map-control` 500 (hint, Legend, Wander,
  scale bar, reset, credits) and `--z-map-notice` 510 (the dock). The minimap keeps its 400.
- **One notice dock** (`src/atlas/MapNoticeDock.tsx`, `.atlas-notice-dock` in `src/index.css`):
  update toast, Wander's "explored everything" note and the sound control (invite, or mute and
  volume) stack top to bottom, right-aligned. Phone (< 640 px): full width, lifted above the taller
  of Wander and the minimap (`noticeDockClearancePx`). From 640 px: in the gap between Wander and
  the minimap, above the scale bar.
- **Update toast** moved out of `OfflineStatus` into `UpdateNotice` (same file), placed by the dock:
  full width on a phone, `max-w-md` from 640 px, Refresh 40 px high, and a "Later" ✕ that hides it
  for this page.
- **Sound invite:** both buttons are 40 px tall (the enable button was its 20 px line of text). The
  sound logic and `data-sound-invite` are untouched.
- **Offline indicator** (fixed under the toolbar) uses `z-toast` and sizes to its text
  (`w-max`, capped at the screen), so it no longer wraps a word per line either.
- A 220 ms fade-and-rise on notices (`.atlas-notice`), off under `prefers-reduced-motion` and calm
  mode (both blocks in `src/index.css`).

## Why the update toast showed on every load

Not a bug in the code: `registerType: "prompt"` (vite.config.ts) means a new service worker waits
until the player taps Refresh or closes every tab of the atlas. A reload keeps the old worker in
control, so the toast comes back on every load until then. Reproduced locally with a persistent
browser profile and a changed `sw.js`: three reloads, the waiting worker and the toast each time;
it clears once every tab closes. Each merge to `main` publishes, so anyone who visited before
sees it. The audit's browser had an older worker installed. Also seen: while a worker waits, the
page runs the old build's shell, so a returning player sees the previous version (old toast
included) until Refresh. Left as is; "Later" now closes it for the visit. Switching to auto-update
is a product call, not part of P-01.

## Provisional calls

- "Later" dismisses the update toast for this page only (it comes back on the next load while the
  update still waits). A small behaviour add; easy to drop.
- On desktop the sound invite (and the mute and volume controls once sound is on) moved from the
  bottom-right corner, where it covered the minimap, to just left of the minimap, 64 px up.
- The Wander note moved into the dock (it covered the minimap on a phone).

## Not done, seen on the way

- On a phone the scale bar overlaps the minimap's left part (bottom row, pre-existing; there is no
  room between Wander and a 180 px minimap at 375 px). Needs a call: a smaller phone minimap or
  the scale bar elsewhere.
- The reset-view button sits on the minimap's corner (both `bottom-3 right-3`), desktop too; it
  was like that before.
- The clipped "alm mode off" label was not found in this branch: the calm button is an icon in the
  toolbar (P-03's area). Probably an older live build.
- A map with layer credits would put the credit badge where the phone dock sits; no content has
  credits today.
- R-39's ticket file is not updated (left for whoever closes the round).

## Checked

Shots in `docs/polish-2026-11/shots/`: `p01-{before,after}-phone-map.jpg` (v1, 375 px, update
waiting), `p01-{before,after}-phone-search.jpg` (v2, search open), `p01-{before,after}-desktop.jpg`
(v1, 1440 px).

- v1 375 px: toast full width (351 px) at the top of the dock, invite under it, both above the
  minimap (top 665) and clear of Wander; `elementFromPoint` on Wander and the minimap hits them.
  Menu open: the drawer covers every overlay; "Updated <date>" no longer overprints.
- v1 1440 px: toast and invite left of the minimap, above the scale bar.
- v2 375 px (main, quessaly-world): menu drawer and search dialog cover the hint, Legend, Wander
  and minimap. No soundscape and no waiting worker there, so no dock content to see on v2.
- Not checked: a real phone, Safari, the enter animation by eye, sound-on controls in the dock.
