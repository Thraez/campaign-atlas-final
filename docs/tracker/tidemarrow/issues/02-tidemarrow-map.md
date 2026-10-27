# Tidemarrow map with the vault's pins

Status: ready-for-agent
Blocked by: 01

## Acceptance criteria

- `world.yaml` has a Tidemarrow map using the vault's `Y_Pictures/10_World/Maps/Tidemarrow.jpg`. Until ticket eval-2026-10/29 lands, the DM copies it into `public/atlas/assets/maps/` by hand, not through the editor's import (which would re-encode a JPG map). It is a JPG, so `maps:optimize` lists it and leaves it as is: it never re-encodes a JPG map; only PNG maps become lossless WebP.
- The 16 pins in `02_Regions/World Map.markers.json` become placements on the synced entities.
- Isak checks the map in the preview pane (`ready-for-human` until then).
