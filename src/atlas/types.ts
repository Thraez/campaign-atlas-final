// Living Campaign Atlas — core types
export type Visibility = "public" | "discovered" | "rumored" | "hidden" | "dm" | "false_info";
export type RevealLevel = "unknown" | "rumored" | "seen_from_distance" | "visited" | "mapped";

export interface WorldSettings {
  id: string;
  name: string;
  width: number;
  height: number;
  wrapX: boolean;
  wrapY: boolean;
  oceanColor: string;
  units: "km" | "miles";
  kmPerWorldUnit: number;
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface MapLayer {
  id: string;
  type: "imageLayer";
  name: string;
  src: string;
  tileSrc?: string;
  x: number; y: number;
  width: number; height: number;
  rotation?: number;
  opacity: number;
  zIndex: number;
  minZoom?: number;
  maxZoom?: number;
  visibility: Visibility;
  locked?: boolean;
  group?: string;
  tags?: string[];
}

export type PinType =
  | "city" | "town" | "village" | "ruin" | "dungeon" | "cave" | "capital"
  | "fortress" | "temple" | "divine_site" | "resonance_site" | "faction_base"
  | "black_market" | "npc" | "shop" | "wilderness_landmark" | "portal"
  | "mystery" | "resource_deposit" | "player_base" | "battle_site" | "custom";

export interface Pin {
  id: string;
  type: PinType;
  name: string;
  x: number; y: number;
  visibility: Visibility;
  playerDescription?: string;
  dmDescription?: string;
  notePath?: string;
  image?: string;
  icon?: string; // optional custom icon (data URL or URL) overriding the type glyph
  tags?: string[];
  status?: string;
}

export type RegionShape = "polygon" | "circle" | "rectangle";
export interface Region {
  id: string;
  type: string;
  name: string;
  shape: RegionShape;
  points?: [number, number][];
  center?: [number, number];
  radius?: number;
  bounds?: [[number, number], [number, number]];
  fillColor: string;
  borderColor: string;
  opacity: number;
  labelZoomMin?: number;
  visibility: Visibility;
  description?: string;
  tags?: string[];
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  type: string;
  visibility: Visibility;
  label?: string;
  description?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  color?: string;
}

export interface PartyToken {
  id: string;
  name: string;
  x: number; y: number;
  icon?: string;
  color?: string;
  trailEnabled?: boolean;
  trail?: { x: number; y: number; label?: string; date?: string }[];
  visible?: boolean;
}

export interface FogReveal {
  id: string;
  shape: "circle" | "rectangle" | "polygon";
  x?: number; y?: number;
  radius?: number;
  bounds?: [[number, number], [number, number]];
  points?: [number, number][];
  revealLevel: RevealLevel;
}

export interface FogState {
  mode: "player" | "off";
  defaultState: "hidden" | "visible";
  revealedRegions: FogReveal[];
}

export interface TravelSpeeds { slow: number; normal: number; fast: number; unit: "miles_per_day" | "km_per_day"; }

export interface Route {
  id: string;
  name: string;
  points: [number, number][]; // world coords
  color?: string;
  style?: "solid" | "dashed" | "dotted";
  visibility: Visibility;
  description?: string;
}

export interface MapViewBookmark {
  id: string;
  name: string;
  x: number;
  y: number;
  zoom: number;
  description?: string;
}

export interface AtlasData {
  world: WorldSettings;
  layers: MapLayer[];
  pins: Pin[];
  regions: Region[];
  relations: Relation[];
  routes: Route[];
  party: PartyToken;
  fog: FogState;
  travelSpeeds: TravelSpeeds;
  terrainModifiers: Record<string, number>;
  viewBookmarks: MapViewBookmark[];
}

export const defaultAtlas = (): AtlasData => ({
  world: {
    id: "tidemarrow",
    name: "Tidemarrow",
    width: 200000,
    height: 100000,
    wrapX: true,
    wrapY: false,
    oceanColor: "#18313f",
    units: "km",
    kmPerWorldUnit: 0.2,
    defaultZoom: -2,
    minZoom: -6,
    maxZoom: 10,
  },
  layers: [],
  pins: [
    { id: "thornhold", type: "city", name: "Thornhold", x: 100000, y: 50000, visibility: "discovered",
      playerDescription: "A mining city built into red stone.", tags: ["city"] },
    { id: "ravens-vale", type: "village", name: "Raven's Vale", x: 70000, y: 30000, visibility: "public" },
    { id: "old-keep", type: "ruin", name: "The Old Keep", x: 130000, y: 60000, visibility: "rumored" },
    { id: "deeproot", type: "dungeon", name: "Deeproot Cavern", x: 90000, y: 70000, visibility: "dm" },
    { id: "sunhaven", type: "capital", name: "Sunhaven", x: 40000, y: 45000, visibility: "public" },
  ],
  regions: [],
  relations: [],
  routes: [],
  party: { id: "main-party", name: "The Party", x: 100000, y: 50000, color: "#f4c95d", trailEnabled: true, trail: [], visible: true },
  fog: { mode: "off", defaultState: "hidden", revealedRegions: [] },
  travelSpeeds: { slow: 18, normal: 24, fast: 30, unit: "miles_per_day" },
  terrainModifiers: { road: 1.0, plains: 1.2, forest: 1.5, hills: 1.6, mountains: 2.0, swamp: 2.2, desert: 1.8, magical_hazard: 2.5, sea: 1.0 },
  viewBookmarks: [],
});
