// The ocean's sea style (R-31). `ocean.sea` in atlas.json is only checked to be
// a string, so it is looked up here and never used raw: not in CSS, class names
// or the DOM. An unknown value draws the `default` sea.

import type { MapDocument } from "../content/schema";

export type SeaStyleName = "default";

/** What `OceanBackground` takes. */
export type SeaStyle = Pick<MapDocument, "oceanColor" | "water">;

const SEA_STYLES: Record<SeaStyleName, SeaStyle> = {
  // Today's water: OceanBackground's own defaults.
  default: {},
};

export function seaStyleName(sea: unknown): SeaStyleName {
  return typeof sea === "string" && Object.prototype.hasOwnProperty.call(SEA_STYLES, sea)
    ? (sea as SeaStyleName)
    : "default";
}

export function seaStyle(sea: unknown): SeaStyle {
  return SEA_STYLES[seaStyleName(sea)];
}
