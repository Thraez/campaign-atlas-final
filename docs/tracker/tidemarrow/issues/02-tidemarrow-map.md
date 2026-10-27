# Tidemarrow map with the vault's pins

Status: ready-for-agent
Blocked by: 01

## Acceptance criteria

- `world.yaml` has a Tidemarrow map using the vault's `Y_Pictures/10_World/Maps/Tidemarrow.jpg`, copied into `public/atlas/assets/maps/` as is. It is a JPG, so `maps:optimize` leaves it alone (it never re-encodes a JPG map; only PNG maps become lossless WebP).
- The 16 pins in `02_Regions/World Map.markers.json` become placements on the synced entities.
- Isak checks the map in the preview pane (`ready-for-human` until then).
