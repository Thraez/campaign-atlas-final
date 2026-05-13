/**
 * Pin preset registry.
 *
 * Each preset bundles the visual + behavioral defaults for a kind of pin so
 * the DM doesn't have to author them per-placement. The entity's `atlas.type`
 * picks a default preset; an entity can override at the placement level via
 * `atlas.placements[].pin`.
 *
 * Storage stays YAML-canonical: we only serialize the *overrides* the DM
 * actually changed, never the preset defaults — that keeps frontmatter terse
 * and makes it safe to re-tune presets centrally.
 */

export type PinShape = "teardrop" | "circle" | "square" | "diamond" | "shield" | "star";
export type PinLabelMode = "auto" | "always" | "never" | "hover";

export interface PinPreset {
  /** Stable preset id used in YAML (atlas.placements[].pin.preset). */
  id: PinPresetId;
  label: string;
  icon: string;        // lucide icon name (looked up by viewer/editor)
  color: string;       // CSS color (hex)
  shape: PinShape;
  labelMode: PinLabelMode;
  /** Higher = shows label sooner / wins collision arbitration. */
  priority: number;
  /** Don't show the label below this leaflet zoom level (ignored if labelMode=always). */
  labelMinZoom: number;
}

export type PinPresetId =
  | "settlement" | "capital" | "village" | "region" | "ruin" | "dungeon" | "cave"
  | "npc" | "faction" | "temple" | "shop" | "port" | "hazard" | "mystery"
  | "resonance_site" | "player_base" | "custom";

export const PIN_PRESETS: Record<PinPresetId, PinPreset> = {
  capital:        { id: "capital",        label: "Capital",        icon: "crown",     color: "#f0a830", shape: "shield",   labelMode: "always", priority: 9, labelMinZoom: -6 },
  settlement:     { id: "settlement",     label: "Settlement",     icon: "building",  color: "#f4c95d", shape: "teardrop", labelMode: "auto",   priority: 6, labelMinZoom: -2 },
  village:        { id: "village",        label: "Village",        icon: "home",      color: "#d6b86b", shape: "teardrop", labelMode: "auto",   priority: 4, labelMinZoom: -1 },
  port:           { id: "port",           label: "Port",           icon: "anchor",    color: "#5cb8d9", shape: "teardrop", labelMode: "auto",   priority: 6, labelMinZoom: -2 },
  region:         { id: "region",         label: "Region",         icon: "map",       color: "#7fb069", shape: "diamond",  labelMode: "always", priority: 7, labelMinZoom: -6 },
  ruin:           { id: "ruin",           label: "Ruin",           icon: "landmark",  color: "#b07d62", shape: "teardrop", labelMode: "auto",   priority: 3, labelMinZoom: 0  },
  dungeon:        { id: "dungeon",        label: "Dungeon",        icon: "skull",     color: "#8e5cd9", shape: "teardrop", labelMode: "auto",   priority: 5, labelMinZoom: -1 },
  cave:           { id: "cave",           label: "Cave",           icon: "mountain",  color: "#7a6f63", shape: "teardrop", labelMode: "auto",   priority: 3, labelMinZoom: 0  },
  npc:            { id: "npc",            label: "NPC",            icon: "user",      color: "#5cb8d9", shape: "circle",   labelMode: "hover",  priority: 2, labelMinZoom: 1  },
  faction:        { id: "faction",        label: "Faction",        icon: "flag",      color: "#d95c8e", shape: "shield",   labelMode: "auto",   priority: 5, labelMinZoom: -1 },
  temple:         { id: "temple",         label: "Temple",         icon: "church",    color: "#e2c275", shape: "teardrop", labelMode: "auto",   priority: 4, labelMinZoom: 0  },
  shop:           { id: "shop",           label: "Shop",           icon: "store",     color: "#9ec18a", shape: "circle",   labelMode: "hover",  priority: 1, labelMinZoom: 2  },
  hazard:         { id: "hazard",         label: "Hazard",         icon: "alert",     color: "#e85d3a", shape: "diamond",  labelMode: "auto",   priority: 5, labelMinZoom: -1 },
  mystery:        { id: "mystery",        label: "Mystery",        icon: "help",      color: "#a070ff", shape: "diamond",  labelMode: "auto",   priority: 4, labelMinZoom: 0  },
  resonance_site: { id: "resonance_site", label: "Resonance Site", icon: "sparkles",  color: "#7ad3ff", shape: "star",     labelMode: "auto",   priority: 6, labelMinZoom: -1 },
  player_base:    { id: "player_base",    label: "Player Base",    icon: "tent",      color: "#f7d76b", shape: "star",     labelMode: "always", priority: 8, labelMinZoom: -6 },
  custom:         { id: "custom",         label: "Custom",         icon: "pin",       color: "#cfd6dc", shape: "teardrop", labelMode: "auto",   priority: 3, labelMinZoom: 0  },
};

/** Maps an entity type (from frontmatter atlas.type) to a default preset. */
const TYPE_TO_PRESET: Record<string, PinPresetId> = {
  settlement: "settlement",
  capital: "capital",
  city: "settlement",
  town: "settlement",
  village: "village",
  port: "port",
  region: "region",
  ruin: "ruin",
  dungeon: "dungeon",
  cave: "cave",
  npc: "npc",
  faction: "faction",
  temple: "temple",
  divine_site: "temple",
  shop: "shop",
  black_market: "shop",
  hazard: "hazard",
  wilderness_landmark: "hazard",
  mystery: "mystery",
  resonance_site: "resonance_site",
  player_base: "player_base",
};

export function defaultPresetForType(type: string | undefined): PinPresetId {
  if (!type) return "custom";
  return TYPE_TO_PRESET[type.toLowerCase()] ?? "custom";
}

/** Per-placement overrides kept in YAML. Only fields that differ from the preset are stored. */
export interface PinOverride {
  preset?: PinPresetId;
  color?: string;
  icon?: string;
  shape?: PinShape;
  labelMode?: PinLabelMode;
  labelMinZoom?: number;
  priority?: number;
}

/** Resolve final pin style for rendering, merging preset + per-placement overrides. */
export function resolvePinStyle(
  entityType: string | undefined,
  override?: PinOverride | null
): PinPreset {
  const presetId = override?.preset ?? defaultPresetForType(entityType);
  const base = PIN_PRESETS[presetId] ?? PIN_PRESETS.custom;
  return {
    ...base,
    color: override?.color ?? base.color,
    icon: override?.icon ?? base.icon,
    shape: override?.shape ?? base.shape,
    labelMode: override?.labelMode ?? base.labelMode,
    labelMinZoom: override?.labelMinZoom ?? base.labelMinZoom,
    priority: override?.priority ?? base.priority,
  };
}

/** Compute the minimal override object: drops keys equal to preset defaults. */
export function diffPinOverride(
  entityType: string | undefined,
  styled: Partial<PinPreset> & { preset?: PinPresetId }
): PinOverride | undefined {
  const presetId = styled.preset ?? defaultPresetForType(entityType);
  const base = PIN_PRESETS[presetId] ?? PIN_PRESETS.custom;
  const out: PinOverride = {};
  if (styled.preset && styled.preset !== defaultPresetForType(entityType)) out.preset = styled.preset;
  if (styled.color && styled.color !== base.color) out.color = styled.color;
  if (styled.icon && styled.icon !== base.icon) out.icon = styled.icon;
  if (styled.shape && styled.shape !== base.shape) out.shape = styled.shape;
  if (styled.labelMode && styled.labelMode !== base.labelMode) out.labelMode = styled.labelMode;
  if (styled.labelMinZoom !== undefined && styled.labelMinZoom !== base.labelMinZoom) out.labelMinZoom = styled.labelMinZoom;
  if (styled.priority !== undefined && styled.priority !== base.priority) out.priority = styled.priority;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Render an SVG pin glyph as an HTML string for Leaflet DivIcons. */
export function pinSvg(style: Pick<PinPreset, "color" | "shape">, opts?: { dim?: boolean; pulse?: boolean }): string {
  const fill = style.color;
  const stroke = "#0a0a0acc";
  const opacity = opts?.dim ? 0.6 : 1;
  const pulseStyle = opts?.pulse ? "animation: atlas-pulse 1.2s ease-in-out infinite;" : "";
  const common = `style="opacity:${opacity};${pulseStyle}filter:drop-shadow(0 2px 4px #0009);"`;
  switch (style.shape) {
    case "circle":
      return `<svg width="20" height="20" viewBox="-10 -10 20 20" ${common}><circle r="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
    case "square":
      return `<svg width="20" height="20" viewBox="-10 -10 20 20" ${common}><rect x="-7" y="-7" width="14" height="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
    case "diamond":
      return `<svg width="22" height="22" viewBox="-11 -11 22 22" ${common}><polygon points="0,-9 9,0 0,9 -9,0" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
    case "shield":
      return `<svg width="20" height="22" viewBox="-10 -11 20 22" ${common}><path d="M0,-9 L9,-6 L9,4 Q9,9 0,11 Q-9,9 -9,4 L-9,-6 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
    case "star":
      return `<svg width="22" height="22" viewBox="-11 -11 22 22" ${common}><polygon points="0,-10 2.94,-3.09 10,-3.09 4.27,1.18 6.18,8.09 0,4 -6.18,8.09 -4.27,1.18 -10,-3.09 -2.94,-3.09" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/></svg>`;
    case "teardrop":
    default:
      return `<svg width="20" height="20" viewBox="-10 -10 20 20" ${common}><path d="M0,-9 C5,-9 8,-5 8,0 C8,5 0,9 0,9 C0,9 -8,5 -8,0 C-8,-5 -5,-9 0,-9 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
  }
}
