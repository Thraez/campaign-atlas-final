/**
 * The Leaflet icon for a player-map pin, cached by style and state.
 *
 * react-leaflet calls `marker.setIcon` (and rebuilds the pin's DOM) whenever a
 * Marker's `icon` prop is a different object than last render. Handing back the
 * same `L.DivIcon` for the same look means a re-render that doesn't change a
 * pin leaves its DOM alone. One icon object can serve many markers (the wrap
 * copies): Leaflet builds a fresh element per marker from its options.
 *
 * PLAYER-SAFE: the player bundle imports this file. Import nothing editor-only.
 */
import L from "leaflet";
import { pinSvg, type PinPreset } from "@/atlas/pins/presets";

export interface PinIconState {
  /** Rumoured entity: the glyph renders faded. */
  dim?: boolean;
  /** Extra classes on the icon box (discovery state, active pin). */
  extraClass?: string;
  /** Accessible name injected into the SVG. */
  ariaLabel?: string;
}

/** Past this many distinct icons the cache starts over (a safety valve, not an LRU). */
const MAX_CACHED = 5000;
const cache = new Map<string, L.DivIcon>();

function buildIcon(style: Pick<PinPreset, "color" | "shape">, state: PinIconState): L.DivIcon {
  // iconSize defines the hit area Leaflet uses for click/touch dispatch. The
  // visual SVG is smaller (~22px) but we expose a 44x44 hit area so mobile
  // touch targets meet WCAG 2.5.5 (Target Size, Level AAA). The SVG centers
  // visually inside the box via the `atlas-viewer-pin` CSS rule.
  const cls = state.extraClass ? `atlas-viewer-pin ${state.extraClass}` : "atlas-viewer-pin";
  const svgHtml = pinSvg({ color: style.color, shape: style.shape }, { dim: state.dim });
  // Inject role + aria-label into the SVG so screen readers announce the pin name.
  const html = state.ariaLabel
    ? svgHtml.replace(
        "<svg ",
        `<svg role="img" aria-label="${state.ariaLabel.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" `,
      )
    : svgHtml;
  return L.divIcon({
    className: cls,
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 36],
  });
}

/** The pin's icon; the same object for the same style and state. */
export function pinIcon(
  style: Pick<PinPreset, "color" | "shape">,
  state: PinIconState = {},
): L.DivIcon {
  const key = JSON.stringify([
    style.color,
    style.shape,
    !!state.dim,
    state.extraClass ?? "",
    state.ariaLabel ?? "",
  ]);
  let icon = cache.get(key);
  if (!icon) {
    if (cache.size >= MAX_CACHED) cache.clear();
    icon = buildIcon(style, state);
    cache.set(key, icon);
  }
  return icon;
}
