# Tidemarrow map with the vault's pins

Status: ready-for-agent
Blocked by: 01, H-04 (hosting private: Cloudflare Access, repo private)

Waits for H-04 (R-01, 2026-11-07): the GitHub repo is public, so real vault notes can't land in `content/` until hosting is behind Cloudflare Access and the repo is private; Sync refuses real writes and `check-vault-content` fails publish until then.

## Acceptance criteria

- `world.yaml` has a Tidemarrow map using the vault's `Y_Pictures/10_World/Maps/Tidemarrow.jpg`. Import it through the editor (upload it as a map layer, then Save): since ticket eval-2026-10/29 the save keeps a JPG map's image data byte for byte and only drops its metadata (EXIF, XMP, IPTC, comments). A JPG whose EXIF says to rotate it is refused; rotate it in an image editor first. It is a JPG, so `maps:optimize` lists it and leaves it as is: it never re-encodes a JPG map; only PNG maps become lossless WebP.
- The 16 pins in `02_Regions/World Map.markers.json` become placements on the synced entities.
- Isak checks the map in the preview pane (`ready-for-human` until then).
