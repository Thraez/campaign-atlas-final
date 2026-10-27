# Pin layer stops rebuilding on every viewer change

Status: ready-for-agent
Area: map

`WrappedWorld` and `PlacementMarkers` (`src/pages/AtlasViewer.tsx` ~1101-1356) aren't memoised
and build a fresh `L.divIcon` per pin on every render (`pinIconForStyle` ~99-122, called ~1322),
so react-leaflet swaps every marker's DOM on pan/zoom (`setViewCenter` ~293), each search
keystroke (~263) and hover peek (~436). The O(n²) label-collision pass reruns each time, three
times on wrapping maps (~841).

## Acceptance criteria

- Map rendering moves out of the page into `src/atlas/map/` (tests already import it from the
  page: `placement-markers.test.tsx:35`, `atlas-viewer-region-ruler.test.tsx:35`).
- Icons are cached by style and state; the world is memoised; label decisions are memoised per
  zoom.
- A test proves a search keystroke or hover does not call `setIcon` on unchanged pins.
- Measured before and after on a world with 300+ pins (record the numbers in Comments).
