# Tidemarrow map with the vault's pins

Status: ready-for-agent
Blocked by: 01

## Acceptance criteria

- `world.yaml` has a Tidemarrow map using the vault's `Y_Pictures/10_World/Maps/Tidemarrow.jpg`. The editor's upload only adds layers to a map that exists, so draft the new map with the Map Import Wizard (map-details panel, "Import Maps"): paste its `world-map-patch.yaml` into `world.yaml` and copy the image from `atlas-map-import.zip` to its repo path; since eval-2026-10/48 the zip's image has its metadata stripped like an upload. Later layers go through the editor upload, then Save. Either way, since ticket eval-2026-10/29 the strip keeps a JPG map's image data byte for byte and only drops its metadata (EXIF, XMP, IPTC, comments). A JPG whose EXIF says to rotate it is refused; rotate it in an image editor first. It is a JPG, so `maps:optimize` lists it and leaves it as is: it never re-encodes a JPG map; only PNG maps become lossless WebP.
- The 16 pins in `02_Regions/World Map.markers.json` become placements on the synced entities.
- Isak checks the map in the preview pane (`ready-for-human` until then).
